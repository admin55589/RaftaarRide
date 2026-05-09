import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { driversTable, ridesTable, usersTable, walletTransactionsTable, planTransactionsTable } from "@workspace/db/schema";
import { checkGpsSpoof, checkRapidCancellation } from "../lib/fraud-engine";
import { onDriverAccept, onDriverReject } from "../lib/rideQueue";
import { eq, or, inArray, sum, avg, count, isNotNull, and, sql, desc, gte } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Razorpay from "razorpay";
import { emitRideUpdate } from "../lib/socket";
import { logger } from "../lib/logger";
import { sendPushNotification } from "../lib/expoPush";

/* In-memory OTP store for driver password reset (phone → {otp, expiresAt}) */
const driverResetOtps = new Map<string, { otp: string; expiresAt: Date }>();

async function sendDriverResetOtp(phone: string, otp: string): Promise<{ sent: boolean; dev: boolean }> {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (apiKey) {
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    try {
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${cleanPhone}/${otp}`;
      const res = await fetch(url);
      const data = (await res.json()) as { Status: string };
      if (data.Status === "Success") return { sent: true, dev: false };
    } catch { /* fallthrough to dev */ }
  }
  logger.warn({ phone }, `[DRIVER-OTP][DEV] OTP: ${otp}`);
  return { sent: false, dev: true };
}

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
  const { name, phone, email, password, vehicleType, vehicleNumber, licenseNumber, gender } = req.body as {
    name: string;
    phone: string;
    email: string;
    password: string;
    vehicleType: string;
    vehicleNumber: string;
    licenseNumber?: string;
    gender?: string;
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
        gender: gender || null,
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
    logger.error({ err }, "driver register error");
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
    logger.error({ err }, "driver login error");
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
    /* Fraud check — GPS spoof detection before overwriting location */
    checkGpsSpoof(payload.driverId, lat, lng).catch(() => {});
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
    const allowedStatuses = ["accepted", "arrived", "onRide", "completed", "cancelled"];
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
    await db.update(ridesTable).set({
      status,
      ...(status === "cancelled" ? { cancelledBy: "driver" } : {}),
    }).where(eq(ridesTable.id, rideId));

    if (status === "cancelled") {
      /* Fraud check — rapid cancellation detection, fire-and-forget */
      checkRapidCancellation(payload.driverId).catch(() => {});

      /* ── Put driver back online ── */
      await db.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, payload.driverId));

      /* ── Refund user if wallet was pre-charged ── */
      if (ride.userId) {
        const [rideUser] = await db
          .select({ walletBalance: usersTable.walletBalance, pushToken: usersTable.pushToken })
          .from(usersTable)
          .where(eq(usersTable.id, ride.userId))
          .limit(1);

        if (rideUser && ride.paymentMethod === "RaftaarWallet") {
          const ridePrice = parseFloat(String(ride.price ?? "0"));
          const currentBal = parseFloat(String(rideUser.walletBalance ?? "0"));
          const newBal = parseFloat((currentBal + ridePrice).toFixed(2));

          await db.update(usersTable)
            .set({ walletBalance: String(newBal) })
            .where(eq(usersTable.id, ride.userId));

          await db.insert(walletTransactionsTable).values({
            userId: ride.userId,
            type: "refund",
            amount: String(ridePrice),
            description: `Ride #${rideId} — Driver ne cancel kiya. ₹${ridePrice.toFixed(2)} wallet mein wapas.`,
          });

          if (rideUser.pushToken) {
            await sendPushNotification({
              to: rideUser.pushToken,
              title: "❌ Driver ne Cancel Kiya — Refund Ho Gaya!",
              body: `₹${ridePrice.toFixed(2)} aapke RaftaarWallet mein wapas aa gaye. Naya driver dhundh rahe hain...`,
              data: { type: "driver_cancelled_refund", rideId, refundAmt: ridePrice },
            });
          }
        } else if (rideUser?.pushToken) {
          /* Cash ride — just notify user */
          await sendPushNotification({
            to: rideUser.pushToken,
            title: "❌ Driver ne Cancel Kiya",
            body: "Aapke driver ne ride cancel kar di. Naya driver dhundh rahe hain...",
            data: { type: "driver_cancelled", rideId },
          });
        }
      }

      /* ── Driver cancel penalty: ₹10 deduction after ≥3 cancels today ── */
      const PENALTY_AMT = 10;
      const CANCEL_THRESHOLD = 3;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [cancelCountRow] = await db
        .select({ cnt: count() })
        .from(ridesTable)
        .where(and(
          eq(ridesTable.driverId, payload.driverId),
          eq(ridesTable.cancelledBy, "driver"),
          gte(ridesTable.createdAt, todayStart),
        ));

      const todayCancels = cancelCountRow?.cnt ?? 0;

      if (todayCancels >= CANCEL_THRESHOLD) {
        const [drv] = await db
          .select({ walletBalance: driversTable.walletBalance, pushToken: driversTable.pushToken })
          .from(driversTable)
          .where(eq(driversTable.id, payload.driverId))
          .limit(1);

        if (drv) {
          const drvBal = parseFloat(String(drv.walletBalance ?? "0"));
          const deductAmt = Math.min(PENALTY_AMT, Math.max(0, drvBal));
          if (deductAmt > 0) {
            const newDrvBal = parseFloat((drvBal - deductAmt).toFixed(2));
            await db.update(driversTable)
              .set({ walletBalance: String(newDrvBal) })
              .where(eq(driversTable.id, payload.driverId));

            /* Debit from driver wallet */
            await db.insert(walletTransactionsTable).values({
              driverId: payload.driverId,
              type: "debit",
              amount: String(-deductAmt),
              description: `Cancel penalty — aaj ${todayCancels} rides cancel ki hain. ₹${deductAmt} platform ko.`,
            });

            /* Credit to platform/admin revenue (no userId, no driverId) */
            await db.insert(walletTransactionsTable).values({
              type: "platform_revenue",
              amount: String(deductAmt),
              description: `Cancel penalty revenue — Driver #${payload.driverId} (${todayCancels} cancels today, Ride #${rideId})`,
            });
          }

          if (drv.pushToken) {
            await sendPushNotification({
              to: drv.pushToken,
              title: `⚠️ Cancel Penalty — ₹${PENALTY_AMT}`,
              body: `Aaj aapne ${todayCancels} rides cancel ki hain. Zyada cancel karne par ₹${PENALTY_AMT} kata. Passengers ka dhyan rakho!`,
              data: { type: "cancel_penalty", todayCancels, penalty: deductAmt },
            });
          }
        }
      }
    }

    /* Credit driver earnings on ride completion — mirrors /api/rides/:id/status logic */
    if (status === "completed") {
      /* Idempotency: skip if earnings already credited (e.g. via verify-pin route) */
      if (!(ride.driverEarning && parseFloat(String(ride.driverEarning)) > 0)) {
        const [driver] = await db.select().from(driversTable)
          .where(eq(driversTable.id, payload.driverId)).limit(1);
        if (driver) {
          const price = parseFloat(String(ride.price));
          const isCash = ride.paymentMethod === "Cash";
          const vt = String(ride.vehicleType ?? "cab").toLowerCase();
          const PLATFORM_FEE_MAP: Record<string, number> = { bike: 4, auto: 6, cab: 12, prime: 12, suv: 15 };
          const platformFee = PLATFORM_FEE_MAP[vt] ?? 12;
          const earning = parseFloat((price - platformFee).toFixed(2));
          const currentBalance = parseFloat(String(driver.walletBalance ?? "0"));
          const newWalletBalance = isCash
            ? currentBalance - platformFee
            : currentBalance + earning;
          const totalEarningsNew = parseFloat(String(driver.totalEarnings ?? "0")) + earning;
          await db.update(driversTable).set({
            totalEarnings: String(totalEarningsNew.toFixed(2)),
            walletBalance: String(newWalletBalance.toFixed(2)),
            totalRides: (driver.totalRides ?? 0) + 1,
            isOnline: true,
          }).where(eq(driversTable.id, payload.driverId));
          await db.update(ridesTable).set({
            commissionAmount: "0",
            driverEarning: String(earning),
          }).where(eq(ridesTable.id, rideId));
          await db.insert(walletTransactionsTable).values({
            driverId: payload.driverId,
            type: isCash ? "commission_debit" : "earning",
            amount: String(isCash ? -platformFee : earning),
            description: isCash
              ? `Ride #${rideId} — Cash: platform fee ₹${platformFee} admin ko dena hai.`
              : `Ride #${rideId} — Ride fare ₹${earning.toFixed(2)} credit (platform fee ₹${platformFee} admin ka).`,
          });
        }
      } else {
        /* Earnings already credited via verify-pin — just put driver back online */
        await db.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, payload.driverId));
      }
    }

    /* Emit status change to passenger ride room */
    emitRideUpdate(rideId, "ride:status", { rideId, status, driverId: payload.driverId });

    res.json({ success: true, rideId, status, message: `Status update: ${status}` });
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

/* POST /api/driver-auth/rides/:id/accept — driver accepts a ride offer from the broadcast queue */
router.post("/driver-auth/rides/:id/accept", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ success: false, message: "Driver token required" }); return; }

    const rideId = parseInt(String(req.params.id), 10);
    const result = await onDriverAccept(rideId, payload.driverId);

    if (!result) {
      res.status(409).json({ success: false, message: "Ride ab available nahi hai — kisi aur ne le li ya cancel ho gayi" });
      return;
    }

    res.json({ success: true, rideId, pin: result.pin, driver: result.driver, message: "Ride accept ho gayi! 🎉" });
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

/* POST /api/driver-auth/rides/:id/reject — driver rejects a ride offer, triggers next nearest driver */
router.post("/driver-auth/rides/:id/reject", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ success: false, message: "Driver token required" }); return; }

    const rideId = parseInt(String(req.params.id), 10);
    await onDriverReject(rideId, payload.driverId);

    res.json({ success: true, message: "Reject ho gaya — agli request ka wait karo" });
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
        pickupLat: ridesTable.pickupLat,
        pickupLng: ridesTable.pickupLng,
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
      pickupLat: r.pickupLat != null ? parseFloat(String(r.pickupLat)) : null,
      pickupLng: r.pickupLng != null ? parseFloat(String(r.pickupLng)) : null,
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

/* ─── FORGOT PASSWORD ─────────────────────────────────────────────────────── */

router.post("/driver-auth/forgot-password", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone: string };
  if (!phone) { res.status(400).json({ success: false, message: "Phone number required hai" }); return; }

  try {
    const [driver] = await db
      .select({ id: driversTable.id, status: driversTable.status })
      .from(driversTable).where(eq(driversTable.phone, phone)).limit(1);

    if (!driver) {
      res.status(404).json({ success: false, message: "Yeh phone number registered nahi hai" });
      return;
    }
    if (driver.status === "blocked") {
      res.status(403).json({ success: false, message: "Aapka account block hai. Support se contact karein." });
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    driverResetOtps.set(phone, { otp, expiresAt });

    const { sent, dev } = await sendDriverResetOtp(phone, otp);
    res.json({
      success: true,
      message: sent ? "OTP bhej diya gaya" : "OTP ready (dev mode)",
      otp: dev ? otp : undefined,
      smsSent: sent,
    });
  } catch (err) {
    logger.error({ err }, "driver forgot-password error");
    res.status(500).json({ success: false, message: "OTP send nahi hua" });
  }
});

router.post("/driver-auth/reset-password", async (req: Request, res: Response) => {
  const { phone, otp, newPassword, step: flowStep } = req.body as {
    phone: string;
    otp: string;
    newPassword?: string;
    step: "verify" | "reset";
  };

  if (!phone || !otp) {
    res.status(400).json({ success: false, message: "Phone aur OTP required hain" });
    return;
  }

  const stored = driverResetOtps.get(phone);
  if (!stored) {
    res.status(400).json({ success: false, message: "OTP nahi mila. Dobara request karo." });
    return;
  }
  if (new Date() > stored.expiresAt) {
    driverResetOtps.delete(phone);
    res.status(400).json({ success: false, message: "OTP expire ho gaya. Dobara request karo." });
    return;
  }
  if (stored.otp !== otp) {
    res.status(400).json({ success: false, message: "OTP galat hai" });
    return;
  }

  if (flowStep === "verify") {
    res.json({ success: true, message: "OTP sahi hai. Naya password set karo." });
    return;
  }

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, message: "Password kam se kam 6 characters ka hona chahiye" });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(driversTable).set({ passwordHash }).where(eq(driversTable.phone, phone));
    driverResetOtps.delete(phone);
    res.json({ success: true, message: "Password reset ho gaya! Ab login karein." });
  } catch (err) {
    logger.error({ err }, "driver reset-password error");
    res.status(500).json({ success: false, message: "Password reset nahi hua" });
  }
});

/* ─── CHANGE PASSWORD (logged-in driver) ─────────────────────────────────── */

router.patch("/driver-auth/change-password", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Token required" });
    return;
  }
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ success: false, message: "Current aur new password dono required hain" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ success: false, message: "Naya password kam se kam 6 characters ka hona chahiye" });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ success: false, message: "Driver token required" }); return; }
    const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, payload.driverId)).limit(1);
    if (!driver) { res.status(404).json({ success: false, message: "Driver not found" }); return; }
    const match = await bcrypt.compare(currentPassword, driver.passwordHash ?? "");
    if (!match) { res.status(400).json({ success: false, message: "Current password galat hai" }); return; }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(driversTable).set({ passwordHash }).where(eq(driversTable.id, payload.driverId));
    res.json({ success: true, message: "Password successfully change ho gaya! 🎉" });
  } catch (err) {
    logger.error({ err }, "driver change-password error");
    res.status(500).json({ success: false, message: "Password change nahi hua, dobara try karo" });
  }
});

/* ─── DELETE ACCOUNT ──────────────────────────────────────────────────────── */

router.delete("/driver-auth/account", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ success: false, message: "Driver token required" }); return; }

    await db.update(driversTable)
      .set({ status: "deleted" as any, isOnline: false })
      .where(eq(driversTable.id, payload.driverId));

    res.json({ success: true, message: "Aapka driver account delete ho gaya. Bye bye! 👋" });
  } catch (err) {
    logger.error({ err }, "driver delete-account error");
    res.status(500).json({ success: false, message: "Account delete nahi hua" });
  }
});

/* GET /api/driver-auth/ratings — driver's rating summary + recent rated rides */
router.get("/driver-auth/ratings", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }

    /* Recalculate and update driver average from all rated rides (self-healing) */
    const [avgRow] = await db
      .select({ avgRating: avg(ridesTable.userRating), ratingCount: count() })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, payload.driverId), isNotNull(ridesTable.userRating)));

    const currentAvg = avgRow?.avgRating ? parseFloat(avgRow.avgRating).toFixed(2) : null;
    const ratingCount = avgRow?.ratingCount ?? 0;

    if (currentAvg) {
      await db
        .update(driversTable)
        .set({ rating: currentAvg })
        .where(eq(driversTable.id, payload.driverId));
    }

    /* Distribution: count of each star value 1-5 */
    const distribution = await db
      .select({ star: ridesTable.userRating, cnt: count() })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, payload.driverId), isNotNull(ridesTable.userRating)))
      .groupBy(ridesTable.userRating)
      .orderBy(desc(ridesTable.userRating));

    /* Recent 20 rated rides */
    const recentRatings = await db
      .select({
        rideId: ridesTable.id,
        userRating: ridesTable.userRating,
        pickupAddress: ridesTable.pickup,
        dropAddress: ridesTable.destination,
        createdAt: ridesTable.createdAt,
        price: ridesTable.price,
      })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, payload.driverId), isNotNull(ridesTable.userRating)))
      .orderBy(desc(ridesTable.createdAt))
      .limit(20);

    res.json({
      success: true,
      rating: currentAvg ? parseFloat(currentAvg) : null,
      ratingCount,
      distribution: distribution.map((d) => ({ star: d.star, count: d.cnt })),
      recentRatings,
    });
  } catch (err) {
    logger.error({ err }, "driver ratings fetch error");
    res.status(401).json({ message: "Invalid token" });
  }
});

/* GET /api/driver-auth/earnings — driver's earnings history (last 50 completed rides) */
router.get("/driver-auth/earnings", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }

    const rides = await db.select({
      id: ridesTable.id,
      price: ridesTable.price,
      driverEarning: ridesTable.driverEarning,
      vehicleType: ridesTable.vehicleType,
      paymentMethod: ridesTable.paymentMethod,
      createdAt: ridesTable.createdAt,
    })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, payload.driverId), eq(ridesTable.status, "completed")))
      .orderBy(desc(ridesTable.createdAt))
      .limit(50);

    const totalEarned = rides.reduce((s, r) => s + parseFloat(String(r.driverEarning ?? 0)), 0);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEarned = rides
      .filter(r => r.createdAt && new Date(r.createdAt) >= todayStart)
      .reduce((s, r) => s + parseFloat(String(r.driverEarning ?? 0)), 0);

    res.json({
      success: true,
      summary: {
        totalEarned: parseFloat(totalEarned.toFixed(2)),
        todayEarned: parseFloat(todayEarned.toFixed(2)),
        totalRides: rides.length,
      },
      rides,
    });
  } catch (err) {
    logger.error({ err }, "driver earnings fetch error");
    res.status(401).json({ message: "Invalid token" });
  }
});

/* PATCH /api/driver-auth/profile — update driver name / preferredLanguage */
router.patch("/driver-auth/profile", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }

    const { name, preferredLanguage } = req.body as { name?: string; preferredLanguage?: string };
    const updateData: Partial<{ name: string; preferredLanguage: string }> = {};
    if (name?.trim()) updateData.name = name.trim();
    if (preferredLanguage === "en" || preferredLanguage === "hi") updateData.preferredLanguage = preferredLanguage;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ message: "Kuch update karne ke liye bhejo (name ya preferredLanguage)" }); return;
    }

    const [updated] = await db
      .update(driversTable)
      .set(updateData)
      .where(eq(driversTable.id, payload.driverId))
      .returning({ id: driversTable.id, name: driversTable.name, phone: driversTable.phone, preferredLanguage: driversTable.preferredLanguage });

    res.json({ success: true, driver: updated });
  } catch (err) {
    logger.error({ err }, "driver profile update error");
    res.status(401).json({ message: "Invalid token" });
  }
});

/* GET /api/driver-auth/performance — driver's weekly performance stats (last 4 weeks) */
router.get("/driver-auth/performance", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const payload = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") { res.status(403).json({ message: "Driver token required" }); return; }

    const since = new Date();
    since.setDate(since.getDate() - 28);

    const rides = await db.select({
      id: ridesTable.id,
      status: ridesTable.status,
      cancelledBy: ridesTable.cancelledBy,
      driverEarning: ridesTable.driverEarning,
      createdAt: ridesTable.createdAt,
    })
      .from(ridesTable)
      .where(and(eq(ridesTable.driverId, payload.driverId), gte(ridesTable.createdAt, since)))
      .orderBy(desc(ridesTable.createdAt));

    const [driverRow] = await db.select({ rating: driversTable.rating })
      .from(driversTable).where(eq(driversTable.id, payload.driverId));

    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const dayOfWeek = startOfToday.getDay(); /* 0=Sun */

    /* Build 4 calendar weeks (Mon–Sun) ending with the current week */
    const weeks = [0, 1, 2, 3].map(w => {
      const weekStart = new Date(startOfToday);
      weekStart.setDate(startOfToday.getDate() - dayOfWeek - (w * 7) + 1); /* Monday */
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7); /* exclusive */

      const weekRides = rides.filter(r => {
        if (!r.createdAt) return false;
        const d = new Date(r.createdAt);
        return d >= weekStart && d < weekEnd;
      });

      const assigned = weekRides.length;
      const completed = weekRides.filter(r => r.status === "completed").length;
      const cancelledByDriver = weekRides.filter(r => r.status === "cancelled" && r.cancelledBy === "driver").length;
      const earnings = weekRides
        .filter(r => r.status === "completed")
        .reduce((s, r) => s + parseFloat(String(r.driverEarning ?? "0")), 0);

      const labels = ["Is Hafte", "Pichhle Hafte", "2 Hafte Pahle", "3 Hafte Pahle"];
      return {
        label: labels[w],
        weekStart: weekStart.toISOString(),
        assigned,
        completed,
        cancelledByDriver,
        completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
        cancelRate: assigned > 0 ? Math.round((cancelledByDriver / assigned) * 100) : 0,
        earnings: parseFloat(earnings.toFixed(2)),
      };
    });

    res.json({
      success: true,
      rating: driverRow?.rating ? parseFloat(String(driverRow.rating)) : null,
      thisWeek: weeks[0],
      weeks,
    });
  } catch (err) {
    logger.error({ err }, "driver performance fetch error");
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
