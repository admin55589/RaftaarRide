/**
 * rideQueue.ts — Driver Re-broadcast Queue with Progressive Radius Expansion
 *
 * Flow:
 *  1. POST /rides creates ride in "searching" status
 *  2. startRideBroadcast() begins at RADIUS_TIERS_KM[0] = 5km
 *  3. findNextDriver() filters candidates within current radius
 *  4. If no driver within radius → expand to next tier, emit ride:radius_expanded to user
 *  5. Driver taps Accept → POST /driver-auth/rides/:id/accept → onDriverAccept()
 *     → assigns driver in DB, emits ride:status "accepted" to user
 *  6. Driver taps Reject (or 20s timeout) → onDriverReject()
 *     → tries next nearest driver (skipping rejected), up to MAX_ATTEMPTS
 *  7. After MAX_ATTEMPTS with no takers → emit ride:no_driver
 */

import { db } from "@workspace/db";
import { ridesTable, driversTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { sendPushNotification } from "./expoPush";
import type { Server as IOServer } from "socket.io";

const MAX_ATTEMPTS = 5;
const DRIVER_TIMEOUT_MS = 20_000; // 20 seconds per driver offer

/* Progressive radius tiers in km — after last tier, search is unlimited */
const RADIUS_TIERS_KM = [5, 10, 20];

/* Injected by index.ts after socket is initialised */
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
  radiusTierIndex: number;   // index into RADIUS_TIERS_KM (starts at 0 = 5km)
  searchRadiusKm: number;    // current max radius in km (Infinity = unlimited)
}

/* rideId → active queue entry */
const queues = new Map<number, QueueEntry>();

/* ─── Cancel / cleanup ─────────────────────────────────────────────── */
export function cancelQueue(rideId: number) {
  const entry = queues.get(rideId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  /* Put currently-offered driver back online */
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

  const eligible = candidates.filter((d) => !excludeIds.includes(d.id));
  if (eligible.length === 0) return null;

  const DEFAULT_ETA = 5;

  if (pickupLat && pickupLng) {
    /* Calculate distance for each candidate and filter by radius */
    const withDist = eligible.map((d) => {
      if (!d.driverLat || !d.driverLng) return { driver: d, distKm: Infinity };
      const dLat = parseFloat(String(d.driverLat));
      const dLng = parseFloat(String(d.driverLng));
      const distKm = haversineKm(pickupLat, pickupLng, dLat, dLng);
      return { driver: d, distKm };
    });

    /* Apply radius filter if specified */
    const inRadius = maxRadiusKm !== undefined && isFinite(maxRadiusKm)
      ? withDist.filter((x) => x.distKm <= maxRadiusKm)
      : withDist;

    if (inRadius.length === 0) return null;

    /* Pick nearest */
    inRadius.sort((a, b) => a.distKm - b.distKm);
    const { driver, distKm } = inRadius[0];
    const etaMinutes = isFinite(distKm)
      ? Math.min(45, Math.max(1, Math.round((distKm / 20) * 60)))
      : DEFAULT_ETA;

    return { driver, etaMinutes, distKm };
  }

  /* No GPS → return first eligible (no radius filter possible) */
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

  const result = await findNextDriver(
    entry.vehicleType,
    entry.pickupLat,
    entry.pickupLng,
    [...entry.rejectedIds],
    currentRadius,
  );

  if (!result) {
    /* No driver within current radius */
    if (entry.pickupLat && entry.pickupLng && entry.radiusTierIndex < RADIUS_TIERS_KM.length - 1) {
      /* Expand to next radius tier */
      const prevRadius = RADIUS_TIERS_KM[entry.radiusTierIndex];
      entry.radiusTierIndex++;
      const newRadius = RADIUS_TIERS_KM[entry.radiusTierIndex];
      entry.searchRadiusKm = newRadius;

      logger.info(
        { rideId, prevRadius, newRadius },
        "[rideQueue] no drivers in radius, expanding search",
      );

      emitRideUpdate(rideId, "ride:radius_expanded", {
        rideId,
        prevRadiusKm: prevRadius,
        newRadiusKm: newRadius,
        message: `${prevRadius}km mein koi ${entry.vehicleType} nahi, ${newRadius}km tak dhundh rahe hain...`,
      });

      /* Retry immediately with expanded radius (no attempt count increment) */
      await broadcastToNext(rideId);
      return;
    }

    if (entry.pickupLat && entry.pickupLng && entry.searchRadiusKm === RADIUS_TIERS_KM[RADIUS_TIERS_KM.length - 1]) {
      /* All tiers exhausted — go unlimited for remaining attempts */
      const prevRadius = entry.searchRadiusKm;
      entry.searchRadiusKm = Infinity;

      logger.info({ rideId, prevRadius }, "[rideQueue] all radius tiers exhausted, searching unlimited");

      emitRideUpdate(rideId, "ride:radius_expanded", {
        rideId,
        prevRadiusKm: prevRadius,
        newRadiusKm: null,
        message: `${prevRadius}km mein koi nahi — poore city mein dhundh rahe hain...`,
      });
    }

    /* No drivers anywhere — wait 10s and retry (count as attempt) */
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

  /* Take driver temporarily offline so they can't get double-assigned */
  await db.update(driversTable).set({ isOnline: false }).where(eq(driversTable.id, driver.id));

  logger.info(
    { rideId, driverId: driver.id, attempt: entry.attempt, eta: etaMinutes, distKm: distKm.toFixed(1), radiusKm: entry.searchRadiusKm },
    "[rideQueue] offer sent to driver",
  );

  /* Emit ride card to driver's socket room */
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

  /* Push notification to driver */
  if (driver.pushToken) {
    await sendPushNotification({
      to: driver.pushToken,
      title: "🚖 Naya Ride Request!",
      body: `${entry.pickupAddress} → ${entry.dropAddress} — ₹${entry.price}`,
      data: { screen: "DriverMode", rideId, type: "new_ride" },
      priority: "high",
    });
  }

  /* 20-second timeout — treat non-response as reject */
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
  },
): Promise<void> {
  cancelQueue(rideId);

  queues.set(rideId, {
    ...details,
    rejectedIds: new Set(),
    currentDriverId: null,
    attempt: 0,
    timer: null,
    radiusTierIndex: 0,
    searchRadiusKm: RADIUS_TIERS_KM[0], // start at 5km
  });

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

  const [existingRide] = await db
    .select()
    .from(ridesTable)
    .where(eq(ridesTable.id, rideId))
    .limit(1);

  if (!existingRide || existingRide.status !== "searching") {
    await db.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, driverId));
    logger.warn(
      { rideId, driverId, status: existingRide?.status },
      "[rideQueue] accept: ride no longer in searching state",
    );
    return null;
  }

  const completionPin = 1000 + Math.floor(Math.random() * 9000);

  const [updatedRide] = await db
    .update(ridesTable)
    .set({ driverId, status: "accepted", completionPin })
    .where(eq(ridesTable.id, rideId))
    .returning();

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
