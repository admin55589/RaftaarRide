/**
 * rideQueue.ts — Driver Re-broadcast Queue with Progressive Radius + Women Safety Mode
 *
 * Flow:
 *  1. POST /rides creates ride in "searching" status
 *  2. startRideBroadcast() begins at RADIUS_TIERS_KM[0] = 5km
 *  3. findNextDriver() filters candidates within current radius
 *  4. If no driver within radius → expand to next tier, emit ride:radius_expanded to user
 *  5. Women Safety Mode: prefers female drivers first; after FEMALE_ONLY_MAX_ATTEMPTS
 *     with no female found → emits ride:no_female_driver asking user preference
 *  6. Driver taps Accept → onDriverAccept() → assigns driver, emits ride:status accepted
 *  7. Driver taps Reject (or 20s timeout) → onDriverReject() → tries next
 *  8. After MAX_ATTEMPTS → emit ride:no_driver
 */

import { db } from "@workspace/db";
import { ridesTable, driversTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { sendPushNotification } from "./expoPush";
import type { Server as IOServer } from "socket.io";

const MAX_ATTEMPTS = 5;
const DRIVER_TIMEOUT_MS = 20_000;
const RADIUS_TIERS_KM = [5, 10, 20];

/* After this many female-only search cycles with no result → ask user */
const FEMALE_ONLY_MAX_ATTEMPTS = 3;

let _io: IOServer | null = null;
export function setSocketIO(io: IOServer) { _io = io; }

function emitToDriver(driverId: number, event: string, data: unknown) {
  _io?.to(`driver:${driverId}`).emit(event, data);
}
function emitRideUpdate(rideId: number, event: string, data: unknown) {
  _io?.to(`ride:${rideId}`).emit(event, data);
}
function emitAdminUpdate(event: string, data: unknown) {
  _io?.emit(event, data);
}

interface QueueEntry {
  vehicleType: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupAddress: string;
  dropAddress: string;
  price: number;
  userId: number;
  distanceKm?: string;
  rejectedIds: Set<number>;
  currentDriverId: number | null;
  attempt: number;
  timer: NodeJS.Timeout | null;
  /* Radius expansion */
  radiusTierIndex: number;
  searchRadiusKm: number;
  /* Women safety */
  womenSafetyMode: boolean;
  maleFallbackEnabled: boolean;
  femaleOnlyAttempts: number;
}

const queues = new Map<number, QueueEntry>();

/* ─── Cancel / cleanup ─────────────────────────────────────────────── */
export function cancelQueue(rideId: number) {
  const entry = queues.get(rideId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.currentDriverId) {
    db.update(driversTable)
      .set({ isOnline: true })
      .where(eq(driversTable.id, entry.currentDriverId!))
      .catch(() => {});
  }
  queues.delete(rideId);
  logger.info({ rideId }, "[rideQueue] queue cancelled");
}

/* ─── Haversine distance helper (km) ──────────────────────────────── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Find nearest available driver within radius ───────────────────── */
async function findNextDriver(
  vehicleType: string,
  pickupLat?: number,
  pickupLng?: number,
  excludeIds: number[] = [],
  maxRadiusKm?: number,
  femaleOnly?: boolean,
): Promise<{ driver: typeof driversTable.$inferSelect; etaMinutes: number; distKm: number } | null> {
  const candidates = await db
    .select()
    .from(driversTable)
    .where(and(
      eq(driversTable.vehicleType, vehicleType),
      eq(driversTable.isOnline, true),
      eq(driversTable.status, "active"),
    ))
    .limit(50);

  let eligible = candidates.filter((d) => !excludeIds.includes(d.id));

  /* Women safety mode: filter to female drivers only */
  if (femaleOnly) {
    eligible = eligible.filter((d) => (d as any).gender?.toLowerCase() === "female");
  }

  if (eligible.length === 0) return null;

  const DEFAULT_ETA = 5;

  if (pickupLat && pickupLng) {
    const withDist = eligible.map((d) => {
      if (!d.driverLat || !d.driverLng) return { driver: d, distKm: Infinity };
      const dLat = parseFloat(String(d.driverLat));
      const dLng = parseFloat(String(d.driverLng));
      const distKm = haversineKm(pickupLat, pickupLng, dLat, dLng);
      return { driver: d, distKm };
    });

    const inRadius = maxRadiusKm !== undefined && isFinite(maxRadiusKm)
      ? withDist.filter((x) => x.distKm <= maxRadiusKm)
      : withDist;

    if (inRadius.length === 0) return null;

    inRadius.sort((a, b) => a.distKm - b.distKm);
    const { driver, distKm } = inRadius[0];
    const etaMinutes = isFinite(distKm)
      ? Math.min(45, Math.max(1, Math.round((distKm / 20) * 60)))
      : DEFAULT_ETA;

    return { driver, etaMinutes, distKm };
  }

  return { driver: eligible[0], etaMinutes: DEFAULT_ETA, distKm: 0 };
}

/* ─── Internal: offer ride to next driver ──────────────────────────── */
async function broadcastToNext(rideId: number): Promise<void> {
  const entry = queues.get(rideId);
  if (!entry) return;

  if (entry.attempt >= MAX_ATTEMPTS) {
    logger.info({ rideId, attempts: entry.attempt }, "[rideQueue] max attempts reached");
    queues.delete(rideId);
    emitRideUpdate(rideId, "ride:no_driver", { rideId });
    return;
  }

  const currentRadius = isFinite(entry.searchRadiusKm) ? entry.searchRadiusKm : undefined;

  /* Determine if we should search female-only */
  const femaleOnly = entry.womenSafetyMode && !entry.maleFallbackEnabled;

  const result = await findNextDriver(
    entry.vehicleType,
    entry.pickupLat,
    entry.pickupLng,
    [...entry.rejectedIds],
    currentRadius,
    femaleOnly,
  );

  if (!result) {
    /* ── Women Safety: no female driver found ── */
    if (femaleOnly) {
      entry.femaleOnlyAttempts++;

      if (entry.femaleOnlyAttempts >= FEMALE_ONLY_MAX_ATTEMPTS) {
        /* Exhausted female-only search — ask user if male driver is OK */
        logger.info({ rideId, attempts: entry.femaleOnlyAttempts }, "[rideQueue] no female drivers, asking user");
        emitRideUpdate(rideId, "ride:no_female_driver", {
          rideId,
          message: "Is waqt aapke area mein koi female driver available nahi hai. Kya aap male driver se ride lena chahenge?",
        });
        /* Pause — wait for user response (allowMaleDrivers or cancel) */
        /* Do NOT start timer — queue stays alive but dormant */
        return;
      }

      /* Still within female-only attempts: try radius expansion or wait */
      if (entry.pickupLat && entry.pickupLng && entry.radiusTierIndex < RADIUS_TIERS_KM.length - 1) {
        const prevRadius = RADIUS_TIERS_KM[entry.radiusTierIndex];
        entry.radiusTierIndex++;
        const newRadius = RADIUS_TIERS_KM[entry.radiusTierIndex];
        entry.searchRadiusKm = newRadius;

        emitRideUpdate(rideId, "ride:radius_expanded", {
          rideId,
          prevRadiusKm: prevRadius,
          newRadiusKm: newRadius,
          message: `${prevRadius}km mein koi female driver nahi, ${newRadius}km tak dhundh rahe hain...`,
        });

        await broadcastToNext(rideId);
        return;
      }

      /* Retry after 10s without counting as main attempt */
      entry.timer = setTimeout(() => {
        broadcastToNext(rideId).catch((err) =>
          logger.error({ err, rideId }, "[rideQueue] broadcastToNext error"),
        );
      }, 10_000);
      return;
    }

    /* ── Regular: no driver within current radius ── */
    if (entry.pickupLat && entry.pickupLng && entry.radiusTierIndex < RADIUS_TIERS_KM.length - 1) {
      const prevRadius = RADIUS_TIERS_KM[entry.radiusTierIndex];
      entry.radiusTierIndex++;
      const newRadius = RADIUS_TIERS_KM[entry.radiusTierIndex];
      entry.searchRadiusKm = newRadius;

      logger.info({ rideId, prevRadius, newRadius }, "[rideQueue] no drivers in radius, expanding search");

      emitRideUpdate(rideId, "ride:radius_expanded", {
        rideId,
        prevRadiusKm: prevRadius,
        newRadiusKm: newRadius,
        message: `${prevRadius}km mein koi ${entry.vehicleType} nahi, ${newRadius}km tak dhundh rahe hain...`,
      });

      await broadcastToNext(rideId);
      return;
    }

    if (entry.pickupLat && entry.pickupLng && entry.searchRadiusKm === RADIUS_TIERS_KM[RADIUS_TIERS_KM.length - 1]) {
      const prevRadius = entry.searchRadiusKm;
      entry.searchRadiusKm = Infinity;

      emitRideUpdate(rideId, "ride:radius_expanded", {
        rideId,
        prevRadiusKm: prevRadius,
        newRadiusKm: null,
        message: `${prevRadius}km mein koi nahi — poore city mein dhundh rahe hain...`,
      });
    }

    entry.attempt++;
    entry.timer = setTimeout(() => {
      broadcastToNext(rideId).catch((err) =>
        logger.error({ err, rideId }, "[rideQueue] broadcastToNext error"),
      );
    }, 10_000);
    logger.info(
      { rideId, attempt: entry.attempt, radius: entry.searchRadiusKm },
      "[rideQueue] no available drivers, retrying in 10s",
    );
    return;
  }

  const { driver, etaMinutes, distKm } = result;
  entry.attempt++;
  entry.currentDriverId = driver.id;

  await db.update(driversTable).set({ isOnline: false }).where(eq(driversTable.id, driver.id));

  logger.info(
    { rideId, driverId: driver.id, attempt: entry.attempt, eta: etaMinutes, distKm: distKm.toFixed(1), radius: entry.searchRadiusKm, femaleOnly },
    "[rideQueue] offer sent to driver",
  );

  emitToDriver(driver.id, "driver:new_ride", {
    id: String(rideId),
    rideId,
    from: entry.pickupAddress,
    to: entry.dropAddress,
    distance: entry.distanceKm ? `${parseFloat(entry.distanceKm).toFixed(1)} km` : "—",
    price: entry.price,
    eta: etaMinutes,
    userName: "Passenger",
    pickupLat: entry.pickupLat ?? null,
    pickupLng: entry.pickupLng ?? null,
  });

  if (driver.pushToken) {
    await sendPushNotification({
      to: driver.pushToken,
      title: "🚖 Naya Ride Request!",
      body: `${entry.pickupAddress} → ${entry.dropAddress} — ₹${entry.price}`,
      data: { screen: "DriverMode", rideId, type: "new_ride" },
      priority: "high",
    });
  }

  entry.timer = setTimeout(() => {
    logger.info({ rideId, driverId: driver.id }, "[rideQueue] driver 20s timeout, trying next");
    onDriverReject(rideId, driver.id).catch((err) =>
      logger.error({ err, rideId }, "[rideQueue] onDriverReject error"),
    );
  }, DRIVER_TIMEOUT_MS);
}

/* ─── Public API ───────────────────────────────────────────────────── */

export async function startRideBroadcast(
  rideId: number,
  details: {
    vehicleType: string;
    pickupLat?: number;
    pickupLng?: number;
    pickupAddress: string;
    dropAddress: string;
    price: number;
    userId: number;
    distanceKm?: string;
    womenSafetyMode?: boolean;
  },
): Promise<void> {
  cancelQueue(rideId);

  queues.set(rideId, {
    vehicleType: details.vehicleType,
    pickupLat: details.pickupLat,
    pickupLng: details.pickupLng,
    pickupAddress: details.pickupAddress,
    dropAddress: details.dropAddress,
    price: details.price,
    userId: details.userId,
    distanceKm: details.distanceKm,
    rejectedIds: new Set(),
    currentDriverId: null,
    attempt: 0,
    timer: null,
    radiusTierIndex: 0,
    searchRadiusKm: RADIUS_TIERS_KM[0],
    womenSafetyMode: details.womenSafetyMode ?? false,
    maleFallbackEnabled: false,
    femaleOnlyAttempts: 0,
  });

  await broadcastToNext(rideId);
}

/* Called when user confirms "yes, male driver is OK" */
export async function allowMaleDrivers(rideId: number): Promise<void> {
  const entry = queues.get(rideId);
  if (!entry) return;
  entry.maleFallbackEnabled = true;
  /* Reset radius to search fresh */
  entry.radiusTierIndex = 0;
  entry.searchRadiusKm = RADIUS_TIERS_KM[0];
  logger.info({ rideId }, "[rideQueue] user allowed male drivers, resuming search");
  await broadcastToNext(rideId);
}

export async function onDriverReject(rideId: number, driverId: number): Promise<void> {
  const entry = queues.get(rideId);
  if (!entry) return;

  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  entry.currentDriverId = null;
  entry.rejectedIds.add(driverId);

  await db.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, driverId));

  logger.info(
    { rideId, driverId, totalRejected: entry.rejectedIds.size },
    "[rideQueue] driver rejected, trying next",
  );

  await broadcastToNext(rideId);
}

export async function onDriverAccept(
  rideId: number,
  driverId: number,
): Promise<{ driver: object | null; pin: number } | null> {
  const entry = queues.get(rideId);

  if (entry?.timer) clearTimeout(entry.timer);
  queues.delete(rideId);

  const completionPin = 1000 + Math.floor(Math.random() * 9000);

  /* Atomic: FOR UPDATE + transaction prevents two drivers from simultaneously
     passing the status check and both getting assigned to the same ride */
  const updatedRide = await db.transaction(async (tx) => {
    const [existingRide] = await tx
      .select({ id: ridesTable.id, status: ridesTable.status })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .for("update")
      .limit(1);

    if (!existingRide || existingRide.status !== "searching") {
      await tx.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, driverId));
      logger.warn(
        { rideId, driverId, status: existingRide?.status },
        "[rideQueue] accept: ride no longer in searching state",
      );
      return null;
    }

    const [updated] = await tx
      .update(ridesTable)
      .set({ driverId, status: "accepted", completionPin })
      .where(eq(ridesTable.id, rideId))
      .returning();

    return updated ?? null;
  });

  if (!updatedRide) return null;

  const [driver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.id, driverId))
    .limit(1);

  const vehicleEmojiMap: Record<string, string> = {
    bike: "🏍️", auto: "🛺", cab: "🚗", prime: "⭐🚗", suv: "🚐",
  };

  const driverPayload = driver
    ? {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        photoUrl: driver.photoUrl ?? null,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        vehicle: vehicleEmojiMap[driver.vehicleType] ?? "🚗",
        rating: driver.rating,
        eta: 5,
      }
    : null;

  emitRideUpdate(rideId, "ride:status", { rideId, status: "accepted", driver: driverPayload });
  emitRideUpdate(rideId, "ride:pin", { rideId, pin: completionPin });
  emitAdminUpdate("admin:ride:updated", { rideId, status: "accepted", driverId });

  if (updatedRide.userId) {
    const [rideUser] = await db
      .select({ pushToken: usersTable.pushToken, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, updatedRide.userId))
      .limit(1);

    if (rideUser?.pushToken) {
      await sendPushNotification({
        to: rideUser.pushToken,
        title: `🚖 Driver Mil Gaya! — ${driver?.name ?? "Driver"}`,
        body: `PIN: ${completionPin} • ${driver?.vehicleNumber ?? ""} aa raha hai`,
        data: { type: "ride_accepted", rideId, pin: completionPin },
      });
    }
  }

  logger.info(
    { rideId, driverId, pin: completionPin },
    "[rideQueue] driver accepted, ride assigned in DB",
  );

  return { driver: driverPayload, pin: completionPin };
}
