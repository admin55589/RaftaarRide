import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, walletTransactionsTable, driversTable } from "@workspace/db/schema";
import { eq, desc, like, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const router: IRouter = Router();
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET environment variable is required");
const JWT_SECRET = process.env.SESSION_SECRET;

interface JwtPayload { userId: number; phone: string; role: string; }

async function userAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    const [user] = await db.select({ id: usersTable.id, status: usersTable.status }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) { res.status(401).json({ success: false, error: "User not found" }); return; }
    if (user.status === "blocked") { res.status(403).json({ success: false, error: "Aapka account block kar diya gaya hai. Support se contact karein." }); return; }
    if (user.status === "suspended") { res.status(403).json({ success: false, error: "Aapka account suspend hai. Support se contact karein." }); return; }
    (req as any).userId = payload.userId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

router.get("/wallet/balance", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const [user] = await db.select({ walletBalance: usersTable.walletBalance })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }
    res.json({ success: true, balance: Number(user.walletBalance) });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

router.post("/wallet/topup", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { amount, method, paymentId, orderId, signature } = req.body as {
    amount: number; method: string; paymentId?: string; orderId?: string; signature?: string;
  };

  if (!amount || amount < 100 || amount > 50000) {
    res.status(400).json({ success: false, error: "Minimum topup ₹100 hai. Maximum ₹50,000." }); return;
  }
  const validMethods = ["upi", "card", "netbanking", "wallet", "razorpay"];
  if (!method || !validMethods.includes(method)) {
    res.status(400).json({ success: false, error: "Invalid payment method" }); return;
  }

  /* Razorpay: verify HMAC-SHA256 signature + idempotency guard */
  if (method === "razorpay") {
    if (!orderId || !paymentId || !signature) {
      res.status(400).json({ success: false, error: "Razorpay orderId, paymentId, signature required" }); return;
    }
    const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
    const expectedSig = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    if (expectedSig !== signature) {
      res.status(400).json({ success: false, error: "Invalid payment signature — unauthorized" }); return;
    }
    /* Idempotency: reject if this paymentId was already processed */
    try {
      const [already] = await db.select({ id: walletTransactionsTable.id })
        .from(walletTransactionsTable)
        .where(like(walletTransactionsTable.description, `%${paymentId}%`))
        .limit(1);
      if (already) {
        res.status(409).json({ success: false, error: "Payment already processed" }); return;
      }
    } catch { /* non-fatal idempotency check failure — proceed */ }
  }

  type TopupResult = { newBalance: number; recoveredFee: number; notifyDriverId: number | null; notifyAmount: number };
  let topupResult: TopupResult | null = null;

  try {
    await db.transaction(async (tx) => {
      const [user] = await tx.select({
        walletBalance: usersTable.walletBalance,
        pendingCancellationFee: usersTable.pendingCancellationFee,
        pendingCancellationDriverId: usersTable.pendingCancellationDriverId,
      }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) throw new Error("USER_NOT_FOUND");

      const txnDesc = method === "razorpay" && paymentId
        ? `Razorpay Wallet Top-up — ₹${amount} (ID: ${paymentId})`
        : `Wallet top-up via ${method.toUpperCase()} — ₹${amount}`;

      await tx.insert(walletTransactionsTable).values({ userId, type: "topup", amount: String(amount), description: txnDesc });

      /* ── Auto-recover pending cancellation fee ── */
      const pendingFee = parseFloat(String(user.pendingCancellationFee ?? "0"));
      const creditedBalance = parseFloat(String(user.walletBalance)) + Number(amount);
      let finalBalance = creditedBalance;
      let recoveredFee = 0;
      let notifyDriverId: number | null = null;

      if (pendingFee > 0 && creditedBalance > 0) {
        recoveredFee = parseFloat(Math.min(pendingFee, creditedBalance).toFixed(2));
        finalBalance = parseFloat((creditedBalance - recoveredFee).toFixed(2));
        const remainingPending = parseFloat((pendingFee - recoveredFee).toFixed(2));
        const pendingDriverId = user.pendingCancellationDriverId ?? null;

        await tx.update(usersTable).set({
          walletBalance: String(finalBalance),
          pendingCancellationFee: String(remainingPending),
          pendingCancellationDriverId: remainingPending > 0 ? pendingDriverId : null,
        }).where(eq(usersTable.id, userId));

        await tx.insert(walletTransactionsTable).values({
          userId,
          type: "debit",
          amount: String(-recoveredFee),
          description: `Pending cancellation fee auto-recovered — ₹${recoveredFee.toFixed(2)} kata gaya`,
        });

        /* ── Credit recovered fee to the driver who waited ── */
        if (pendingDriverId) {
          await tx.update(driversTable).set({
            walletBalance: sql`${driversTable.walletBalance}::numeric + ${recoveredFee}`,
            totalEarnings: sql`${driversTable.totalEarnings}::numeric + ${recoveredFee}`,
          }).where(eq(driversTable.id, pendingDriverId));
          await tx.insert(walletTransactionsTable).values({
            driverId: pendingDriverId,
            type: "credit",
            amount: String(recoveredFee),
            description: `Cancellation compensation received — ₹${recoveredFee.toFixed(2)} (passenger ne wallet recharge kiya)`,
          });
          notifyDriverId = pendingDriverId;
        }
      } else {
        /* Simple atomic credit — no pending fee to recover */
        await tx.update(usersTable)
          .set({ walletBalance: sql`${usersTable.walletBalance}::numeric + ${Number(amount)}` })
          .where(eq(usersTable.id, userId));
        finalBalance = creditedBalance;
      }

      topupResult = { newBalance: finalBalance, recoveredFee, notifyDriverId, notifyAmount: recoveredFee };
    });

    if (!topupResult) { res.status(404).json({ success: false, error: "User not found" }); return; }
    const result = topupResult as TopupResult;

    /* Push notification after transaction commits — non-critical, fire-and-forget */
    if (result.notifyDriverId) {
      const drvId = result.notifyDriverId;
      const amt = result.notifyAmount;
      db.select({ pushToken: driversTable.pushToken }).from(driversTable).where(eq(driversTable.id, drvId)).limit(1)
        .then(async ([drv]) => {
          if (drv?.pushToken) {
            const { sendPushNotification } = await import("../lib/expoPush");
            await sendPushNotification({ to: drv.pushToken, title: "💰 Cancellation Compensation Mila!", body: `₹${amt.toFixed(2)} wallet mein — pehle ka pending compensation recover hua`, data: { type: "cancellation_compensation", amount: amt } });
          }
        }).catch(() => {});
    }

    res.json({
      success: true,
      newBalance: result.newBalance,
      recoveredCancellationFee: result.recoveredFee > 0 ? result.recoveredFee : undefined,
      message: result.recoveredFee > 0
        ? `₹${amount} add hue. ₹${result.recoveredFee.toFixed(2)} pending cancellation fee auto-recover hua.`
        : `₹${amount} wallet mein add ho gaye!`,
    });
  } catch (err: any) {
    if (err?.message === "USER_NOT_FOUND") { res.status(404).json({ success: false, error: "User not found" }); return; }
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/wallet/transactions", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const txns = await db.select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(50);
    res.json({ success: true, transactions: txns });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

router.post("/wallet/spend", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { amount, description } = req.body as { amount: number; description?: string };

  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, error: "Valid amount required" });
    return;
  }

  try {
    let newBalance = 0;
    await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update")
        .limit(1);
      if (!user) throw new Error("USER_NOT_FOUND");

      const currentBalance = Number(user.walletBalance);
      if (currentBalance < amount) throw new Error("INSUFFICIENT");

      newBalance = parseFloat((currentBalance - amount).toFixed(2));
      await tx.update(usersTable).set({ walletBalance: String(newBalance) }).where(eq(usersTable.id, userId));
      await tx.insert(walletTransactionsTable).values({
        userId,
        type: "spend",
        amount: String(-amount),
        description: description ?? `Ride payment — ₹${amount}`,
      });
    });

    res.json({ success: true, newBalance, message: `₹${amount} wallet se deduct ho gaya` });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "USER_NOT_FOUND") { res.status(404).json({ success: false, error: "User not found" }); return; }
      if (err.message === "INSUFFICIENT") { res.status(400).json({ success: false, error: "Insufficient wallet balance" }); return; }
    }
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* GET /api/users/loyalty — user's loyalty points balance */
router.get("/users/loyalty", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const [user] = await db.select({ loyaltyPoints: usersTable.loyaltyPoints, walletBalance: usersTable.walletBalance })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }
    const pts = user.loyaltyPoints ?? 0;
    res.json({
      success: true,
      points: pts,
      nextRedemptionAt: 150,
      pointsToNext: Math.max(0, 150 - (pts % 150)),
      redeemableRupees: Math.floor(pts / 150) * 10,
    });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

/* POST /api/wallet/redeem-points — redeem 150 points = ₹10 wallet credit */
router.post("/wallet/redeem-points", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    let result: { pointsToRedeem: number; rupees: number; newPoints: number; newBalance: number } | null = null;

    await db.transaction(async (tx) => {
      const [user] = await tx.select({ loyaltyPoints: usersTable.loyaltyPoints, walletBalance: usersTable.walletBalance })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) throw new Error("USER_NOT_FOUND");

      const pts = user.loyaltyPoints ?? 0;
      const redeemableSets = Math.floor(pts / 150);
      if (redeemableSets < 1) throw new Error(`INSUFFICIENT:${pts}`);

      const pointsToRedeem = redeemableSets * 150;
      const rupees = redeemableSets * 10;
      const newPoints = pts - pointsToRedeem;
      const newBalance = parseFloat((parseFloat(String(user.walletBalance ?? "0")) + rupees).toFixed(2));

      await tx.update(usersTable).set({
        loyaltyPoints: newPoints,
        walletBalance: String(newBalance),
      }).where(eq(usersTable.id, userId));

      await tx.insert(walletTransactionsTable).values({
        userId,
        type: "loyalty_redeem",
        amount: String(rupees),
        description: `🏆 ${pointsToRedeem} RaftaarPoints redeem kiye → ₹${rupees} wallet mein credit`,
      });

      result = { pointsToRedeem, rupees, newPoints, newBalance };
    });

    if (!result) throw new Error("Transaction failed");
    const { pointsToRedeem, rupees, newPoints, newBalance } = result as NonNullable<typeof result>;
    res.json({ success: true, pointsRedeemed: pointsToRedeem, rupees, newPoints, newBalance, message: `₹${rupees} wallet mein add ho gaye!` });
  } catch (err: any) {
    if (err?.message === "USER_NOT_FOUND") { res.status(404).json({ success: false, error: "User not found" }); return; }
    if (err?.message?.startsWith("INSUFFICIENT:")) {
      const pts = err.message.split(":")[1];
      res.status(400).json({ success: false, error: `Abhi sirf ${pts} points hain. 150 points pe ₹10 milenge.` }); return;
    }
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.patch("/wallet/language", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { language } = req.body as { language: string };
  if (!["hi", "en"].includes(language)) {
    res.status(400).json({ success: false, error: "Language 'hi' ya 'en' hona chahiye" });
    return;
  }
  try {
    await db.update(usersTable).set({ preferredLanguage: language }).where(eq(usersTable.id, userId));
    res.json({ success: true, language });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
});

export default router;
