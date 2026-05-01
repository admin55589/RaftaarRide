import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  driversTable,
  ridesTable,
  driverKycTable,
  withdrawalRequestsTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
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
    const FIREBASE_API_KEY = "AIzaSyC1bBRw_CsD8y_nlI5szxYk4aFZBxOVjW8";
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
  const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const [totalDriversResult] = await db.select({ count: sql<number>`count(*)` }).from(driversTable);
  const [totalRidesResult] = await db.select({ count: sql<number>`count(*)` }).from(ridesTable);
  const [earningsResult] = await db.select({
    total: sql<number>`coalesce(sum(price::numeric), 0)`,
  }).from(ridesTable).where(eq(ridesTable.status, "completed"));

  const [activeDriversResult] = await db.select({ count: sql<number>`count(*)` })
    .from(driversTable)
    .where(eq(driversTable.status, "active"));

  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);

  const [ridesThisMonthResult] = await db.select({ count: sql<number>`count(*)` })
    .from(ridesTable)
    .where(gte(ridesTable.createdAt, thisMonthStart));

  const [earningsThisMonthResult] = await db.select({
    total: sql<number>`coalesce(sum(price::numeric), 0)`,
  }).from(ridesTable).where(
    and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, thisMonthStart))
  );

  const [avgRatingResult] = await db.select({
    avg: sql<number>`coalesce(avg(rating::numeric), 0)`,
  }).from(driversTable);

  res.json({
    totalRides: Number(totalRidesResult?.count ?? 0),
    totalUsers: Number(totalUsersResult?.count ?? 0),
    totalDrivers: Number(totalDriversResult?.count ?? 0),
    totalEarnings: Number(earningsResult?.total ?? 0),
    activeDrivers: Number(activeDriversResult?.count ?? 0),
    ridesThisMonth: Number(ridesThisMonthResult?.count ?? 0),
    earningsThisMonth: Number(earningsThisMonthResult?.total ?? 0),
    avgRating: Number(Number(avgRatingResult?.avg ?? 0).toFixed(1)),
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
  res.json(
    drivers.map((d) => ({
      id: d.id,
      name: d.name,
      email: d.email,
      phone: d.phone,
      vehicleType: d.vehicleType,
      vehicleNumber: d.vehicleNumber,
      rating: Number(d.rating),
      status: d.status,
      totalEarnings: Number(d.totalEarnings),
      walletBalance: Number(d.walletBalance ?? 0),
      totalRides: d.totalRides,
      createdAt: d.createdAt.toISOString(),
    }))
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
        status: action === "approve" ? "active" : driversTable.status,
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

export default router;
