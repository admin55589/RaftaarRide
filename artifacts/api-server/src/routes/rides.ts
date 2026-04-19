import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { ridesTable, driversTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
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
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as Request & { userId: number }).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

router.post("/rides", userAuthMiddleware, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const { pickup, destination, vehicleType, rideMode, price } = req.body as {
    pickup: string;
    destination: string;
    vehicleType: string;
    rideMode: string;
    price: number;
  };

  if (!pickup || !destination || !vehicleType || !price) {
    res.status(400).json({ message: "pickup, destination, vehicleType, price are required" });
    return;
  }

  try {
    const [ride] = await db
      .insert(ridesTable)
      .values({
        userId,
        pickup,
        destination,
        vehicleType,
        rideMode: rideMode ?? "economy",
        price: String(price),
        status: "pending",
      })
      .returning();

    res.status(201).json({ ride });
  } catch (err) {
    console.error("[rides] create error:", err);
    res.status(500).json({ message: "Failed to create ride" });
  }
});

router.patch("/rides/:id/status", userAuthMiddleware, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const { status, driverRating } = req.body as { status: string; driverRating?: number };

  const validStatuses = ["pending", "assigned", "in_progress", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ message: `status must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  try {
    const [updated] = await db
      .update(ridesTable)
      .set({ status })
      .where(eq(ridesTable.id, rideId))
      .returning();

    if (!updated) {
      res.status(404).json({ message: "Ride not found" });
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

    res.json({ ride: updated, driverRating });
  } catch (err) {
    console.error("[rides] status update error:", err);
    res.status(500).json({ message: "Failed to update ride status" });
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

    res.json({ rides });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch rides" });
  }
});

export default router;
