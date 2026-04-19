import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, scheduledRidesTable } from "@workspace/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import jwt from "jsonwebtoken";

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

router.post("/scheduled-rides", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { pickup, destination, vehicleType, rideMode, price, scheduledAt, notes } = req.body as {
    pickup: string;
    destination: string;
    vehicleType: string;
    rideMode?: string;
    price: number;
    scheduledAt: string;
    notes?: string;
  };

  if (!pickup || !destination || !vehicleType || !price || !scheduledAt) {
    res.status(400).json({ success: false, error: "Saari details required hain" });
    return;
  }

  const scheduledTime = new Date(scheduledAt);
  const minTime = new Date(Date.now() + 30 * 60 * 1000);
  if (scheduledTime < minTime) {
    res.status(400).json({ success: false, error: "Ride kam se kam 30 minute baad schedule karein" });
    return;
  }

  const maxTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (scheduledTime > maxTime) {
    res.status(400).json({ success: false, error: "Ride 7 din se zyada aage schedule nahi ho sakti" });
    return;
  }

  try {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    const [ride] = await db.insert(scheduledRidesTable).values({
      userId,
      pickup,
      destination,
      vehicleType,
      rideMode: rideMode ?? "economy",
      price: String(price),
      scheduledAt: scheduledTime,
      notes,
    }).returning();

    res.json({ success: true, ride, message: "Ride schedule ho gayi!" });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

router.get("/scheduled-rides", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const rides = await db.select().from(scheduledRidesTable)
      .where(eq(scheduledRidesTable.userId, userId))
      .orderBy(desc(scheduledRidesTable.scheduledAt))
      .limit(20);
    res.json({ success: true, rides });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

router.delete("/scheduled-rides/:id", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const id = Number(req.params.id);

  try {
    const [existing] = await db.select().from(scheduledRidesTable)
      .where(eq(scheduledRidesTable.id, id)).limit(1);

    if (!existing || existing.userId !== userId) {
      res.status(404).json({ success: false, error: "Ride nahi mili" });
      return;
    }

    if (existing.status !== "pending") {
      res.status(400).json({ success: false, error: "Yeh ride cancel nahi ho sakti" });
      return;
    }

    await db.update(scheduledRidesTable)
      .set({ status: "cancelled" })
      .where(eq(scheduledRidesTable.id, id));

    res.json({ success: true, message: "Scheduled ride cancel ho gayi" });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

export default router;
