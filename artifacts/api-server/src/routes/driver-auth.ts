import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { driversTable, ridesTable, usersTable, walletTransactionsTable, planTransactionsTable } from "@workspace/db/schema";
import { eq, or, inArray, sum, avg, count, isNotNull, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Razorpay from "razorpay";
import { emitRideUpdate } from "../lib/socket";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? "",
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
});

const PLAN_PRICES: Record<string, { daily: number; monthly: number }> = {
  bike:  { daily: 5,  monthly: 150 },
  auto:  { daily: 7,  monthly: 210 },
  cab:   { daily: 19, monthly: 570 },
  prime: { daily: 19, monthly: 570 },
  suv:   { daily: 19, monthly: 570 },
};

function getPlanStatus(driver: { planEndAt: Date | null; planType: string | null; planBilling: string | null; planStartAt: Date | null; isTrial: boolean | null; trialUsed: boolean }) {
  const now = new Date();
  const endAt = driver.planEndAt ? new Date(driver.planEndAt) : null;
  const isActive = !!endAt && endAt > now;
  const daysLeft = isActive ? Math.ceil((endAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  return {
    planType: driver.planType ?? null,
    planBilling: driver.planBilling ?? null,
    planStartAt: driver.planStartAt ? new Date(driver.planStartAt).toISOString() : null,
    planEndAt: endAt ? endAt.toISOString() : null,
    isTrial: driver.isTrial ?? false,
    trialUsed: driver.trialUsed,
    isActive,
    daysLeft,
    canGoOnline: isActive,
  };
}

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

  const validVehicles = ["bike", "auto", "cab", "prime", "suv"];
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

    if (driver.status === "blocked") {
      res.status(403).json({ message: "Aapka driver account block kar diya gaya hai. Support se contact karein." });
      return;
    }
    if (driver.status === "suspended") {
      res.status(403).json({ message: "Aapka driver account suspend hai. Support se contact karein." });
      return;
    }
    if (driver.status === "pending") {
      res.status(403).json({ message: "Aapka account abhi review mein hai. KYC approve hone ka intezaar karein." });
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

    if (driver.status === "blocked") {
      res.status(403).json({ message: "Aapka driver account block kar diya gaya hai. Support se contact karein." });
      return;
    }
    if (driver.status === "suspended") {
      res.status(403).json({ message: "Aapka driver account suspend hai. Support se contact karein." });
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

/* PATCH /driver-auth/online-status — driver online/offline toggle */
router.patch("/driver-auth/online-status", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Token required" });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ success: false, message: "Driver token required" });
      return;
    }
    const { isOnline } = req.body as { isOnline: boolean };
    if (typeof isOnline !== "boolean") {
      res.status(400).json({ success: false, message: "isOnline (boolean) required hai" });
      return;
    }
    const [currentDriver] = await db.select({
      status: driversTable.status,
      planEndAt: driversTable.planEndAt,
      trialUsed: driversTable.trialUsed,
    }).from(driversTable).where(eq(driversTable.id, payload.driverId)).limit(1);
    if (currentDriver?.status === "blocked") {
      res.status(403).json({ success: false, message: "Aapka account block hai. Online nahi ho sakte." });
      return;
    }
    if (currentDriver?.status === "suspended") {
      res.status(403).json({ success: false, message: "Aapka account suspend hai. Online nahi ho sakte." });
      return;
    }
    if (isOnline) {
      const now = new Date();
      const planEnd = currentDriver?.planEndAt ? new Date(currentDriver.planEndAt) : null;
      if (!planEnd || planEnd <= now) {
        res.status(403).json({ success: false, planExpired: true, message: currentDriver?.trialUsed ? "Aapka plan expire ho gaya hai. Plans tab mein jakar renew karein." : "Pehle ek plan lo. Plans tab mein jakar free trial shuru karein." });
        return;
      }
    }
    const [updated] = await db
      .update(driversTable)
      .set({ isOnline })
      .where(eq(driversTable.id, payload.driverId))
      .returning();
    res.json({ success: true, isOnline: updated.isOnline, message: isOnline ? "Aap online hain" : "Aap offline ho gaye" });
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
    const rideId = parseInt(String(req.params.id), 10);
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

/* ─────────────── PLAN ROUTES ─────────────── */

/* GET /api/driver-auth/plan — current plan status */
router.get("/driver-auth/plan", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }
    const [driver] = await db.select({
      planType: driversTable.planType, planBilling: driversTable.planBilling,
      planStartAt: driversTable.planStartAt, planEndAt: driversTable.planEndAt,
      isTrial: driversTable.isTrial, trialUsed: driversTable.trialUsed,
    }).from(driversTable).where(eq(driversTable.id, payload.driverId)).limit(1);
    if (!driver) { res.status(404).json({ message: "Driver not found" }); return; }
    res.json(getPlanStatus(driver));
  } catch { res.status(401).json({ message: "Invalid token" }); }
});

/* POST /api/driver-auth/plan/start-trial — free 30-day trial */
router.post("/driver-auth/plan/start-trial", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }
    const [driver] = await db.select({
      vehicleType: driversTable.vehicleType, trialUsed: driversTable.trialUsed,
    }).from(driversTable).where(eq(driversTable.id, payload.driverId)).limit(1);
    if (!driver) { res.status(404).json({ message: "Driver not found" }); return; }
    if (driver.trialUsed) {
      res.status(409).json({ message: "Free trial pehle hi use ho chuka hai. Paid plan lo." });
      return;
    }
    const now = new Date();
    const endAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const vehicleType = driver.vehicleType === "prime" ? "cab" : driver.vehicleType;
    const [updated] = await db.update(driversTable).set({
      planType: vehicleType, planBilling: "monthly",
      planStartAt: now, planEndAt: endAt,
      isTrial: true, trialUsed: true,
    }).where(eq(driversTable.id, payload.driverId)).returning({
      planType: driversTable.planType, planBilling: driversTable.planBilling,
      planStartAt: driversTable.planStartAt, planEndAt: driversTable.planEndAt,
      isTrial: driversTable.isTrial, trialUsed: driversTable.trialUsed,
    });
    res.json({ success: true, plan: getPlanStatus(updated) });
  } catch { res.status(401).json({ message: "Invalid token" }); }
});

/* POST /api/driver-auth/plan/subscribe — create Razorpay order for plan */
router.post("/driver-auth/plan/subscribe", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }
    const { vehicleType, billing } = req.body as { vehicleType: string; billing: "daily" | "monthly" };
    if (!vehicleType || !billing || !["daily", "monthly"].includes(billing)) {
      res.status(400).json({ message: "vehicleType aur billing (daily/monthly) required hai" }); return;
    }
    const prices = PLAN_PRICES[vehicleType] ?? PLAN_PRICES.cab;
    const amountRupees = billing === "daily" ? prices.daily : prices.monthly;
    const order = await razorpay.orders.create({
      amount: amountRupees * 100,
      currency: "INR",
      receipt: `plan_${payload.driverId}_${billing}_${Date.now()}`,
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      vehicleType,
      billing,
      amountRupees,
    });
  } catch (err: any) {
    res.status(500).json({ message: "Order create nahi hua", error: err?.message });
  }
});

/* POST /api/driver-auth/plan/activate — verify payment + activate plan */
router.post("/driver-auth/plan/activate", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, vehicleType, billing } = req.body as {
      razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string;
      vehicleType: string; billing: "daily" | "monthly";
    };
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !vehicleType || !billing) {
      res.status(400).json({ message: "Saari payment details required hain" }); return;
    }
    const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
    const expectedSig = crypto.createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expectedSig !== razorpay_signature) {
      res.status(400).json({ message: "Payment verify nahi hua. Invalid signature." }); return;
    }
    const now = new Date();
    const daysToAdd = billing === "daily" ? 1 : 30;
    const [driver] = await db.select({ planEndAt: driversTable.planEndAt }).from(driversTable).where(eq(driversTable.id, payload.driverId)).limit(1);
    const currentEnd = driver?.planEndAt ? new Date(driver.planEndAt) : null;
    const baseDate = currentEnd && currentEnd > now ? currentEnd : now;
    const endAt = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    const planTypeNorm = vehicleType === "prime" ? "cab" : vehicleType;
    const prices = PLAN_PRICES[vehicleType] ?? PLAN_PRICES.cab;
    const amountRupees = billing === "daily" ? prices.daily : prices.monthly;

    const [updated] = await db.update(driversTable).set({
      planType: planTypeNorm, planBilling: billing,
      planStartAt: now, planEndAt: endAt,
      isTrial: false,
    }).where(eq(driversTable.id, payload.driverId)).returning({
      planType: driversTable.planType, planBilling: driversTable.planBilling,
      planStartAt: driversTable.planStartAt, planEndAt: driversTable.planEndAt,
      isTrial: driversTable.isTrial, trialUsed: driversTable.trialUsed,
    });

    await db.insert(planTransactionsTable).values({
      driverId: payload.driverId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      vehicleType: planTypeNorm,
      billing,
      amountRupees: String(amountRupees),
    });

    res.json({ success: true, plan: getPlanStatus(updated) });
  } catch (err: any) {
    res.status(500).json({ message: "Plan activate nahi hua", error: err?.message });
  }
});

export default router;
