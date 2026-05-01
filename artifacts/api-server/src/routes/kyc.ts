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

  // ── Basic input checks ─────────────────────────────────────────────────
  if (!amount || amount < 100) {
    res.status(400).json({ success: false, error: "Minimum withdrawal ₹100 hai" });
    return;
  }
  if (amount > 50000) {
    res.status(400).json({ success: false, error: "Ek baar mein maximum ₹50,000 withdraw ho sakta hai" });
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
    // ── Fetch driver details (phone needed for cross-verification) ─────────
    const [driver] = await db.select({
      walletBalance: driversTable.walletBalance,
      name: driversTable.name,
      phone: driversTable.phone,
    }).from(driversTable).where(eq(driversTable.id, driverId)).limit(1);

    if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }

    // ── SECURITY: Rate limiting — max 1 pending withdrawal at a time ──────
    const [existingPending] = await db
      .select({ id: withdrawalRequestsTable.id })
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.driverId, driverId))
      .orderBy(desc(withdrawalRequestsTable.createdAt))
      .limit(1);

    if (existingPending) {
      const [latestReq] = await db
        .select({ status: withdrawalRequestsTable.status, createdAt: withdrawalRequestsTable.createdAt })
        .from(withdrawalRequestsTable)
        .where(eq(withdrawalRequestsTable.driverId, driverId))
        .orderBy(desc(withdrawalRequestsTable.createdAt))
        .limit(1);

      if (latestReq?.status === "pending") {
        res.status(429).json({ success: false, error: "Aapki pehli withdrawal request abhi pending hai. Pehle woh process ho jaaye." });
        return;
      }

      // ── SECURITY: Cooldown — 1 hour between withdrawals ─────────────────
      const lastTime = new Date(latestReq.createdAt).getTime();
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (lastTime > oneHourAgo) {
        const minsLeft = Math.ceil((lastTime - oneHourAgo) / 60000);
        res.status(429).json({ success: false, error: `Agli withdrawal ${minsLeft} minute baad kar sakte hain` });
        return;
      }
    }

    // ── SECURITY: Daily withdrawal cap — max ₹10,000/day ─────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayWithdrawals = await db
      .select({ amount: withdrawalRequestsTable.amount, createdAt: withdrawalRequestsTable.createdAt })
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.driverId, driverId));

    const todayTotal = todayWithdrawals
      .filter(w => new Date(w.createdAt ?? 0) >= todayStart)
      .reduce((sum, w) => sum + Number(w.amount), 0);

    if (todayTotal + amount > 10000) {
      res.status(400).json({
        success: false,
        error: `Aaj ka daily limit ₹10,000 hai. Aapne aaj ₹${todayTotal.toFixed(0)} withdraw kiye hain. Sirf ₹${(10000 - todayTotal).toFixed(0)} aur withdraw ho sakta hai.`,
      });
      return;
    }

    // ── SECURITY: Phone number cross-verification ─────────────────────────
    const registeredPhone = (driver.phone ?? "").replace(/\D/g, "").slice(-10);
    const detail = accountDetails.trim();

    // For PhonePe/Paytm: if entering a phone number, must match registered phone
    if (method === "phonepe" || method === "paytm") {
      const phoneOnlyRegex = /^[6-9]\d{9}$/;
      if (phoneOnlyRegex.test(detail) && detail !== registeredPhone) {
        res.status(400).json({
          success: false,
          error: `Security check failed: ${method === "phonepe" ? "PhonePe" : "Paytm"} number aapke registered number se match nahi karta. Apna registered number ${registeredPhone.slice(0, 2)}XXXXXX${registeredPhone.slice(-2)} use karein.`,
        });
        return;
      }
    }

    // For all UPI methods: if local part looks like a phone number, verify it
    if (["upi", "phonepe", "paytm"].includes(method)) {
      const localPart = detail.includes("@") ? detail.split("@")[0] : detail;
      const phoneOnlyRegex = /^[6-9]\d{9}$/;
      if (phoneOnlyRegex.test(localPart) && localPart !== registeredPhone) {
        res.status(400).json({
          success: false,
          error: `Security check failed: UPI mein jo phone number hai (${localPart.slice(0, 2)}XXXXXX${localPart.slice(-2)}) aapke registered number se alag hai. Apna registered number use karein.`,
        });
        return;
      }
    }

    // ── Balance check ──────────────────────────────────────────────────────
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

    // ── Validate account details ───────────────────────────────────────────
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

    // ── Auto-process asynchronously ────────────────────────────────────────
    void autoProcessWithdrawal(withdrawal.id, driverId, driverName, amount, method, accountDetails, validation).catch(console.error);

    res.json({
      success: true,
      withdrawal,
      newBalance,
      validationOk: validation.valid,
      message: validation.valid
        ? `₹${amount} withdrawal request submit ho gayi!`
        : `Withdrawal request mein error hai: ${validation.reason}`,
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
      await db.update(withdrawalRequestsTable).set({
        status: "rejected",
        processedAt: new Date(),
        processedBy: "auto-system",
        rejectionReason: `Account details validation failed: ${validation.reason}`,
        autoProcessed: "rejected",
        processingNote: "Automatic rejection — account details format galat tha",
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
          description: `Auto-refund: withdrawal rejected (invalid details) — ₹${amount}`,
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
        processingNote: `Format valid ✅ | Transfer se pehle UPI verify karein — galat UPI pe paisa wapas nahi aata | Manual transfer required`,
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
