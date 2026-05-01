import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  driversTable,
  driverKycTable,
  withdrawalRequestsTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { validateAccountDetails, createRazorpayPayout } from "../lib/razorpay-payout";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";
const COMMISSION_RATE = 0.067;

interface JwtPayload { driverId: number; email: string; role: string; }

function driverAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    (req as any).driverId = payload.driverId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

router.post("/driver/kyc", driverAuth, async (req: Request, res: Response) => {
  const driverId = (req as any).driverId;
  const { aadhaarFront, aadhaarBack, licenseFront, licenseBack, rcFront, selfie } = req.body as {
    aadhaarFront?: string;
    aadhaarBack?: string;
    licenseFront?: string;
    licenseBack?: string;
    rcFront?: string;
    selfie?: string;
  };

  const MAX_SIZE = 500 * 1024;
  const fields = [aadhaarFront, aadhaarBack, licenseFront, licenseBack, rcFront, selfie];
  for (const f of fields) {
    if (f && f.length > MAX_SIZE) {
      res.status(400).json({ success: false, error: "Document size 500KB se zyada nahi honi chahiye" });
      return;
    }
  }

  try {
    const existing = await db.select().from(driverKycTable)
      .where(eq(driverKycTable.driverId, driverId)).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(driverKycTable)
        .set({
          aadhaarFront: aadhaarFront ?? existing[0].aadhaarFront,
          aadhaarBack: aadhaarBack ?? existing[0].aadhaarBack,
          licenseFront: licenseFront ?? existing[0].licenseFront,
          licenseBack: licenseBack ?? existing[0].licenseBack,
          rcFront: rcFront ?? existing[0].rcFront,
          selfie: selfie ?? existing[0].selfie,
          status: "pending",
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(driverKycTable.driverId, driverId))
        .returning();
      await db.update(driversTable).set({ kycStatus: "pending" }).where(eq(driversTable.id, driverId));
      res.json({ success: true, kyc: updated, message: "KYC documents update ho gaye — review pending" });
    } else {
      const [inserted] = await db.insert(driverKycTable).values({
        driverId,
        aadhaarFront,
        aadhaarBack,
        licenseFront,
        licenseBack,
        rcFront,
        selfie,
        status: "pending",
      }).returning();
      await db.update(driversTable).set({ kycStatus: "pending" }).where(eq(driversTable.id, driverId));
      res.json({ success: true, kyc: inserted, message: "KYC documents submit ho gaye — review hoga jald!" });
    }
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

router.get("/driver/kyc", driverAuth, async (req: Request, res: Response) => {
  const driverId = (req as any).driverId;
  try {
    const [kyc] = await db.select().from(driverKycTable)
      .where(eq(driverKycTable.driverId, driverId)).limit(1);
    res.json({ success: true, kyc: kyc ?? null });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

router.get("/driver/wallet", driverAuth, async (req: Request, res: Response) => {
  const driverId = (req as any).driverId;
  try {
    const [driver] = await db.select({
      walletBalance: driversTable.walletBalance,
      totalEarnings: driversTable.totalEarnings,
    }).from(driversTable).where(eq(driversTable.id, driverId)).limit(1);

    if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }

    const txns = await db.select().from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.driverId, driverId))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(20);

    const pendingWithdrawals = await db.select().from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.driverId, driverId))
      .orderBy(desc(withdrawalRequestsTable.createdAt))
      .limit(10);

    res.json({
      success: true,
      balance: Number(driver.walletBalance),
      totalEarnings: Number(driver.totalEarnings),
      commissionRate: COMMISSION_RATE,
      transactions: txns,
      withdrawals: pendingWithdrawals,
    });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

router.post("/driver/wallet/withdraw", driverAuth, async (req: Request, res: Response) => {
  const driverId = (req as any).driverId;
  const { amount, method, accountDetails } = req.body as {
    amount: number;
    method: string;
    accountDetails: string;
  };

  if (!amount || amount < 50) {
    res.status(400).json({ success: false, error: "Minimum withdrawal ₹50 hai" });
    return;
  }

  const validMethods = ["upi", "paytm", "phonepe", "bank"];
  if (!method || !validMethods.includes(method)) {
    res.status(400).json({ success: false, error: "Invalid withdrawal method" });
    return;
  }

  if (!accountDetails || accountDetails.trim().length < 5) {
    res.status(400).json({ success: false, error: "Account details required" });
    return;
  }

  try {
    const [driver] = await db.select({ walletBalance: driversTable.walletBalance, name: driversTable.name })
      .from(driversTable).where(eq(driversTable.id, driverId)).limit(1);

    if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }

    // ── Daily limit: max 2 withdrawals per day ────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const allWithdrawals = await db
      .select({ createdAt: withdrawalRequestsTable.createdAt, status: withdrawalRequestsTable.status })
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.driverId, driverId));

    const todayCount = allWithdrawals.filter(
      (w) => new Date(w.createdAt ?? 0) >= todayStart
    ).length;

    if (todayCount >= 2) {
      res.status(429).json({
        success: false,
        error: "Aaj ke liye withdrawal limit ho gayi. Aap per day sirf 2 baar withdrawal kar sakte hain.",
      });
      return;
    }

    const driverName = driver.name ?? "Driver";
    const balance = Number(driver.walletBalance);
    if (balance < amount) {
      res.status(400).json({ success: false, error: `Insufficient balance — aapke paas ₹${balance.toFixed(2)} hain` });
      return;
    }

    const newBalance = balance - amount;
    await db.update(driversTable)
      .set({ walletBalance: String(newBalance) })
      .where(eq(driversTable.id, driverId));

    // ── Auto-validate account details ─────────────────────────────────────
    const validation = validateAccountDetails(method, accountDetails);

    const [withdrawal] = await db.insert(withdrawalRequestsTable).values({
      driverId,
      amount: String(amount),
      method,
      accountDetails,
      status: "pending",
      validationError: validation.valid ? null : validation.reason,
    }).returning();

    await db.insert(walletTransactionsTable).values({
      driverId,
      type: "withdrawal",
      amount: String(-amount),
      description: `Withdrawal request via ${method.toUpperCase()} — ₹${amount}`,
    });

    // ── Auto-process asynchronously (don't block the response) ────────────
    void autoProcessWithdrawal(withdrawal.id, driverId, driverName ?? "Driver", amount, method, accountDetails, validation).catch(console.error);

    res.json({
      success: true,
      withdrawal,
      newBalance,
      validationOk: validation.valid,
      message: validation.valid
        ? `₹${amount} withdrawal request submit ho gayi — automatic processing shuru ho rahi hai!`
        : `₹${amount} withdrawal request submit ho gayi — lekin account details mein error hai: ${validation.reason}`,
    });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

// ─── Auto-process a withdrawal request ──────────────────────────────────────
async function autoProcessWithdrawal(
  withdrawalId: number,
  driverId: number,
  driverName: string,
  amount: number,
  method: string,
  accountDetails: string,
  validation: ReturnType<typeof validateAccountDetails>
) {
  try {
    if (!validation.valid || !validation.parsedAccount) {
      // Auto-reject: invalid details → refund driver wallet
      const rejectReason = validation.reason ?? "Account details format galat hai";
      await db.update(withdrawalRequestsTable).set({
        status: "rejected",
        processedAt: new Date(),
        processedBy: "auto-system",
        rejectionReason: `❌ Auto-Rejected: ${rejectReason}`,
        autoProcessed: "rejected",
        processingNote: `Automatic rejection — ${rejectReason}`,
      }).where(eq(withdrawalRequestsTable.id, withdrawalId));

      // Refund to wallet
      const [drv] = await db.select({ walletBalance: driversTable.walletBalance })
        .from(driversTable).where(eq(driversTable.id, driverId)).limit(1);
      if (drv) {
        await db.update(driversTable)
          .set({ walletBalance: String(Number(drv.walletBalance) + amount) })
          .where(eq(driversTable.id, driverId));
        await db.insert(walletTransactionsTable).values({
          driverId,
          type: "credit",
          amount: String(amount),
          description: `🔄 Withdrawal Rejected & Refunded ₹${amount} — Reason: ${rejectReason}`,
        });
      }
      return;
    }

    // Try Razorpay Payout
    const payoutResult = await createRazorpayPayout({
      driverId,
      driverName,
      amount,
      withdrawalId,
      parsedAccount: validation.parsedAccount,
    });

    if (payoutResult.success && payoutResult.payoutId) {
      // Auto-approve with Razorpay payout ID
      await db.update(withdrawalRequestsTable).set({
        status: "approved",
        processedAt: new Date(),
        processedBy: "auto-system",
        transactionRef: payoutResult.payoutId,
        razorpayPayoutId: payoutResult.payoutId,
        autoProcessed: "approved",
        processingNote: `Razorpay Payout: ${payoutResult.payoutId} | UTR: ${payoutResult.utr ?? "pending"} | Status: ${payoutResult.status}`,
      }).where(eq(withdrawalRequestsTable.id, withdrawalId));
    } else if (!payoutResult.razorpayEnabled) {
      // RazorpayX not configured — keep pending for admin manual review
      await db.update(withdrawalRequestsTable).set({
        autoProcessed: "pending_manual",
        validationError: null,
        processingNote: `Validation passed ✅ | Razorpay payout not configured — manual transfer required`,
      }).where(eq(withdrawalRequestsTable.id, withdrawalId));
    } else {
      // Razorpay error — keep pending for admin retry
      await db.update(withdrawalRequestsTable).set({
        autoProcessed: "payout_failed",
        validationError: payoutResult.error,
        processingNote: `Validation passed ✅ | Payout failed: ${payoutResult.error}`,
      }).where(eq(withdrawalRequestsTable.id, withdrawalId));
    }
  } catch (err: any) {
    console.error("[autoProcessWithdrawal] Error:", err?.message);
  }
}

router.patch("/driver/language", driverAuth, async (req: Request, res: Response) => {
  const driverId = (req as any).driverId;
  const { language } = req.body as { language: string };
  if (!["hi", "en"].includes(language)) {
    res.status(400).json({ success: false, error: "Language 'hi' ya 'en' hona chahiye" });
    return;
  }
  try {
    await db.update(driversTable).set({ preferredLanguage: language }).where(eq(driversTable.id, driverId));
    res.json({ success: true, language });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

export default router;
