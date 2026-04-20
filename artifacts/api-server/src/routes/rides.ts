import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { ridesTable, driversTable } from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { emitRideUpdate, emitAdminUpdate } from "../lib/socket";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

interface JwtPayload { userId: number; phone: string; role: string; }

function userAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    (req as any).userId = payload.userId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

interface GeoPoint { lat?: number; lng?: number; address: string; }

async function assignNearestDriver(vehicleType: string, pickupLat?: number, pickupLng?: number) {
  const availableDrivers = await db
    .select()
    .from(driversTable)
    .where(and(
      eq(driversTable.vehicleType, vehicleType),
      eq(driversTable.isOnline, true),
      eq(driversTable.status, "active")
    ))
    .limit(10);

  if (availableDrivers.length === 0) return null;

  if (pickupLat && pickupLng) {
    let nearest = availableDrivers[0];
    let minDist = Infinity;
    for (const d of availableDrivers) {
      if (d.driverLat && d.driverLng) {
        const dLat = parseFloat(String(d.driverLat));
        const dLng = parseFloat(String(d.driverLng));
        const dist = Math.sqrt(Math.pow(dLat - pickupLat, 2) + Math.pow(dLng - pickupLng, 2));
        if (dist < minDist) { minDist = dist; nearest = d; }
      }
    }
    return nearest;
  }
  return availableDrivers[Math.floor(Math.random() * availableDrivers.length)];
}

router.post("/rides", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { pickup, drop, destination, vehicleType, rideType, rideMode, price, fare, distanceKm } = req.body as {
    pickup: GeoPoint | string;
    drop?: GeoPoint | string;
    destination?: GeoPoint | string;
    vehicleType?: string; rideType?: string;
    rideMode?: string; price?: number; fare?: number; distanceKm?: number;
  };

  const dropPoint = drop ?? destination;
  if (!pickup || !dropPoint) {
    res.status(400).json({ success: false, error: "pickup and drop are required" }); return;
  }

  const pickupAddress = typeof pickup === "string" ? pickup : pickup.address;
  const pickupLat    = typeof pickup === "object" ? (pickup.lat ? String(pickup.lat) : undefined) : undefined;
  const pickupLng    = typeof pickup === "object" ? (pickup.lng ? String(pickup.lng) : undefined) : undefined;
  const dropAddress  = typeof dropPoint === "string" ? dropPoint : (dropPoint as GeoPoint).address;
  const dropLat      = typeof dropPoint === "object" ? ((dropPoint as GeoPoint).lat ? String((dropPoint as GeoPoint).lat) : undefined) : undefined;
  const dropLng      = typeof dropPoint === "object" ? ((dropPoint as GeoPoint).lng ? String((dropPoint as GeoPoint).lng) : undefined) : undefined;

  const finalVehicleType = rideType ?? vehicleType;
  const finalPrice = fare ?? price;

  if (!pickupAddress || !dropAddress || !finalVehicleType || !finalPrice) {
    res.status(400).json({ success: false, error: "pickup, drop, vehicleType, price are required" }); return;
  }

  try {
    const matchedDriver = await assignNearestDriver(
      finalVehicleType,
      typeof pickup === "object" ? pickup.lat : undefined,
      typeof pickup === "object" ? pickup.lng : undefined
    );

    const [ride] = await db.insert(ridesTable).values({
      userId,
      pickup: pickupAddress, pickupLat, pickupLng,
      destination: dropAddress, dropLat, dropLng,
      vehicleType: finalVehicleType,
      rideMode: rideMode ?? "economy",
      price: String(finalPrice),
      distanceKm: distanceKm ? String(distanceKm) : undefined,
      status: matchedDriver ? "accepted" : "searching",
      driverId: matchedDriver?.id ?? undefined,
    }).returning();

    if (matchedDriver) {
      await db.update(driversTable).set({ isOnline: false }).where(eq(driversTable.id, matchedDriver.id));
    }

    const driverPayload = matchedDriver ? {
      id: matchedDriver.id,
      name: matchedDriver.name,
      phone: matchedDriver.phone,
      vehicleType: matchedDriver.vehicleType,
      vehicleNumber: matchedDriver.vehicleNumber,
      rating: matchedDriver.rating,
      eta: Math.floor(Math.random() * 5) + 2,
    } : null;

    emitRideUpdate(ride.id, "ride:status", { rideId: ride.id, status: ride.status, driver: driverPayload });
    emitAdminUpdate("admin:ride:new", { ride, driver: driverPayload });

    res.status(200).json({
      success: true,
      rideId: ride.id,
      message: matchedDriver ? "Driver found! Ride booked successfully" : "Ride booked, searching for driver...",
      ride,
      driver: driverPayload,
    });
  } catch (err) {
    console.error("[rides] create error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get("/rides/my", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const rides = await db
      .select()
      .from(ridesTable)
      .where(eq(ridesTable.userId, userId))
      .orderBy(desc(ridesTable.createdAt))
      .limit(50);

    const driverIds = [...new Set(rides.filter((r) => r.driverId).map((r) => r.driverId!))] as number[];
    const drivers = driverIds.length > 0
      ? await db.select().from(driversTable).where(inArray(driversTable.id, driverIds))
      : [];

    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    const ridesWithDrivers = rides.map((r) => ({
      ...r,
      driver: r.driverId ? (driverMap.get(r.driverId) ?? null) : null,
    }));

    res.json({ success: true, rides: ridesWithDrivers });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.get("/rides/:id", userAuth, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  try {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }

    let driver = null;
    if (ride.driverId) {
      const [d] = await db.select().from(driversTable).where(eq(driversTable.id, ride.driverId)).limit(1);
      if (d) driver = { id: d.id, name: d.name, phone: d.phone, vehicleType: d.vehicleType, vehicleNumber: d.vehicleNumber, rating: d.rating };
    }
    res.json({ success: true, ride, driver });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.post("/rides/:id/cancel", userAuth, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const userId = (req as any).userId;
  try {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }
    if (ride.userId !== userId) { res.status(403).json({ success: false, error: "Not your ride" }); return; }
    if (["completed", "cancelled"].includes(ride.status)) {
      res.status(400).json({ success: false, error: `Cannot cancel a ${ride.status} ride` }); return;
    }

    const [updated] = await db.update(ridesTable).set({ status: "cancelled" }).where(eq(ridesTable.id, rideId)).returning();

    if (ride.driverId) {
      await db.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, ride.driverId));
    }

    emitRideUpdate(rideId, "ride:status", { rideId, status: "cancelled" });
    emitAdminUpdate("admin:ride:updated", { rideId, status: "cancelled" });

    res.json({ success: true, ride: updated, message: "Ride cancelled successfully" });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

const VALID_STATUSES = ["searching", "accepted", "arrived", "onRide", "completed", "cancelled"];

router.patch("/rides/:id/status", userAuth, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const { status, driverRating } = req.body as { status: string; driverRating?: number };

  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` }); return;
  }

  try {
    const [updated] = await db.update(ridesTable).set({ status }).where(eq(ridesTable.id, rideId)).returning();
    if (!updated) { res.status(404).json({ success: false, error: "Ride not found" }); return; }

    if (status === "completed" && updated.driverId) {
      const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, updated.driverId)).limit(1);
      if (driver) {
        const price = parseFloat(String(updated.price));
        const commission = parseFloat((price * 0.067).toFixed(2));
        const earning = parseFloat((price * 0.933).toFixed(2));

        await db.update(driversTable).set({
          totalEarnings: String((parseFloat(String(driver.totalEarnings ?? "0")) + earning).toFixed(2)),
          totalRides: (driver.totalRides ?? 0) + 1,
          isOnline: false,
        }).where(eq(driversTable.id, updated.driverId));

        await db.update(ridesTable).set({
          commissionAmount: String(commission),
          driverEarning: String(earning),
        }).where(eq(ridesTable.id, rideId));
      }
    }

    emitRideUpdate(rideId, "ride:status", { rideId, status });
    emitAdminUpdate("admin:ride:updated", { rideId, status });

    res.json({ success: true, ride: updated, driverRating });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

export default router;
