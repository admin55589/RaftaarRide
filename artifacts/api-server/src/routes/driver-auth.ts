import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { driversTable, ridesTable, usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { eq, or, inArray, sum, avg, count, isNotNull, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { emitRideUpdate } from "../lib/socket";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

router.post("/driver-auth/register", async (req: Request, res: Response) => {
  const { name, phone, email, password, vehicleType, vehicleNumber, licenseNumber } = req.body as {
    name: string;
    phone: string;
    email: string;
    password: string;
    vehicleType: string;
    vehicleNumber: string;
    licenseNumber?: string;
  };

  if (!name || !phone || !email || !password || !vehicleType || !vehicleNumber) {
    res.status(400).json({ message: "Saari details required hain" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ message: "Password kam se kam 6 characters ka hona chahiye" });
    return;
  }

  const validVehicles = ["bike", "auto", "prime", "suv"];
  if (!validVehicles.includes(vehicleType)) {
    res.status(400).json({ message: "Invalid vehicle type" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(driversTable)
      .where(or(eq(driversTable.phone, phone), eq(driversTable.email, email)))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ message: "Yeh phone/email already registered hai" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [driver] = await db
      .insert(driversTable)
      .values({
        name,
        phone,
        email,
        passwordHash,
        vehicleType,
        vehicleNumber,
        licenseNumber: licenseNumber || null,
        status: "active",
        isOnline: false,
      })
      .returning();

    const token = jwt.sign(
      { driverId: driver.id, phone: driver.phone, role: "driver" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      token,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        photoUrl: driver.photoUrl ?? null,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        rating: null,
        totalEarnings: "0.00",
        totalRides: 0,
        walletBalance: 0,
        status: driver.status,
        isOnline: driver.isOnline,
      },
    });
  } catch (err) {
    console.error("Driver register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/driver-auth/login", async (req: Request, res: Response) => {
  const { phone, email, password } = req.body as {
    phone?: string;
    email?: string;
    password: string;
  };

  if ((!phone && !email) || !password) {
    res.status(400).json({ message: "Phone/email aur password required hain" });
    return;
  }

  try {
    const conditions = [];
    if (phone) conditions.push(eq(driversTable.phone, phone));
    if (email) conditions.push(eq(driversTable.email, email));

    const [driver] = await db
      .select()
      .from(driversTable)
      .where(or(...conditions))
      .limit(1);

    if (!driver || !driver.passwordHash) {
      res.status(401).json({ message: "Phone/email ya password galat hai" });
      return;
    }

    const valid = await bcrypt.compare(password, driver.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Phone/email ya password galat hai" });
      return;
    }

    const token = jwt.sign(
      { driverId: driver.id, phone: driver.phone, role: "driver" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Compute real stats on login too
    const [loginEarnings] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.driverId, driver.id),
        sql`${walletTransactionsTable.type} IN ('earning', 'credit')`
      ));
    const [loginRating] = await db
      .select({ avg: avg(ridesTable.userRating) })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, driver.id), eq(ridesTable.status, "completed"), isNotNull(ridesTable.userRating)));
    const [loginRides] = await db
      .select({ total: count(ridesTable.id) })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, driver.id), eq(ridesTable.status, "completed")));

    res.json({
      token,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        photoUrl: driver.photoUrl ?? null,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        rating: loginRating?.avg ? parseFloat(loginRating.avg).toFixed(2) : null,
        totalEarnings: (parseFloat(loginEarnings?.total ?? "0") || 0).toFixed(2),
        totalRides: loginRides?.total ?? 0,
        walletBalance: parseFloat(driver.walletBalance ?? "0"),
        status: driver.status,
        isOnline: driver.isOnline,
      },
    });
  } catch (err) {
    console.error("Driver login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.get("/driver-auth/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token required" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ message: "Driver token required" });
      return;
    }

    const [driver] = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.id, payload.driverId))
      .limit(1);

    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    // Compute real stats from actual DB data
    const [earningsRow] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.driverId, driver.id),
          sql`${walletTransactionsTable.type} IN ('earning', 'credit')`
        )
      );

    const [ratingRow] = await db
      .select({ avg: avg(ridesTable.userRating), rideCount: count(ridesTable.id) })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.driverId, driver.id),
          eq(ridesTable.status, "completed"),
          isNotNull(ridesTable.userRating)
        )
      );

    const [completedRow] = await db
      .select({ total: count(ridesTable.id) })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, driver.id), eq(ridesTable.status, "completed")));

    const realEarnings = parseFloat(earningsRow?.total ?? "0") || 0;
    const realRating = ratingRow?.avg ? parseFloat(ratingRow.avg).toFixed(2) : null;
    const realRides = completedRow?.total ?? 0;

    res.json({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      photoUrl: driver.photoUrl ?? null,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      rating: realRating,
      totalEarnings: realEarnings.toFixed(2),
      totalRides: realRides,
      walletBalance: parseFloat(driver.walletBalance ?? "0"),
      status: driver.status,
      isOnline: driver.isOnline,
    });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});

router.patch("/driver-auth/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token required" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ message: "Driver token required" });
      return;
    }

    const { name, photoUrl } = req.body as { name?: string; photoUrl?: string | null };

    const updates: Partial<{ name: string; photoUrl: string | null }> = {};
    if (name !== undefined && name.trim()) updates.name = name.trim();
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: "Kuch update karne ke liye do" });
      return;
    }

    const [updated] = await db
      .update(driversTable)
      .set(updates)
      .where(eq(driversTable.id, payload.driverId))
      .returning();

    if (!updated) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    res.json({
      success: true,
      driver: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        photoUrl: updated.photoUrl ?? null,
        vehicleType: updated.vehicleType,
        vehicleNumber: updated.vehicleNumber,
        rating: updated.rating,
        totalEarnings: updated.totalEarnings,
        totalRides: updated.totalRides,
        status: updated.status,
        isOnline: updated.isOnline,
      },
    });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});

/* PATCH /driver-auth/push-token — save Expo push token for driver */
router.patch("/driver-auth/push-token", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "Token required" }); return; }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ success: false, message: "Driver token required" }); return; }
    const { pushToken } = req.body as { pushToken?: string };
    if (!pushToken) { res.status(400).json({ success: false, message: "pushToken required" }); return; }
    await db.update(driversTable).set({ pushToken }).where(eq(driversTable.id, payload.driverId));
    res.json({ success: true });
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

/* PATCH /driver-auth/location — update driver's GPS coordinates */
router.patch("/driver-auth/location", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Token required" });
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ success: false, message: "Driver token required" });
      return;
    }
    const { lat, lng } = req.body as { lat?: number; lng?: number };
    if (typeof lat !== "number" || typeof lng !== "number") {
      res.status(400).json({ success: false, message: "lat aur lng dono chahiye" });
      return;
    }
    await db
      .update(driversTable)
      .set({ driverLat: String(lat), driverLng: String(lng) })
      .where(eq(driversTable.id, payload.driverId));
    res.json({ success: true, message: "Location update ho gayi", lat, lng });
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

/* PATCH /api/driver-auth/rides/:id/status — driver updates ride status (arrived, onRide, completed) */
router.patch("/driver-auth/rides/:id/status", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ success: false, message: "Driver token required" });
      return;
    }
    const rideId = parseInt(req.params.id, 10);
    const { status } = req.body as { status: string };
    const allowedStatuses = ["arrived", "onRide", "completed", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ success: false, message: `Status '${status}' allowed nahi hai` });
      return;
    }
    /* Verify this ride belongs to this driver */
    const [ride] = await db.select().from(ridesTable)
      .where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) {
      res.status(404).json({ success: false, message: "Ride nahi mili" });
      return;
    }
    if (ride.driverId !== payload.driverId) {
      res.status(403).json({ success: false, message: "Yeh ride aapki nahi hai" });
      return;
    }
    await db.update(ridesTable).set({ status }).where(eq(ridesTable.id, rideId));

    /* Re-enable driver when ride completed or cancelled */
    if (status === "completed" || status === "cancelled") {
      await db.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, payload.driverId));
    }

    /* Emit status change to passenger ride room */
    emitRideUpdate(rideId, "ride:status", { rideId, status, driverId: payload.driverId });

    res.json({ success: true, rideId, status, message: `Status update: ${status}` });
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

/* GET /api/driver-auth/rides/active — returns the active ride assigned to this driver */
router.get("/driver-auth/rides/active", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ success: false, message: "Driver token required" });
      return;
    }
    /* Find non-completed rides assigned to this driver */
    const activeRides = await db
      .select({
        id: ridesTable.id,
        pickup: ridesTable.pickup,
        destination: ridesTable.destination,
        distanceKm: ridesTable.distanceKm,
        price: ridesTable.price,
        status: ridesTable.status,
        completionPin: ridesTable.completionPin,
        userId: ridesTable.userId,
        createdAt: ridesTable.createdAt,
      })
      .from(ridesTable)
      .where(
        eq(ridesTable.driverId, payload.driverId),
      )
      .orderBy(ridesTable.createdAt)
      .limit(10);

    const nonCompleted = activeRides.filter(
      (r) => !["completed", "cancelled"].includes(r.status ?? "")
    );

    /* Fetch user names */
    const userIds = [...new Set(nonCompleted.map((r) => r.userId).filter(Boolean))] as number[];
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const result = nonCompleted.map((r) => ({
      id: String(r.id),
      rideId: r.id,
      from: r.pickup ?? "",
      to: r.destination ?? "",
      distance: r.distanceKm ? `${r.distanceKm} km` : "? km",
      price: parseFloat(String(r.price ?? "0")),
      eta: 3,
      userName: (r.userId ? userMap.get(r.userId) : null) ?? "Passenger",
      status: r.status,
    }));

    res.json({ success: true, rides: result });
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

export default router;
