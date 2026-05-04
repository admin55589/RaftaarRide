import { db } from "@workspace/db";
import { ridesTable, scheduledRidesTable, driversTable, usersTable } from "@workspace/db/schema";
import { eq, and, lte, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { emitRideUpdate, emitToDriver } from "./socket";
import { sendPushNotification } from "./expoPush";

const AUTO_CANCEL_MINUTES = 10;

async function autoCancelStaleRides() {
  try {
    const cutoff = new Date(Date.now() - AUTO_CANCEL_MINUTES * 60 * 1000);
    const stale = await db
      .select({ id: ridesTable.id, userId: ridesTable.userId, pickup: ridesTable.pickup })
      .from(ridesTable)
      .where(and(eq(ridesTable.status, "searching"), lte(ridesTable.createdAt, cutoff)));

    if (stale.length === 0) return;

    const ids = stale.map((r) => r.id);
    await db.update(ridesTable).set({ status: "cancelled" }).where(inArray(ridesTable.id, ids));

    for (const ride of stale) {
      emitRideUpdate(ride.id, "ride:status", { rideId: ride.id, status: "cancelled" });

      if (ride.userId) {
        const [user] = await db
          .select({ pushToken: usersTable.pushToken })
          .from(usersTable)
          .where(eq(usersTable.id, ride.userId))
          .limit(1);
        if (user?.pushToken) {
          await sendPushNotification({
            to: user.pushToken,
            title: "Ride Cancel Ho Gayi",
            body: `Koi driver nahi mila — ${ride.pickup} ke liye. Dobara try karein.`,
            data: { type: "ride_cancelled" },
          });
        }
      }
    }

    logger.info({ count: ids.length }, "Auto-cancelled stale searching rides");
  } catch (err) {
    logger.error({ err }, "autoCancelStaleRides error");
  }
}

async function autoDispatchScheduledRides() {
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(scheduledRidesTable)
      .where(and(eq(scheduledRidesTable.status, "pending"), lte(scheduledRidesTable.scheduledAt, now)));

    if (due.length === 0) return;

    for (const scheduled of due) {
      await db
        .update(scheduledRidesTable)
        .set({ status: "dispatching" })
        .where(eq(scheduledRidesTable.id, scheduled.id));

      const [driver] = await db
        .select({ id: driversTable.id, name: driversTable.name, pushToken: driversTable.pushToken })
        .from(driversTable)
        .where(
          and(
            eq(driversTable.vehicleType, scheduled.vehicleType),
            eq(driversTable.isOnline, true),
            eq(driversTable.status, "active")
          )
        )
        .limit(1);

      if (!driver) {
        await db
          .update(scheduledRidesTable)
          .set({ status: "no_driver" })
          .where(eq(scheduledRidesTable.id, scheduled.id));

        if (scheduled.userId) {
          const [user] = await db
            .select({ pushToken: usersTable.pushToken })
            .from(usersTable)
            .where(eq(usersTable.id, scheduled.userId))
            .limit(1);
          if (user?.pushToken) {
            await sendPushNotification({
              to: user.pushToken,
              title: "Scheduled Ride — Koi Driver Nahi",
              body: `${scheduled.pickup} ke liye driver available nahi hai. Please dobara book karein.`,
              data: { type: "scheduled_no_driver" },
            });
          }
        }
        continue;
      }

      const userRows = scheduled.userId
        ? await db
            .select({ name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.id, scheduled.userId))
            .limit(1)
        : [];
      const userName = userRows[0]?.name ?? "Passenger";

      const [newRide] = await db
        .insert(ridesTable)
        .values({
          userId: scheduled.userId ?? undefined,
          driverId: driver.id,
          pickup: scheduled.pickup,
          destination: scheduled.destination,
          vehicleType: scheduled.vehicleType,
          rideMode: scheduled.rideMode ?? "economy",
          price: scheduled.price ?? "0",
          status: "accepted",
        })
        .returning();

      await db
        .update(driversTable)
        .set({ isOnline: false })
        .where(eq(driversTable.id, driver.id));

      await db
        .update(scheduledRidesTable)
        .set({ status: "dispatched" })
        .where(eq(scheduledRidesTable.id, scheduled.id));

      const rideData = {
        id: String(newRide.id),
        rideId: newRide.id,
        from: scheduled.pickup,
        to: scheduled.destination,
        distance: "—",
        price: parseFloat(String(scheduled.price ?? "0")),
        eta: 5,
        userName,
        isScheduled: true,
      };

      emitToDriver(driver.id, "driver:new_ride", rideData);

      if (driver.pushToken) {
        await sendPushNotification({
          to: driver.pushToken,
          title: "📅 Scheduled Ride Dispatch!",
          body: `${scheduled.pickup} → ${scheduled.destination} • ₹${rideData.price}`,
          data: { type: "scheduled_ride", rideId: newRide.id },
        });
      }

      logger.info(
        { scheduledId: scheduled.id, rideId: newRide.id, driverId: driver.id },
        "Scheduled ride dispatched"
      );
    }
  } catch (err) {
    logger.error({ err }, "autoDispatchScheduledRides error");
  }
}

export function startCron() {
  setInterval(autoCancelStaleRides, 5 * 60 * 1000);
  setInterval(autoDispatchScheduledRides, 60 * 1000);
  logger.info("Cron jobs started: auto-cancel + scheduled-dispatch");
}
