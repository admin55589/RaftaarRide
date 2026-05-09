/**
 * rideQueue.ts — Driver Re-broadcast Queue
 *
 * Flow:
 *  1. POST /rides creates ride in "searching" status
 *  2. startRideBroadcast() finds nearest available driver, emits driver:new_ride
 *  3. Driver taps Accept → POST /driver-auth/rides/:id/accept → onDriverAccept()
 *     → assigns driver in DB, emits ride:status "accepted" to user
 *  4. Driver taps Reject (or 20s timeout) → onDriverReject()
 *     → tries next nearest driver (skipping rejected), up to MAX_ATTEMPTS
 *  5. After MAX_ATTEMPTS with no takers → ride stays "searching" (cron auto-cancels at 10min)
 */

import { db } from "@workspace/db";
import { ridesTable, driversTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { sendPushNotification } from "./expoPush";
import type { Server as IOServer } from "socket.io";

const MAX_ATTEMPTS = 5;
const DRIVER_TIMEOUT_MS = 20_000; // 20 seconds

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

/* ─── Find nearest available driver (excluding rejected ones) ───────── */
async function findNextDriver(
  vehicleType: string,
  pickupLat?: number,
  pickupLng?: number,
  excludeIds: number[] = [],
): Promise<{ driver: typeof driversTable.$inferSelect; etaMinutes: number } | null> {
  const candidates = await db
    .select()
    .from(driversTable)
    .where(and(
      eq(driversTable.vehicleType, vehicleType),
      eq(driversTable.isOnline, true),
      eq(driversTable.status, "active"),
    ))
    .limit(20);

  const eligible = candidates.filter((d) => !excludeIds.includes(d.id));
  if (eligible.length === 0) return null;

  const DEFAULT_ETA = 5;

  if (pickupLat && pickupLng) {
    let nearest = eligible[0];
    let minDist = Infinity;
    for (const d of eligible) {
      if (d.driverLat && d.driverLng) {
        const dLat = parseFloat(String(d.driverLat));
        const dLng = parseFloat(String(d.driverLng));
        const latDiff = dLat - pickupLat;
        const lngDiff = dLng - pickupLng;
        const avgLat = (dLat + pickupLat) / 2;
        const kmLat = latDiff * 111.0;
        const kmLng = lngDiff * 111.0 * Math.cos((avgLat * Math.PI) / 180);
        const dist = Math.sqrt(kmLat * kmLat + kmLng * kmLng);
        if (dist < minDist) { minDist = dist; nearest = d; }
      }
    }
    const etaMinutes =
      minDist === Infinity
        ? DEFAULT_ETA
        : Math.min(20, Math.max(1, Math.round((minDist / 20) * 60)));
    return { driver: nearest, etaMinutes };
  }

  return { driver: eligible[0], etaMinutes: DEFAULT_ETA };
}

/* ─── Internal: offer ride to next driver ──────────────────────────── */
async function broadcastToNext(rideId: number): Promise<void> {
  const entry = queues.get(rideId);
  if (!entry) return;

  if (entry.attempt >= MAX_ATTEMPTS) {
    logger.info({ rideId, attempts: entry.attempt }, "[rideQueue] max attempts reached");
    queues.delete(rideId);
    /* Emit to user so SearchingScreen knows to show "no driver" message */
    emitRideUpdate(rideId, "ride:no_driver", { rideId });
    return;
  }

  const result = await findNextDriver(
    entry.vehicleType,
    entry.pickupLat,
    entry.pickupLng,
    [...entry.rejectedIds],
  );

  if (!result) {
    /* No drivers online right now — wait 10s and retry */
    entry.attempt++;
    entry.timer = setTimeout(() => {
      broadcastToNext(rideId).catch((err) =>
        logger.error({ err, rideId }, "[rideQueue] broadcastToNext error"),
      );
    }, 10_000);
    logger.info(
      { rideId, attempt: entry.attempt, excluded: entry.rejectedIds.size },
      "[rideQueue] no available drivers, retrying in 10s",
    );
    return;
  }

  const { driver, etaMinutes } = result;
  entry.attempt++;
  entry.currentDriverId = driver.id;

  /* Take driver temporarily offline so they can't get double-assigned */
  await db.update(driversTable).set({ isOnline: false }).where(eq(driversTable.id, driver.id));

  logger.info(
    { rideId, driverId: driver.id, attempt: entry.attempt, eta: etaMinutes },
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
  /* Cancel any existing queue for this rideId (safety) */
  cancelQueue(rideId);

  queues.set(rideId, {
    ...details,
    rejectedIds: new Set(),
    currentDriverId: null,
    attempt: 0,
    timer: null,
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

  /* Put driver back online */
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

  /* Clear timer regardless */
  if (entry?.timer) clearTimeout(entry.timer);
  queues.delete(rideId);

  /* Verify ride is still in "searching" state */
  const [existingRide] = await db
    .select()
    .from(ridesTable)
    .where(eq(ridesTable.id, rideId))
    .limit(1);

  if (!existingRide || existingRide.status !== "searching") {
    /* Ride was cancelled or already assigned — put driver back online */
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

  /* Driver stays offline (busy with ride) */

  /* Fetch driver details */
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

  /* Emit to user's ride room: driver found! */
  emitRideUpdate(rideId, "ride:status", { rideId, status: "accepted", driver: driverPayload });
  emitRideUpdate(rideId, "ride:pin", { rideId, pin: completionPin });
  emitAdminUpdate("admin:ride:updated", { rideId, status: "accepted", driverId });

  /* Push notification to user */
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
