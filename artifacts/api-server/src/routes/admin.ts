import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  driversTable,
  ridesTable,
  driverKycTable,
  withdrawalRequestsTable,
  walletTransactionsTable,
  promoCodesTable,
  chatMessagesTable,
  planTransactionsTable,
  surgeSettingsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, and, gte, lte, isNotNull, ne, inArray, count, max, sum } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { validateAccountDetails, createRazorpayPayout } from "../lib/razorpay-payout";
import { sendPushNotification } from "../lib/expoPush";
import { isAutomationEnabled, setAutomationEnabled } from "../lib/automation-state";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";
const ADMIN_EMAIL = "admin.raftaarride@gmail.com";
const ADMIN_PASSWORD = "Luck@12345RR";

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

router.post("/admin/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }
  const token = jwt.sign({ role: "admin", email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, role: "admin" });
});

router.post("/admin/firebase-verify", async (req: Request, res: Response) => {
  const { idToken } = req.body as { idToken: string };
  if (!idToken) {
    res.status(400).json({ message: "idToken required" });
    return;
  }
  try {
    const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY ?? "AIzaSyC1bBRw_CsD8y_nlI5szxYk4aFZBxOVjW8";
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    const lookupData = await lookupRes.json() as { users?: Array<{ email: string }> };
    const firebaseUser = lookupData.users?.[0];
    if (!firebaseUser?.email) {
      res.status(401).json({ message: "Invalid Firebase token" });
      return;
    }
    if (firebaseUser.email !== ADMIN_EMAIL) {
      res.status(403).json({ message: "Not an admin account" });
      return;
    }
    const token = jwt.sign({ role: "admin", email: firebaseUser.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, role: "admin" });
  } catch {
    res.status(500).json({ message: "Firebase verification failed" });
  }
});

router.get("/admin/stats", authMiddleware, async (_req: Request, res: Response) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);

  const [
    totalUsersResult,
    totalDriversResult,
    totalRidesResult,
    completedRidesResult,
    cancelledRidesResult,
    earningsResult,
    earningsThisMonthResult,
    activeDriversResult,
    ridesThisMonthResult,
    avgRatingResult,
    totalFareAllResult,
    totalFareMonthResult,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(usersTable).then(r => r[0]),
    db.select({ count: sql<number>`count(*)` }).from(driversTable).then(r => r[0]),
    db.select({ count: sql<number>`count(*)` }).from(ridesTable).then(r => r[0]),
    db.select({ count: sql<number>`count(*)` }).from(ridesTable).where(eq(ridesTable.status, "completed")).then(r => r[0]),
    db.select({ count: sql<number>`count(*)` }).from(ridesTable).where(eq(ridesTable.status, "cancelled")).then(r => r[0]),
    db.select({ total: sql<number>`coalesce(sum(price::numeric), 0)` }).from(ridesTable).where(eq(ridesTable.status, "completed")).then(r => r[0]),
    db.select({ total: sql<number>`coalesce(sum(price::numeric), 0)` }).from(ridesTable).where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, thisMonthStart))).then(r => r[0]),
    db.select({ count: sql<number>`count(*)` }).from(driversTable).where(eq(driversTable.status, "active")).then(r => r[0]),
    db.select({ count: sql<number>`count(*)` }).from(ridesTable).where(gte(ridesTable.createdAt, thisMonthStart)).then(r => r[0]),
    db.select({ avg: sql<number>`coalesce(avg(rating::numeric), 0)` }).from(driversTable).then(r => r[0]),
    db.select({ total: sql<number>`coalesce(sum(price::numeric), 0)` }).from(ridesTable).where(ne(ridesTable.status, "cancelled")).then(r => r[0]),
    db.select({ total: sql<number>`coalesce(sum(price::numeric), 0)` }).from(ridesTable).where(and(ne(ridesTable.status, "cancelled"), gte(ridesTable.createdAt, thisMonthStart))).then(r => r[0]),
  ]);

  const convFeeExpr = sql<number>`coalesce(sum(
    CASE vehicle_type
      WHEN 'bike'  THEN 4
      WHEN 'auto'  THEN 6
      WHEN 'cab'   THEN 12
      WHEN 'prime' THEN 12
      WHEN 'suv'   THEN 15
      ELSE 12
    END
  ), 0)`;

  const [convFeeTotalResult, convFeeTodayResult, convFeeMonthResult] = await Promise.all([
    db.select({ total: convFeeExpr }).from(ridesTable).where(eq(ridesTable.status, "completed")).then(r => r[0]),
    db.select({ total: convFeeExpr }).from(ridesTable).where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, todayStart))).then(r => r[0]),
    db.select({ total: convFeeExpr }).from(ridesTable).where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, thisMonthStart))).then(r => r[0]),
  ]);

  res.json({
    totalRides: Number(totalRidesResult?.count ?? 0),
    totalUsers: Number(totalUsersResult?.count ?? 0),
    totalDrivers: Number(totalDriversResult?.count ?? 0),
    completedRides: Number(completedRidesResult?.count ?? 0),
    cancelledRides: Number(cancelledRidesResult?.count ?? 0),
    totalEarnings: Number(earningsResult?.total ?? 0),
    activeDrivers: Number(activeDriversResult?.count ?? 0),
    ridesThisMonth: Number(ridesThisMonthResult?.count ?? 0),
    earningsThisMonth: Number(earningsThisMonthResult?.total ?? 0),
    avgRating: Number(Number(avgRatingResult?.avg ?? 0).toFixed(1)),
    totalFareAll: Number(totalFareAllResult?.total ?? 0),
    totalFareThisMonth: Number(totalFareMonthResult?.total ?? 0),
    convenienceFeeTotal: Number(convFeeTotalResult?.total ?? 0),
    convenienceFeeToday: Number(convFeeTodayResult?.total ?? 0),
    convenienceFeeThisMonth: Number(convFeeMonthResult?.total ?? 0),
  });
});

router.get("/admin/users", authMiddleware, async (_req: Request, res: Response) => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

  const usersWithRides = await Promise.all(
    users.map(async (user) => {
      const [ridesCount] = await db.select({ count: sql<number>`count(*)` })
        .from(ridesTable).where(eq(ridesTable.userId, user.id));
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        totalRides: Number(ridesCount?.count ?? 0),
        createdAt: user.createdAt.toISOString(),
      };
    })
  );

  res.json(usersWithRides);
});

router.get("/admin/drivers", authMiddleware, async (_req: Request, res: Response) => {
  const drivers = await db.select().from(driversTable).orderBy(desc(driversTable.createdAt));

  const ratingStats = await db
    .select({
      driverId: ridesTable.driverId,
      avgRating: sql<number>`coalesce(avg(${ridesTable.userRating}), 0)`,
      ratingCount: sql<number>`count(${ridesTable.userRating})`,
    })
    .from(ridesTable)
    .where(sql`${ridesTable.userRating} is not null`)
    .groupBy(ridesTable.driverId);

  const statsMap = new Map(ratingStats.map((r) => [r.driverId, r]));

  res.json(
    drivers.map((d) => {
      const stats = statsMap.get(d.id);
      const liveRating = stats && Number(stats.ratingCount) > 0 ? Number(Number(stats.avgRating).toFixed(2)) : 0;
      return {
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        vehicleType: d.vehicleType,
        vehicleNumber: d.vehicleNumber,
        rating: liveRating,
        ratingCount: Number(stats?.ratingCount ?? 0),
        status: d.status,
        totalEarnings: Number(d.totalEarnings),
        walletBalance: Number(d.walletBalance ?? 0),
        totalRides: d.totalRides,
        isOnline: d.isOnline,
        createdAt: d.createdAt.toISOString(),
      };
    })
  );
});

router.get("/admin/rides", authMiddleware, async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };

  const rides = await db
    .select({
      id: ridesTable.id,
      userId: ridesTable.userId,
      driverId: ridesTable.driverId,
      userName: usersTable.name,
      driverName: driversTable.name,
      pickup: ridesTable.pickup,
      destination: ridesTable.destination,
      vehicleType: ridesTable.vehicleType,
      rideMode: ridesTable.rideMode,
      price: ridesTable.price,
      status: ridesTable.status,
      paymentMethod: ridesTable.paymentMethod,
      commissionAmount: ridesTable.commissionAmount,
      driverEarning: ridesTable.driverEarning,
      cashCollected: ridesTable.cashCollected,
      createdAt: ridesTable.createdAt,
    })
    .from(ridesTable)
    .leftJoin(usersTable, eq(ridesTable.userId, usersTable.id))
    .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
    .where(status ? eq(ridesTable.status, status) : undefined)
    .orderBy(desc(ridesTable.createdAt));

  res.json(
    rides.map((r) => ({
      id: r.id,
      userId: r.userId,
      driverId: r.driverId ?? null,
      userName: r.userName ?? "Unknown",
      driverName: r.driverName ?? null,
      pickup: r.pickup,
      destination: r.destination,
      vehicleType: r.vehicleType,
      rideMode: r.rideMode,
      price: Number(r.price),
      status: r.status,
      paymentMethod: r.paymentMethod ?? "Cash",
      commissionAmount: Number(r.commissionAmount ?? 0),
      driverEarning: Number(r.driverEarning ?? 0),
      cashCollected: r.cashCollected ?? false,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.get("/admin/rides/recent", authMiddleware, async (_req: Request, res: Response) => {
  const rides = await db
    .select({
      id: ridesTable.id,
      userId: ridesTable.userId,
      driverId: ridesTable.driverId,
      userName: usersTable.name,
      driverName: driversTable.name,
      pickup: ridesTable.pickup,
      destination: ridesTable.destination,
      vehicleType: ridesTable.vehicleType,
      rideMode: ridesTable.rideMode,
      price: ridesTable.price,
      status: ridesTable.status,
      createdAt: ridesTable.createdAt,
    })
    .from(ridesTable)
    .leftJoin(usersTable, eq(ridesTable.userId, usersTable.id))
    .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
    .orderBy(desc(ridesTable.createdAt))
    .limit(10);

  res.json(
    rides.map((r) => ({
      id: r.id,
      userId: r.userId,
      driverId: r.driverId ?? null,
      userName: r.userName ?? "Unknown",
      driverName: r.driverName ?? null,
      pickup: r.pickup,
      destination: r.destination,
      vehicleType: r.vehicleType,
      rideMode: r.rideMode,
      price: Number(r.price),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.get("/admin/analytics/daily", authMiddleware, async (_req: Request, res: Response) => {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d;
  });

  const analytics = await Promise.all(
    days.map(async (date) => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const [ridesResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ridesTable)
        .where(and(gte(ridesTable.createdAt, start), sql`${ridesTable.createdAt} <= ${end}`));

      const [earningsResult] = await db
        .select({ total: sql<number>`coalesce(sum(price::numeric), 0)` })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.status, "completed"),
            gte(ridesTable.createdAt, start),
            sql`${ridesTable.createdAt} <= ${end}`
          )
        );

      const [newUsersResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(usersTable)
        .where(and(gte(usersTable.createdAt, start), sql`${usersTable.createdAt} <= ${end}`));

      return {
        date: date.toISOString().split("T")[0],
        rides: Number(ridesResult?.count ?? 0),
        earnings: Number(earningsResult?.total ?? 0),
        newUsers: Number(newUsersResult?.count ?? 0),
      };
    })
  );

  res.json(analytics);
});

router.patch("/admin/rides/:id/assign", authMiddleware, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { driverId } = req.body as { driverId: number };

  const [updated] = await db
    .update(ridesTable)
    .set({ driverId, status: "assigned" })
    .where(eq(ridesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ message: "Ride not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updated.userId));
  const driver = driverId
    ? (await db.select().from(driversTable).where(eq(driversTable.id, driverId)))[0]
    : null;

  res.json({
    id: updated.id,
    userId: updated.userId,
    driverId: updated.driverId ?? null,
    userName: user?.name ?? "Unknown",
    driverName: driver?.name ?? null,
    pickup: updated.pickup,
    destination: updated.destination,
    vehicleType: updated.vehicleType,
    rideMode: updated.rideMode,
    price: Number(updated.price),
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.get("/admin/kyc", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const kycList = await db
      .select({
        id: driverKycTable.id,
        driverId: driverKycTable.driverId,
        driverName: driversTable.name,
        driverPhone: driversTable.phone,
        driverEmail: driversTable.email,
        vehicleType: driversTable.vehicleType,
        vehicleNumber: driversTable.vehicleNumber,
        aadhaarFront: driverKycTable.aadhaarFront,
        aadhaarBack: driverKycTable.aadhaarBack,
        licenseFront: driverKycTable.licenseFront,
        licenseBack: driverKycTable.licenseBack,
        rcFront: driverKycTable.rcFront,
        selfie: driverKycTable.selfie,
        status: driverKycTable.status,
        rejectionReason: driverKycTable.rejectionReason,
        verifiedAt: driverKycTable.verifiedAt,
        verifiedBy: driverKycTable.verifiedBy,
        createdAt: driverKycTable.createdAt,
      })
      .from(driverKycTable)
      .leftJoin(driversTable, eq(driverKycTable.driverId, driversTable.id))
      .orderBy(desc(driverKycTable.createdAt));

    res.json(kycList);
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.patch("/admin/kyc/:id/verify", authMiddleware, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { action, rejectionReason } = req.body as { action: "approve" | "reject"; rejectionReason?: string };

  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ message: "Action 'approve' ya 'reject' hona chahiye" });
    return;
  }

  try {
    const [kyc] = await db.select().from(driverKycTable).where(eq(driverKycTable.id, id)).limit(1);
    if (!kyc) { res.status(404).json({ message: "KYC record nahi mila" }); return; }

    const newStatus = action === "approve" ? "verified" : "rejected";

    const [updated] = await db.update(driverKycTable)
      .set({
        status: newStatus,
        rejectionReason: action === "reject" ? (rejectionReason ?? "Documents valid nahi hain") : null,
        verifiedAt: action === "approve" ? new Date() : null,
        verifiedBy: "admin",
      })
      .where(eq(driverKycTable.id, id))
      .returning();

    await db.update(driversTable)
      .set({
        kycStatus: newStatus,
        status: action === "approve" ? "active" : undefined,
      })
      .where(eq(driversTable.id, kyc.driverId));

    /* Push notification to driver */
    const [driverRecord] = await db
      .select({ pushToken: driversTable.pushToken, name: driversTable.name })
      .from(driversTable)
      .where(eq(driversTable.id, kyc.driverId))
      .limit(1);

    if (driverRecord?.pushToken) {
      if (action === "approve") {
        await sendPushNotification({
          to: driverRecord.pushToken,
          title: "✅ KYC Approved! Shukriya",
          body: "Aapki KYC verify ho gayi — ab aap rides accept kar sakte hain!",
          data: { type: "kyc_approved" },
        });
      } else {
        await sendPushNotification({
          to: driverRecord.pushToken,
          title: "❌ KYC Rejected",
          body: updated.rejectionReason ?? "Aapke documents reject ho gaye — dobara upload karo",
          data: { type: "kyc_rejected", reason: updated.rejectionReason },
        });
      }
    }

    res.json({ success: true, kyc: updated, message: action === "approve" ? "KYC approve ho gaya!" : "KYC reject ho gaya" });
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.get("/admin/withdrawals", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const withdrawals = await db
      .select({
        id: withdrawalRequestsTable.id,
        driverId: withdrawalRequestsTable.driverId,
        driverName: driversTable.name,
        driverPhone: driversTable.phone,
        amount: withdrawalRequestsTable.amount,
        method: withdrawalRequestsTable.method,
        accountDetails: withdrawalRequestsTable.accountDetails,
        status: withdrawalRequestsTable.status,
        processedAt: withdrawalRequestsTable.processedAt,
        processedBy: withdrawalRequestsTable.processedBy,
        rejectionReason: withdrawalRequestsTable.rejectionReason,
        transactionRef: withdrawalRequestsTable.transactionRef,
        razorpayPayoutId: withdrawalRequestsTable.razorpayPayoutId,
        autoProcessed: withdrawalRequestsTable.autoProcessed,
        validationError: withdrawalRequestsTable.validationError,
        processingNote: withdrawalRequestsTable.processingNote,
        createdAt: withdrawalRequestsTable.createdAt,
      })
      .from(withdrawalRequestsTable)
      .leftJoin(driversTable, eq(withdrawalRequestsTable.driverId, driversTable.id))
      .orderBy(desc(withdrawalRequestsTable.createdAt));

    res.json(withdrawals.map((w) => ({
      ...w,
      amount: Number(w.amount),
    })));
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.patch("/admin/withdrawals/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { action, transactionRef, rejectionReason } = req.body as {
    action: "approve" | "reject";
    transactionRef?: string;
    rejectionReason?: string;
  };

  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ message: "Action 'approve' ya 'reject' hona chahiye" });
    return;
  }

  try {
    const [wr] = await db.select().from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.id, id)).limit(1);
    if (!wr) { res.status(404).json({ message: "Withdrawal request nahi mili" }); return; }

    if (wr.status !== "pending") {
      res.status(400).json({ message: "Yeh request already process ho chuki hai" });
      return;
    }

    const [updated] = await db.update(withdrawalRequestsTable)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        processedAt: new Date(),
        processedBy: "admin",
        transactionRef: action === "approve" ? (transactionRef ?? `TXN${Date.now()}`) : null,
        rejectionReason: action === "reject" ? (rejectionReason ?? "Admin ne reject kiya") : null,
      })
      .where(eq(withdrawalRequestsTable.id, id))
      .returning();

    if (action === "reject") {
      const [driver] = await db.select({ walletBalance: driversTable.walletBalance })
        .from(driversTable).where(eq(driversTable.id, wr.driverId)).limit(1);
      if (driver) {
        const refundBalance = Number(driver.walletBalance) + Number(wr.amount);
        await db.update(driversTable)
          .set({ walletBalance: String(refundBalance) })
          .where(eq(driversTable.id, wr.driverId));
        await db.insert(walletTransactionsTable).values({
          driverId: wr.driverId,
          type: "credit",
          amount: String(Number(wr.amount)),
          description: `🔄 Withdrawal #${id} reject → ₹${Number(wr.amount)} refund ho gaya (Admin: ${rejectionReason ?? "Rejected"})`,
        });
      }
    }

    res.json({
      success: true,
      withdrawal: { ...updated, amount: Number(updated.amount) },
      message: action === "approve" ? "Withdrawal approve — payment process ho rahi hai" : "Withdrawal reject — amount refund ho gaya",
    });
  } catch { res.status(500).json({ message: "Server error" }); }
});

/* POST /api/admin/withdrawals/:id/retry — retry failed Razorpay payout */
router.post("/admin/withdrawals/:id/retry", authMiddleware, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const [wr] = await db
      .select({
        id: withdrawalRequestsTable.id,
        driverId: withdrawalRequestsTable.driverId,
        amount: withdrawalRequestsTable.amount,
        method: withdrawalRequestsTable.method,
        accountDetails: withdrawalRequestsTable.accountDetails,
        status: withdrawalRequestsTable.status,
        driverName: driversTable.name,
      })
      .from(withdrawalRequestsTable)
      .leftJoin(driversTable, eq(withdrawalRequestsTable.driverId, driversTable.id))
      .where(eq(withdrawalRequestsTable.id, id))
      .limit(1);

    if (!wr) { res.status(404).json({ message: "Withdrawal not found" }); return; }
    if (wr.status === "approved") { res.status(400).json({ message: "Already approved" }); return; }

    const amount = Number(wr.amount);
    const validation = validateAccountDetails(wr.method, wr.accountDetails);

    if (!validation.valid || !validation.parsedAccount) {
      res.status(400).json({ message: `Validation failed: ${validation.reason}` });
      return;
    }

    const payoutResult = await createRazorpayPayout({
      driverId: wr.driverId,
      driverName: wr.driverName ?? "Driver",
      amount,
      withdrawalId: id,
      parsedAccount: validation.parsedAccount,
    });

    if (payoutResult.success && payoutResult.payoutId) {
      await db.update(withdrawalRequestsTable).set({
        status: "approved",
        processedAt: new Date(),
        processedBy: "admin-retry",
        transactionRef: payoutResult.payoutId,
        razorpayPayoutId: payoutResult.payoutId,
        autoProcessed: "approved",
        processingNote: `Admin retry: Razorpay Payout ${payoutResult.payoutId} | UTR: ${payoutResult.utr ?? "pending"}`,
      }).where(eq(withdrawalRequestsTable.id, id));

      res.json({ success: true, message: "Payout re-initiated successfully", payoutId: payoutResult.payoutId });
    } else {
      res.status(502).json({ success: false, message: payoutResult.error ?? "Razorpay payout failed" });
    }
  } catch { res.status(500).json({ message: "Server error" }); }
});

/* POST /api/admin/drivers/:id/wallet/credit — manually credit driver wallet */
router.post("/admin/drivers/:id/wallet/credit", authMiddleware, async (req: Request, res: Response) => {
  const driverId = Number(req.params.id);
  const { amount, note } = req.body as { amount: number; note?: string };

  if (!driverId || isNaN(driverId)) {
    res.status(400).json({ success: false, message: "Invalid driver ID" });
    return;
  }
  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0 || parsedAmount > 50000) {
    res.status(400).json({ success: false, message: "Amount 1 se 50000 ke beech hona chahiye" });
    return;
  }

  try {
    const [driver] = await db
      .select({ walletBalance: driversTable.walletBalance, name: driversTable.name, phone: driversTable.phone })
      .from(driversTable).where(eq(driversTable.id, driverId)).limit(1);

    if (!driver) {
      res.status(404).json({ success: false, message: "Driver nahi mila" });
      return;
    }

    const prevBalance = Number(driver.walletBalance ?? 0);
    const newBalance = prevBalance + parsedAmount;
    const now = new Date().toISOString();

    await db.update(driversTable)
      .set({ walletBalance: newBalance.toFixed(2) })
      .where(eq(driversTable.id, driverId));

    const description = note?.trim()
      ? `Admin credit — ₹${parsedAmount} — ${note.trim()} [${now.slice(0,10)}]`
      : `Admin se manual credit — ₹${parsedAmount} [${now.slice(0,10)}]`;

    await db.insert(walletTransactionsTable).values({
      driverId,
      type: "credit",
      amount: parsedAmount.toFixed(2),
      description,
    });

    req.log?.info({ driverId, driver: driver.name, prevBalance, parsedAmount, newBalance }, "Admin manual wallet credit");

    res.json({
      success: true,
      driverName: driver.name,
      driverPhone: driver.phone,
      creditedAmount: parsedAmount,
      prevBalance,
      newBalance,
      message: `✅ ₹${parsedAmount} ${driver.name} ke wallet mein credit ho gaya! New balance: ₹${newBalance.toFixed(2)}`,
    });
  } catch (err) {
    req.log?.error(err, "Wallet credit error");
    res.status(500).json({ success: false, message: "Server error — dobara try karo" });
  }
});

// ── Automation Toggle ────────────────────────────────────────────────────────
router.get("/admin/automation", authMiddleware, (_req: Request, res: Response) => {
  res.json({ automationEnabled: isAutomationEnabled() });
});

router.post("/admin/automation", authMiddleware, (req: Request, res: Response) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled field boolean hona chahiye" });
    return;
  }
  setAutomationEnabled(enabled);
  res.json({
    automationEnabled: isAutomationEnabled(),
    message: enabled ? "✅ Auto-Processing ON ho gaya" : "⏸️ Auto-Processing OFF ho gaya",
  });
});

// ── Promo Codes ──────────────────────────────────────────────────────────────
router.get("/admin/promo-codes", authMiddleware, async (req: Request, res: Response) => {
  try {
    const codes = await db.select().from(promoCodesTable).orderBy(desc(promoCodesTable.createdAt));
    res.json(codes);
  } catch (err) {
    req.log?.error(err, "Promo list error");
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/admin/promo-codes", authMiddleware, async (req: Request, res: Response) => {
  const { code, discountPct, maxUses, expiresAt } = req.body as {
    code: string; discountPct: number; maxUses: number; expiresAt?: string;
  };
  if (!code || !discountPct || !maxUses) {
    res.status(400).json({ message: "code, discountPct, maxUses required hain" }); return;
  }
  if (discountPct < 1 || discountPct > 100) {
    res.status(400).json({ message: "discountPct 1-100 ke beech hona chahiye" }); return;
  }
  try {
    const [promo] = await db.insert(promoCodesTable).values({
      code: code.toUpperCase().trim(),
      discountPct,
      maxUses,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
    }).returning();
    res.status(201).json(promo);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ message: "Yeh code already exist karta hai" }); return;
    }
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/admin/promo-codes/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { isActive, maxUses, expiresAt } = req.body as { isActive?: boolean; maxUses?: number; expiresAt?: string | null };
  try {
    const updates: Record<string, any> = {};
    if (typeof isActive === "boolean") updates.isActive = isActive;
    if (typeof maxUses === "number") updates.maxUses = maxUses;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
    const [updated] = await db.update(promoCodesTable).set(updates).where(eq(promoCodesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ message: "Promo code nahi mila" }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/admin/promo-codes/:id", authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  try {
    const [deleted] = await db.delete(promoCodesTable).where(eq(promoCodesTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ message: "Promo code nahi mila" }); return; }
    res.json({ success: true, message: "Promo code delete ho gaya" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/admin/users/:id/status", authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { status } = req.body as { status: string };
  const allowed = ["active", "blocked", "suspended"];
  if (!allowed.includes(status)) { res.status(400).json({ message: "Invalid status" }); return; }
  try {
    const [updated] = await db.update(usersTable).set({ status }).where(eq(usersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ message: "User nahi mila" }); return; }
    res.json(updated);
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.patch("/admin/drivers/:id/status", authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { status } = req.body as { status: string };
  const allowed = ["active", "blocked", "suspended", "pending"];
  if (!allowed.includes(status)) { res.status(400).json({ message: "Invalid status" }); return; }
  try {
    const [updated] = await db.update(driversTable).set({
      status,
      isOnline: status === "blocked" || status === "suspended" ? false : undefined,
    }).where(eq(driversTable.id, id)).returning();
    if (!updated) { res.status(404).json({ message: "Driver nahi mila" }); return; }
    res.json(updated);
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.post("/admin/broadcast", authMiddleware, async (req: Request, res: Response) => {
  const { title, body, target } = req.body as { title: string; body: string; target: "users" | "drivers" | "all" };
  if (!title?.trim() || !body?.trim()) { res.status(400).json({ message: "Title aur body required hai" }); return; }
  if (!["users", "drivers", "all"].includes(target)) { res.status(400).json({ message: "Target must be users/drivers/all" }); return; }
  try {
    const tokens: string[] = [];
    if (target === "users" || target === "all") {
      const userTokens = await db.select({ pushToken: usersTable.pushToken }).from(usersTable)
        .where(and(isNotNull(usersTable.pushToken), ne(usersTable.pushToken, "")));
      userTokens.forEach((r) => { if (r.pushToken) tokens.push(r.pushToken); });
    }
    if (target === "drivers" || target === "all") {
      const driverTokens = await db.select({ pushToken: driversTable.pushToken }).from(driversTable)
        .where(and(isNotNull(driversTable.pushToken), ne(driversTable.pushToken, "")));
      driverTokens.forEach((r) => { if (r.pushToken) tokens.push(r.pushToken); });
    }
    let sent = 0;
    let failed = 0;
    for (const token of tokens) {
      try {
        await sendPushNotification({ to: token, title, body, data: { type: "broadcast" } });
        sent++;
      } catch { failed++; }
    }
    res.json({ success: true, total: tokens.length, sent, failed });
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.get("/admin/rides/export", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rides = await db
      .select({
        id: ridesTable.id, pickup: ridesTable.pickup, destination: ridesTable.destination,
        status: ridesTable.status, vehicleType: ridesTable.vehicleType, price: ridesTable.price,
        distanceKm: ridesTable.distanceKm, paymentMethod: ridesTable.paymentMethod,
        cancelReason: ridesTable.cancelReason, cancelledBy: ridesTable.cancelledBy,
        createdAt: ridesTable.createdAt,
        userName: usersTable.name, userPhone: usersTable.phone,
        driverName: driversTable.name, driverPhone: driversTable.phone,
      })
      .from(ridesTable)
      .leftJoin(usersTable, eq(ridesTable.userId, usersTable.id))
      .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
      .orderBy(desc(ridesTable.createdAt));
    res.json(rides);
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.get("/admin/users/export", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const users = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email,
      phone: usersTable.phone, status: usersTable.status,
      walletBalance: usersTable.walletBalance, isVerified: usersTable.isVerified,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt));
    res.json(users);
  } catch { res.status(500).json({ message: "Server error" }); }
});

router.get("/admin/drivers/export", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const drivers = await db.select({
      id: driversTable.id, name: driversTable.name, email: driversTable.email,
      phone: driversTable.phone, vehicleType: driversTable.vehicleType,
      vehicleNumber: driversTable.vehicleNumber, status: driversTable.status,
      kycStatus: driversTable.kycStatus, rating: driversTable.rating,
      totalRides: driversTable.totalRides, totalEarnings: driversTable.totalEarnings,
      walletBalance: driversTable.walletBalance, isOnline: driversTable.isOnline,
      createdAt: driversTable.createdAt,
    }).from(driversTable).orderBy(desc(driversTable.createdAt));
    res.json(drivers);
  } catch { res.status(500).json({ message: "Server error" }); }
});

/* ─── DRIVER PLANS ─── */

/* GET /api/admin/driver-plans — all drivers with plan status + earnings */
router.get("/admin/driver-plans", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const drivers = await db.select({
      id: driversTable.id,
      name: driversTable.name,
      phone: driversTable.phone,
      email: driversTable.email,
      vehicleType: driversTable.vehicleType,
      vehicleNumber: driversTable.vehicleNumber,
      status: driversTable.status,
      planType: driversTable.planType,
      planBilling: driversTable.planBilling,
      planStartAt: driversTable.planStartAt,
      planEndAt: driversTable.planEndAt,
      isTrial: driversTable.isTrial,
      trialUsed: driversTable.trialUsed,
      totalEarnings: driversTable.totalEarnings,
      walletBalance: driversTable.walletBalance,
      totalRides: driversTable.totalRides,
    }).from(driversTable).orderBy(desc(driversTable.createdAt));

    const now = new Date();
    const result = drivers.map((d) => {
      const endAt = d.planEndAt ? new Date(d.planEndAt) : null;
      const isActive = !!endAt && endAt > now;
      const daysLeft = isActive ? Math.ceil((endAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const planStatus = !d.planType ? "no_plan" : isActive ? (d.isTrial ? "trial" : "active") : "expired";
      return { ...d, isActive, daysLeft, planStatus };
    });

    res.json(result);
  } catch { res.status(500).json({ message: "Server error" }); }
});

/* PATCH /api/admin/driver-plans/:id/extend — manually extend driver plan */
router.patch("/admin/driver-plans/:id/extend", authMiddleware, async (req: Request, res: Response) => {
  try {
    const driverId = parseInt(String(req.params.id));
    const { days } = req.body as { days: number };
    if (!days || days < 1 || days > 365) {
      res.status(400).json({ message: "days must be 1–365" }); return;
    }
    const [driver] = await db.select({ planEndAt: driversTable.planEndAt, planType: driversTable.planType })
      .from(driversTable).where(eq(driversTable.id, driverId)).limit(1);
    if (!driver) { res.status(404).json({ message: "Driver not found" }); return; }

    const now = new Date();
    const currentEnd = driver.planEndAt ? new Date(driver.planEndAt) : null;
    const base = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    await db.update(driversTable).set({
      planEndAt: newEnd,
      planType: driver.planType ?? "cab",
      planStartAt: driver.planEndAt ? undefined : now,
    }).where(eq(driversTable.id, driverId));

    res.json({ success: true, newEndAt: newEnd.toISOString() });
  } catch { res.status(500).json({ message: "Server error" }); }
});

/* GET /api/admin/plan-revenue — plan purchase revenue stats + transactions */
router.get("/admin/plan-revenue", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [totalRow] = await db
      .select({ total: sql<string>`coalesce(sum(amount_rupees), 0)`, count: sql<string>`count(*)` })
      .from(planTransactionsTable);

    const [todayRow] = await db
      .select({ total: sql<string>`coalesce(sum(amount_rupees), 0)`, count: sql<string>`count(*)` })
      .from(planTransactionsTable)
      .where(gte(planTransactionsTable.createdAt, startOfToday));

    const [monthRow] = await db
      .select({ total: sql<string>`coalesce(sum(amount_rupees), 0)`, count: sql<string>`count(*)` })
      .from(planTransactionsTable)
      .where(gte(planTransactionsTable.createdAt, startOfMonth));

    const byVehicle = await db
      .select({
        vehicleType: planTransactionsTable.vehicleType,
        total: sql<string>`coalesce(sum(amount_rupees), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(planTransactionsTable)
      .groupBy(planTransactionsTable.vehicleType);

    const byBilling = await db
      .select({
        billing: planTransactionsTable.billing,
        total: sql<string>`coalesce(sum(amount_rupees), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(planTransactionsTable)
      .groupBy(planTransactionsTable.billing);

    const monthly = await db
      .select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        total: sql<string>`coalesce(sum(amount_rupees), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(planTransactionsTable)
      .where(gte(planTransactionsTable.createdAt, startOf6Months))
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

    const recent = await db
      .select({
        id: planTransactionsTable.id,
        driverId: planTransactionsTable.driverId,
        driverName: driversTable.name,
        driverPhone: driversTable.phone,
        vehicleType: driversTable.vehicleType,
        vehicleNumber: driversTable.vehicleNumber,
        planVehicleType: planTransactionsTable.vehicleType,
        billing: planTransactionsTable.billing,
        amountRupees: planTransactionsTable.amountRupees,
        razorpayPaymentId: planTransactionsTable.razorpayPaymentId,
        createdAt: planTransactionsTable.createdAt,
      })
      .from(planTransactionsTable)
      .innerJoin(driversTable, eq(planTransactionsTable.driverId, driversTable.id))
      .orderBy(desc(planTransactionsTable.createdAt))
      .limit(100);

    res.json({
      summary: {
        totalRevenue: Number(totalRow?.total ?? 0),
        totalTransactions: Number(totalRow?.count ?? 0),
        todayRevenue: Number(todayRow?.total ?? 0),
        todayTransactions: Number(todayRow?.count ?? 0),
        monthRevenue: Number(monthRow?.total ?? 0),
        monthTransactions: Number(monthRow?.count ?? 0),
      },
      byVehicle: byVehicle.map((r) => ({ vehicleType: r.vehicleType, total: Number(r.total), count: Number(r.count) })),
      byBilling: byBilling.map((r) => ({ billing: r.billing, total: Number(r.total), count: Number(r.count) })),
      monthly: monthly.map((r) => ({ month: r.month, total: Number(r.total), count: Number(r.count) })),
      recent: recent.map((r) => ({ ...r, amountRupees: Number(r.amountRupees) })),
    });
  } catch (err: any) { res.status(500).json({ message: "Server error", error: err?.message }); }
});

/* GET /api/admin/sms-balance — 2Factor.in SMS credits balance */
router.get("/admin/sms-balance", authMiddleware, async (req: Request, res: Response) => {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) { res.json({ credits: null, error: "API key not configured" }); return; }
  try {
    const r = await fetch(`https://2factor.in/API/V1/${apiKey}/BAL/SMS`);
    const data = (await r.json()) as { Status: string; Details: string };
    if (data.Status === "Success") {
      res.json({ credits: Number(data.Details ?? 0) });
    } else {
      req.log.warn({ details: data.Details }, "[2Factor] balance fetch failed");
      res.json({ credits: null, error: data.Details ?? "Unknown error" });
    }
  } catch (err: any) {
    res.json({ credits: null, error: err?.message });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * GET /api/admin/cloud-costs
 * Returns Google Cloud + Firebase current-month billing data.
 * Requires GOOGLE_SERVICE_ACCOUNT_KEY env var (JSON string of service-account key)
 * with roles: Billing Account Viewer + Cloud Asset Viewer on the billing account.
 * ────────────────────────────────────────────────────────────────────────── */
async function getGoogleAccessToken(serviceAccountJson: string, scope: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
  };
  const privateKey = sa.private_key.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, sub: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope },
    privateKey,
    { algorithm: "RS256" }
  );
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) throw new Error(tokenData.error ?? "Token exchange failed");
  return tokenData.access_token;
}

router.get("/admin/cloud-costs", authMiddleware, async (req: Request, res: Response) => {
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!saKey) {
    res.json({ configured: false });
    return;
  }

  try {
    const accessToken = await getGoogleAccessToken(
      saKey,
      "https://www.googleapis.com/auth/cloud-billing"
    );

    /* 1. List billing accounts */
    const accountsRes = await fetch("https://cloudbilling.googleapis.com/v1/billingAccounts", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const accountsData = (await accountsRes.json()) as {
      billingAccounts?: Array<{ name: string; displayName: string; open: boolean; masterBillingAccount?: string }>;
      error?: { message: string };
    };

    if (accountsData.error) {
      res.json({ configured: true, error: accountsData.error.message });
      return;
    }

    const accounts = accountsData.billingAccounts ?? [];
    const account = accounts.find((a) => a.displayName?.toLowerCase().includes("raftaar")) ?? accounts[0];

    if (!account) {
      res.json({ configured: true, error: "Koi billing account nahi mila" });
      return;
    }

    /* 2. Fetch budgets for this billing account */
    const budgetsRes = await fetch(
      `https://billingbudgets.googleapis.com/v1/${account.name}/budgets`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const budgetsData = (await budgetsRes.json()) as {
      budgets?: Array<{
        name: string;
        displayName?: string;
        amount?: { specifiedAmount?: { units?: string; nanos?: number }; lastPeriodAmount?: object };
        filter?: { projects?: string[] };
      }>;
      error?: { code: number; message: string; status: string };
    };

    const now = new Date();
    const monthLabel = now.toLocaleString("en-IN", { month: "long", year: "numeric" });

    /* Budget API disabled or permission error — return account info but flag budget issue */
    if (budgetsData.error) {
      req.log.warn({ code: budgetsData.error.code, status: budgetsData.error.status, msg: budgetsData.error.message, full: JSON.stringify(budgetsData.error) }, "[cloud-costs] budget API error");
      const isBudgetApiDisabled = budgetsData.error.message?.includes("has not been used") || budgetsData.error.message?.includes("disabled") || budgetsData.error.code === 403 || budgetsData.error.code === 400;
      res.json({
        configured: true,
        accountName: account.displayName,
        accountOpen: account.open,
        monthLabel,
        budgets: [],
        budgetApiError: isBudgetApiDisabled
          ? "BUDGET_API_DISABLED"
          : budgetsData.error.message,
        projectId: "796255910809",
        fetchedAt: new Date().toISOString(),
      });
      return;
    }

    const budgets = budgetsData.budgets ?? [];
    const budgetSummary = budgets.map((b) => {
      const budgetUnits = Number(b.amount?.specifiedAmount?.units ?? 0);
      return {
        name: b.displayName ?? b.name.split("/").pop() ?? "Budget",
        budgetAmount: budgetUnits,
        projects: b.filter?.projects ?? [],
      };
    });

    res.json({
      configured: true,
      accountName: account.displayName,
      accountOpen: account.open,
      monthLabel,
      budgets: budgetSummary,
      projectId: "796255910809",
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "[cloud-costs] fetch failed");
    res.json({ configured: true, error: err?.message ?? "Fetch failed" });
  }
});

/* GET /api/admin/maps-usage — Google Maps API live quota/usage check */
router.get("/admin/maps-usage", authMiddleware, async (req: Request, res: Response) => {
  const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";

  /* Test each API and check if it's responding */
  try {
    const [geocoding, directions, places] = await Promise.allSettled([
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Delhi&key=${mapsKey}`).then((r) => r.json()) as Promise<{ status: string }>,
      fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=Delhi&destination=Mumbai&key=${mapsKey}`).then((r) => r.json()) as Promise<{ status: string }>,
      fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Connaught&key=${mapsKey}`).then((r) => r.json()) as Promise<{ status: string }>,
    ]);

    const toStatus = (r: PromiseSettledResult<{ status: string }>) =>
      r.status === "fulfilled" ? (r.value.status === "OK" || r.value.status === "ZERO_RESULTS" ? "ok" : r.value.status) : "error";

    /* Google Maps free tier: $200/month credit (~28,500 Geocoding calls, ~40,000 Directions calls) */
    const GEOCODING_PRICE_PER_1K = 5;
    const DIRECTIONS_PRICE_PER_1K = 10;
    const PLACES_PRICE_PER_1K = 17;
    const FREE_CREDIT_USD = 200;
    const USD_TO_INR = 84;
    const freeCredit_INR = FREE_CREDIT_USD * USD_TO_INR;

    res.json({
      apis: {
        geocoding: toStatus(geocoding),
        directions: toStatus(directions),
        places: toStatus(places),
      },
      pricing: {
        geocodingPer1k: GEOCODING_PRICE_PER_1K,
        directionsPer1k: DIRECTIONS_PRICE_PER_1K,
        placesPer1k: PLACES_PRICE_PER_1K,
        freeCreditUSD: FREE_CREDIT_USD,
        freeCreditINR: freeCredit_INR,
        note: "$200/month free credit (~₹16,800) — renews each month",
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.json({ error: err?.message });
  }
});

/* GET /api/admin/surge — get current surge settings */
router.get("/admin/surge", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const [surge] = await db.select().from(surgeSettingsTable).orderBy(desc(surgeSettingsTable.updatedAt)).limit(1);
    res.json({ success: true, surge: surge ?? { multiplier: "1.00", isActive: false, reason: null, updatedAt: null } });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* POST /api/admin/surge — upsert surge settings */
router.post("/admin/surge", authMiddleware, async (req: Request, res: Response) => {
  const { multiplier, isActive, reason } = req.body as { multiplier?: number; isActive?: boolean; reason?: string };

  const mult = multiplier !== undefined ? Number(multiplier) : undefined;
  if (mult !== undefined && (isNaN(mult) || mult < 1 || mult > 5)) {
    res.status(400).json({ success: false, error: "Multiplier 1.0 se 5.0 ke beech hona chahiye" }); return;
  }

  try {
    const [existing] = await db.select({ id: surgeSettingsTable.id }).from(surgeSettingsTable).limit(1);
    const setData: Record<string, any> = { updatedAt: new Date(), updatedBy: "admin" };
    if (mult !== undefined) setData.multiplier = String(mult.toFixed(2));
    if (isActive !== undefined) setData.isActive = isActive;
    if (reason !== undefined) setData.reason = reason.trim() || null;

    let surge;
    if (existing) {
      [surge] = await db.update(surgeSettingsTable).set(setData).where(eq(surgeSettingsTable.id, existing.id)).returning();
    } else {
      [surge] = await db.insert(surgeSettingsTable).values({
        multiplier: String((mult ?? 1).toFixed(2)),
        isActive: isActive ?? false,
        reason: reason?.trim() || null,
        updatedBy: "admin",
      }).returning();
    }
    res.json({ success: true, surge });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* GET /api/admin/earnings — earnings report with date filter */
router.get("/admin/earnings", authMiddleware, async (req: Request, res: Response) => {
  const { from, to, limit = "200", offset = "0" } = req.query as { from?: string; to?: string; limit?: string; offset?: string };

  try {
    const conditions = [eq(ridesTable.status, "completed")];
    if (from) conditions.push(gte(ridesTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(ridesTable.createdAt, new Date(to + "T23:59:59")));

    const rides = await db.select({
      id: ridesTable.id,
      price: ridesTable.price,
      vehicleType: ridesTable.vehicleType,
      paymentMethod: ridesTable.paymentMethod,
      driverEarning: ridesTable.driverEarning,
      commissionAmount: ridesTable.commissionAmount,
      createdAt: ridesTable.createdAt,
    })
      .from(ridesTable)
      .where(and(...conditions))
      .orderBy(desc(ridesTable.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const totalRevenue = rides.reduce((s, r) => s + parseFloat(String(r.price ?? 0)), 0);
    const totalDriverEarnings = rides.reduce((s, r) => s + parseFloat(String(r.driverEarning ?? 0)), 0);
    const totalPlatformFees = parseFloat((totalRevenue - totalDriverEarnings).toFixed(2));

    const byPaymentMethod: Record<string, { count: number; revenue: number }> = {};
    const byVehicle: Record<string, { count: number; revenue: number }> = {};
    for (const r of rides) {
      const pm = r.paymentMethod ?? "Unknown";
      const vt = (r.vehicleType ?? "Unknown").toLowerCase();
      byPaymentMethod[pm] = byPaymentMethod[pm] ?? { count: 0, revenue: 0 };
      byPaymentMethod[pm].count++; byPaymentMethod[pm].revenue += parseFloat(String(r.price ?? 0));
      byVehicle[vt] = byVehicle[vt] ?? { count: 0, revenue: 0 };
      byVehicle[vt].count++; byVehicle[vt].revenue += parseFloat(String(r.price ?? 0));
    }
    for (const k of Object.keys(byPaymentMethod)) byPaymentMethod[k].revenue = parseFloat(byPaymentMethod[k].revenue.toFixed(2));
    for (const k of Object.keys(byVehicle)) byVehicle[k].revenue = parseFloat(byVehicle[k].revenue.toFixed(2));

    res.json({
      success: true,
      summary: {
        totalRides: rides.length, totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalDriverEarnings: parseFloat(totalDriverEarnings.toFixed(2)),
        totalPlatformFees, byPaymentMethod, byVehicle,
      },
      rides,
    });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* GET /api/admin/live-rides — active rides with driver + user coordinates for live map */
router.get("/admin/live-rides", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rides = await db
      .select({
        id: ridesTable.id,
        pickup: ridesTable.pickup,
        destination: ridesTable.destination,
        pickupLat: ridesTable.pickupLat,
        pickupLng: ridesTable.pickupLng,
        dropLat: ridesTable.dropLat,
        dropLng: ridesTable.dropLng,
        status: ridesTable.status,
        vehicleType: ridesTable.vehicleType,
        price: ridesTable.price,
        createdAt: ridesTable.createdAt,
        userName: usersTable.name,
        userPhone: usersTable.phone,
        driverName: driversTable.name,
        driverPhone: driversTable.phone,
        driverLat: driversTable.driverLat,
        driverLng: driversTable.driverLng,
      })
      .from(ridesTable)
      .innerJoin(usersTable, eq(ridesTable.userId, usersTable.id))
      .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
      .where(inArray(ridesTable.status, ["searching", "accepted", "arrived", "onRide"]))
      .orderBy(desc(ridesTable.createdAt))
      .limit(100);

    res.json(rides);
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* GET /api/admin/chats/recent — rides that have chat messages, most recent first */
router.get("/admin/chats/recent", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const threads = await db
      .select({
        rideId: ridesTable.id,
        pickup: ridesTable.pickup,
        destination: ridesTable.destination,
        status: ridesTable.status,
        userName: usersTable.name,
        driverName: driversTable.name,
        messageCount: count(chatMessagesTable.id),
        lastAt: max(chatMessagesTable.createdAt),
      })
      .from(chatMessagesTable)
      .innerJoin(ridesTable, eq(chatMessagesTable.rideId, ridesTable.id))
      .innerJoin(usersTable, eq(ridesTable.userId, usersTable.id))
      .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
      .groupBy(ridesTable.id, ridesTable.pickup, ridesTable.destination, ridesTable.status, usersTable.name, driversTable.name)
      .orderBy(desc(max(chatMessagesTable.createdAt)))
      .limit(50);

    /* For each thread get the last message text using a subquery approach */
    const rideIds = threads.map(t => t.rideId);
    let lastMsgMap: Record<number, string> = {};
    if (rideIds.length > 0) {
      const lastMsgs = await db
        .select({ rideId: chatMessagesTable.rideId, message: chatMessagesTable.message, createdAt: chatMessagesTable.createdAt })
        .from(chatMessagesTable)
        .where(inArray(chatMessagesTable.rideId, rideIds))
        .orderBy(desc(chatMessagesTable.createdAt));
      for (const msg of lastMsgs) {
        if (!lastMsgMap[msg.rideId]) lastMsgMap[msg.rideId] = msg.message;
      }
    }

    res.json(threads.map(t => ({ ...t, messageCount: Number(t.messageCount), lastMessage: lastMsgMap[t.rideId] ?? null })));
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* GET /api/admin/chat/:rideId — all messages + ride detail for a specific ride */
router.get("/admin/chat/:rideId", authMiddleware, async (req: Request, res: Response) => {
  const rideId = parseInt(String(req.params.rideId), 10);
  if (isNaN(rideId)) { res.status(400).json({ success: false, error: "Invalid rideId" }); return; }

  try {
    const [[rideRow], messages] = await Promise.all([
      db
        .select({ id: ridesTable.id, pickup: ridesTable.pickup, destination: ridesTable.destination, status: ridesTable.status, userName: usersTable.name, driverName: driversTable.name })
        .from(ridesTable)
        .innerJoin(usersTable, eq(ridesTable.userId, usersTable.id))
        .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
        .where(eq(ridesTable.id, rideId))
        .limit(1),
      db
        .select({ id: chatMessagesTable.id, rideId: chatMessagesTable.rideId, senderType: chatMessagesTable.senderType, senderId: chatMessagesTable.senderId, message: chatMessagesTable.message, createdAt: chatMessagesTable.createdAt })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.rideId, rideId))
        .orderBy(chatMessagesTable.createdAt),
    ]);

    if (!rideRow) { res.status(404).json({ success: false, error: "Ride nahi mili" }); return; }
    res.json({ ride: rideRow, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* GET /api/admin/referrals — referral stats and top referrers */
router.get("/admin/referrals", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const [totalUsers, usersWithReferral, usersReferred, topReferrers] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(usersTable),
      db.select({ count: sql<number>`count(*)` }).from(usersTable).where(isNotNull(usersTable.referralCode)),
      db.select({ count: sql<number>`count(*)` }).from(usersTable).where(isNotNull(usersTable.referredBy)),
      db.select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        referralCode: usersTable.referralCode,
        referredCount: sql<number>`(select count(*) from users where referred_by = ${usersTable.referralCode})`,
        joinedAt: usersTable.createdAt,
      })
        .from(usersTable)
        .where(isNotNull(usersTable.referralCode))
        .orderBy(desc(sql`(select count(*) from users where referred_by = ${usersTable.referralCode})`))
        .limit(20),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers: Number(totalUsers[0]?.count ?? 0),
        usersWithReferralCode: Number(usersWithReferral[0]?.count ?? 0),
        usersReferredByOthers: Number(usersReferred[0]?.count ?? 0),
        conversionRate: totalUsers[0]?.count
          ? ((Number(usersReferred[0]?.count ?? 0) / Number(totalUsers[0].count)) * 100).toFixed(1)
          : "0",
      },
      topReferrers: topReferrers.map((u) => ({
        ...u,
        referredCount: Number(u.referredCount),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* GET /api/admin/pending-commissions — list drivers with pending cash commissions */
router.get("/admin/pending-commissions", authMiddleware, async (_req: Request, res: Response) => {
  try {
    /* Total pending amount across all rides */
    const [totalRow] = await db
      .select({ total: sum(ridesTable.commissionAmount) })
      .from(ridesTable)
      .where(eq(ridesTable.commissionStatus, "pending"));

    const [countRow] = await db
      .select({ count: count() })
      .from(ridesTable)
      .where(eq(ridesTable.commissionStatus, "pending"));

    /* Per-driver breakdown */
    const driverRows = await db
      .select({
        driverId: driversTable.id,
        name: driversTable.name,
        phone: driversTable.phone,
        pendingCommission: driversTable.pendingCommission,
        walletBalance: driversTable.walletBalance,
      })
      .from(driversTable)
      .where(sql`CAST(${driversTable.pendingCommission} AS NUMERIC) > 0`)
      .orderBy(desc(driversTable.pendingCommission));

    res.json({
      success: true,
      totalPending: Number(totalRow?.total ?? 0),
      pendingRides: Number(countRow?.count ?? 0),
      drivers: driverRows.map((d) => ({
        ...d,
        pendingCommission: Number(d.pendingCommission ?? 0),
        walletBalance: Number(d.walletBalance ?? 0),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* POST /api/admin/pending-commissions/:driverId/collect — mark driver's pending commission as collected */
router.post("/admin/pending-commissions/:driverId/collect", authMiddleware, async (req: Request, res: Response) => {
  const driverId = Number(req.params.driverId);
  if (!driverId) { res.status(400).json({ success: false, error: "Invalid driverId" }); return; }

  try {
    const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, driverId)).limit(1);
    if (!driver) { res.status(404).json({ success: false, error: "Driver nahi mila" }); return; }

    const pendingAmt = parseFloat(String(driver.pendingCommission ?? "0"));
    if (pendingAmt <= 0) { res.json({ success: true, message: "Koi pending commission nahi hai" }); return; }

    /* Mark all pending rides as manually_collected */
    await db.update(ridesTable)
      .set({ commissionStatus: "manually_collected" })
      .where(and(eq(ridesTable.driverId, driverId), eq(ridesTable.commissionStatus, "pending")));

    /* Clear driver's pendingCommission */
    await db.update(driversTable)
      .set({ pendingCommission: "0.00" })
      .where(eq(driversTable.id, driverId));

    /* Wallet transaction record */
    await db.insert(walletTransactionsTable).values({
      driverId,
      type: "commission_collected",
      amount: String(-pendingAmt),
      description: `Admin ne manually ₹${pendingAmt.toFixed(2)} pending commission collect ki`,
    });

    res.json({ success: true, message: `₹${pendingAmt.toFixed(2)} pending commission collected`, collected: pendingAmt });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
