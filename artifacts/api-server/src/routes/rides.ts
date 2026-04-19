import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { ridesTable, driversTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

interface JwtPayload {
  userId: number;
  phone: string;
  role: string;
}

function userAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as Request & { userId: number }).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}

interface GeoPoint {
  lat?: number;
  lng?: number;
  address: string;
}

router.post("/rides", userAuthMiddleware, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;

  const {
    pickup,
    drop,
    destination,
    vehicleType,
    rideType,
    rideMode,
    price,
    fare,
    distanceKm,
  } = req.body as {
    pickup: GeoPoint | string;
    drop?: GeoPoint | string;
    destination?: GeoPoint | string;
    vehicleType?: string;
    rideType?: string;
    rideMode?: string;
    price?: number;
    fare?: number;
    distanceKm?: number;
  };

  const dropPoint = drop ?? destination;
  if (!pickup || !dropPoint) {
    res.status(400).json({ success: false, error: "pickup and drop are required" });
    return;
  }

  const pickupAddress = typeof pickup === "string" ? pickup : pickup.address;
  const pickupLat    = typeof pickup === "string" ? null : String(pickup.lat ?? "");
  const pickupLng    = typeof pickup === "string" ? null : String(pickup.lng ?? "");

  const dropAddress  = typeof dropPoint === "string" ? dropPoint : dropPoint.address;
  const dropLat      = typeof dropPoint === "string" ? null : String((dropPoint as GeoPoint).lat ?? "");
  const dropLng      = typeof dropPoint === "string" ? null : String((dropPoint as GeoPoint).lng ?? "");

  const finalVehicleType = rideType ?? vehicleType;
  const finalPrice       = fare ?? price;

  if (!pickupAddress || !dropAddress || !finalVehicleType || !finalPrice) {
    res.status(400).json({ success: false, error: "pickup, drop, vehicleType/rideType, and price/fare are required" });
    return;
  }

  try {
    const [ride] = await db
      .insert(ridesTable)
      .values({
        userId,
        pickup: pickupAddress,
        pickupLat: pickupLat || undefined,
        pickupLng: pickupLng || undefined,
        destination: dropAddress,
        dropLat: dropLat || undefined,
        dropLng: dropLng || undefined,
        vehicleType: finalVehicleType,
        rideMode: rideMode ?? "economy",
        price: String(finalPrice),
        distanceKm: distanceKm ? String(distanceKm) : undefined,
        status: "searching",
      })
      .returning();

    res.status(200).json({
      success: true,
      rideId: ride.id,
      message: "Ride booked successfully",
      ride,
    });
  } catch (err) {
    console.error("[rides] create error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

const VALID_STATUSES = ["searching", "accepted", "arrived", "onRide", "completed", "cancelled"];

router.patch("/rides/:id/status", userAuthMiddleware, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const { status, driverRating } = req.body as { status: string; driverRating?: number };

  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  try {
    const [updated] = await db
      .update(ridesTable)
      .set({ status })
      .where(eq(ridesTable.id, rideId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, error: "Ride not found" });
      return;
    }

    if (status === "completed" && updated.driverId) {
      const [driver] = await db
        .select()
        .from(driversTable)
        .where(eq(driversTable.id, updated.driverId))
        .limit(1);

      if (driver) {
        const currentEarnings = parseFloat(String(driver.totalEarnings ?? "0"));
        const rideEarning = parseFloat(String(updated.price)) * 0.933;
        await db
          .update(driversTable)
          .set({
            totalEarnings: String((currentEarnings + rideEarning).toFixed(2)),
            totalRides: (driver.totalRides ?? 0) + 1,
          })
          .where(eq(driversTable.id, updated.driverId));
      }
    }

    res.json({ success: true, ride: updated, driverRating });
  } catch (err) {
    console.error("[rides] status update error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get("/rides/my", userAuthMiddleware, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  try {
    const rides = await db
      .select()
      .from(ridesTable)
      .where(eq(ridesTable.userId, userId))
      .orderBy(desc(ridesTable.createdAt))
      .limit(30);

    res.json({ success: true, rides });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
