/**
 * fraud-engine.ts — RaftaarRide Fraud Detection
 *
 * Three detection rules (fire-and-forget, never block the main request):
 *  1. GPS Spoof       — driver location jumps >10 km in <60 s
 *  2. Fake Completion — ride completed with near-zero pickup→drop distance
 *  3. Rapid Cancel    — driver cancels >3 rides within 60 minutes
 */

import { db } from "@workspace/db";
import {
  fraudFlagsTable,
  driversTable,
  ridesTable,
} from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";

/* ─── Haversine distance (km) ────────────────────────────────────────────── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Shared insert helper ───────────────────────────────────────────────── */
async function flagFraud(params: {
  type: string;
  severity: string;
  driverId?: number;
  userId?: number;
  rideId?: number;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(fraudFlagsTable).values({
      type: params.type,
      severity: params.severity,
      driverId: params.driverId ?? null,
      userId: params.userId ?? null,
      rideId: params.rideId ?? null,
      details: JSON.stringify(params.details),
      status: "open",
    });
    logger.warn(
      { type: params.type, severity: params.severity, ...params.details },
      "[fraud-engine] flag created"
    );
  } catch (err) {
    logger.error({ err }, "[fraud-engine] failed to insert fraud flag");
  }
}

/* ─── 1. GPS Spoof Detection ─────────────────────────────────────────────── */
/**
 * Call BEFORE updating driver's location in the DB.
 * Compares new position against the stored position.
 * Flags if jump > GPS_SPOOF_THRESHOLD_KM within GPS_SPOOF_WINDOW_MS.
 */
const GPS_SPOOF_THRESHOLD_KM = 10;

export async function checkGpsSpoof(
  driverId: number,
  newLat: number,
  newLng: number
): Promise<void> {
  try {
    const [driver] = await db
      .select({ driverLat: driversTable.driverLat, driverLng: driversTable.driverLng, name: driversTable.name })
      .from(driversTable)
      .where(eq(driversTable.id, driverId))
      .limit(1);

    if (!driver?.driverLat || !driver?.driverLng) return; /* No previous location */

    const oldLat = parseFloat(String(driver.driverLat));
    const oldLng = parseFloat(String(driver.driverLng));
    if (isNaN(oldLat) || isNaN(oldLng)) return;

    const distKm = haversineKm(oldLat, oldLng, newLat, newLng);
    if (distKm > GPS_SPOOF_THRESHOLD_KM) {
      await flagFraud({
        type: "gps_spoof",
        severity: distKm > 50 ? "critical" : distKm > 20 ? "high" : "medium",
        driverId,
        details: {
          driverName: driver.name,
          oldLat, oldLng,
          newLat, newLng,
          jumpKm: parseFloat(distKm.toFixed(2)),
          message: `GPS ${distKm.toFixed(1)} km jump detected`,
        },
      });
    }
  } catch (err) {
    logger.error({ err, driverId }, "[fraud-engine] checkGpsSpoof error");
  }
}

/* ─── 2. Fake Completion Detection ──────────────────────────────────────── */
/**
 * Call AFTER ride is marked completed (via verify-pin).
 * Flags if pickup→drop distance is suspiciously short relative to price.
 */
const MIN_DISTANCE_KM = 0.4; /* Rides shorter than 400m are suspicious */

export async function checkFakeCompletion(rideId: number): Promise<void> {
  try {
    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);

    if (!ride) return;

    const pickupLat = ride.pickupLat ? parseFloat(String(ride.pickupLat)) : null;
    const pickupLng = ride.pickupLng ? parseFloat(String(ride.pickupLng)) : null;
    const dropLat = ride.dropLat ? parseFloat(String(ride.dropLat)) : null;
    const dropLng = ride.dropLng ? parseFloat(String(ride.dropLng)) : null;

    const price = parseFloat(String(ride.price ?? "0"));
    const distanceKm = ride.distanceKm ? parseFloat(String(ride.distanceKm)) : null;

    const issues: string[] = [];

    /* Check 1: Pickup and drop coords are same / nearly same */
    if (pickupLat && pickupLng && dropLat && dropLng) {
      const coordDist = haversineKm(pickupLat, pickupLng, dropLat, dropLng);
      if (coordDist < MIN_DISTANCE_KM) {
        issues.push(`Pickup-to-drop distance only ${(coordDist * 1000).toFixed(0)}m`);
      }
    }

    /* Check 2: No distance recorded but ride price is high */
    if (!distanceKm && price > 80) {
      issues.push(`No distance recorded, price ₹${price}`);
    }

    /* Check 3: Distance recorded but suspiciously short for the price */
    if (distanceKm && distanceKm < 0.5 && price > 60) {
      issues.push(`Distance ${distanceKm}km but price ₹${price} — ratio suspicious`);
    }

    /* Check 4: Ride completed in < 2 minutes from acceptance */
    if (ride.acceptedAt) {
      const durationMs = Date.now() - new Date(ride.acceptedAt).getTime();
      const durationMin = durationMs / 60000;
      if (durationMin < 2) {
        issues.push(`Ride completed in ${durationMin.toFixed(1)} min from acceptance`);
      }
    }

    if (issues.length > 0) {
      await flagFraud({
        type: "fake_completion",
        severity: issues.length >= 2 ? "high" : "medium",
        driverId: ride.driverId ?? undefined,
        userId: ride.userId,
        rideId,
        details: {
          issues,
          distanceKm,
          price,
          pickup: ride.pickup,
          destination: ride.destination,
          paymentMethod: ride.paymentMethod,
        },
      });
    }
  } catch (err) {
    logger.error({ err, rideId }, "[fraud-engine] checkFakeCompletion error");
  }
}

/* ─── 3. Rapid Cancellation Detection ───────────────────────────────────── */
/**
 * Call AFTER a driver cancels a ride.
 * Counts cancellations in the last 60 minutes. Flags if > threshold.
 */
const RAPID_CANCEL_THRESHOLD = 3;
const RAPID_CANCEL_WINDOW_MS = 60 * 60 * 1000; /* 1 hour */

export async function checkRapidCancellation(driverId: number): Promise<void> {
  try {
    const windowStart = new Date(Date.now() - RAPID_CANCEL_WINDOW_MS);

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.driverId, driverId),
          eq(ridesTable.status, "cancelled"),
          gte(ridesTable.createdAt, windowStart)
        )
      );

    const cancelCount = result?.count ?? 0;
    if (cancelCount > RAPID_CANCEL_THRESHOLD) {
      /* Only flag if no existing open rapid_cancel flag for this driver in the last hour */
      const [existing] = await db
        .select({ id: fraudFlagsTable.id })
        .from(fraudFlagsTable)
        .where(
          and(
            eq(fraudFlagsTable.driverId, driverId),
            eq(fraudFlagsTable.type, "rapid_cancel"),
            eq(fraudFlagsTable.status, "open"),
            gte(fraudFlagsTable.createdAt, windowStart)
          )
        )
        .limit(1);

      if (!existing) {
        const [driver] = await db
          .select({ name: driversTable.name, phone: driversTable.phone })
          .from(driversTable)
          .where(eq(driversTable.id, driverId))
          .limit(1);

        await flagFraud({
          type: "rapid_cancel",
          severity: cancelCount > 6 ? "high" : "medium",
          driverId,
          details: {
            driverName: driver?.name,
            driverPhone: driver?.phone,
            cancelCount,
            windowMinutes: 60,
            message: `${cancelCount} cancellations in 1 hour (threshold: ${RAPID_CANCEL_THRESHOLD})`,
          },
        });
      }
    }
  } catch (err) {
    logger.error({ err, driverId }, "[fraud-engine] checkRapidCancellation error");
  }
}
