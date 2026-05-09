import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, walletTransactionsTable, driversTable } from "@workspace/db/schema";
import { eq, desc, like } from "drizzle-orm";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

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

  if (!amount || amount < 10 || amount > 50000) {
    res.status(400).json({ success: false, error: "Amount 10 se 50,000 ke beech hona chahiye" }); return;
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

  try {
    const [user] = await db.select({
      walletBalance: usersTable.walletBalance,
      pendingCancellationFee: usersTable.pendingCancellationFee,
      pendingCancellationDriverId: usersTable.pendingCancellationDriverId,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    const txnDesc = method === "razorpay" && paymentId
      ? `Razorpay Wallet Top-up — ₹${amount} (ID: ${paymentId})`
      : `Wallet top-up via ${method.toUpperCase()} — ₹${amount}`;

    await db.insert(walletTransactionsTable).values({ userId, type: "topup", amount: String(amount), description: txnDesc });

    /* ── Auto-recover pending cancellation fee ── */
    const pendingFee = parseFloat(String(user.pendingCancellationFee ?? "0"));
    const creditedBalance = parseFloat(String(user.walletBalance)) + Number(amount);
    let finalBalance = creditedBalance;
    let recoveredFee = 0;

    if (pendingFee > 0 && creditedBalance > 0) {
      recoveredFee = parseFloat(Math.min(pendingFee, creditedBalance).toFixed(2));
      finalBalance = parseFloat((creditedBalance - recoveredFee).toFixed(2));
      const remainingPending = parseFloat((pendingFee - recoveredFee).toFixed(2));
      const pendingDriverId = user.pendingCancellationDriverId ?? null;

      await db.update(usersTable).set({
        walletBalance: String(finalBalance),
        pendingCancellationFee: String(remainingPending),
        pendingCancellationDriverId: remainingPending > 0 ? pendingDriverId : null,
      }).where(eq(usersTable.id, userId));

      await db.insert(walletTransactionsTable).values({
        userId,
        type: "debit",
        amount: String(-recoveredFee),
        description: `Pending cancellation fee auto-recovered — ₹${recoveredFee.toFixed(2)} kata gaya`,
      });

      /* ── Credit recovered fee to the driver who waited ── */
      if (pendingDriverId) {
        const [drv] = await db.select({ walletBalance: driversTable.walletBalance, totalEarnings: driversTable.totalEarnings, pushToken: driversTable.pushToken })
          .from(driversTable).where(eq(driversTable.id, pendingDriverId)).limit(1);
        if (drv) {
          const drvNewWallet = parseFloat((parseFloat(String(drv.walletBalance ?? "0")) + recoveredFee).toFixed(2));
          const drvNewEarning = parseFloat((parseFloat(String(drv.totalEarnings ?? "0")) + recoveredFee).toFixed(2));
          await db.update(driversTable).set({
            walletBalance: String(drvNewWallet),
            totalEarnings: String(drvNewEarning),
          }).where(eq(driversTable.id, pendingDriverId));
          await db.insert(walletTransactionsTable).values({
            driverId: pendingDriverId,
            type: "credit",
            amount: String(recoveredFee),
            description: `Cancellation compensation received — ₹${recoveredFee.toFixed(2)} (passenger ne wallet recharge kiya)`,
          });
          if (drv.pushToken) {
            const { sendPushNotification } = await import("../lib/expoPush");
            await sendPushNotification({
              to: drv.pushToken,
              title: "💰 Cancellation Compensation Mila!",
              body: `₹${recoveredFee.toFixed(2)} wallet mein — pehle ka pending compensation recover hua`,
              data: { type: "cancellation_compensation", amount: recoveredFee },
            });
          }
        }
      }
    } else {
      await db.update(usersTable).set({ walletBalance: String(finalBalance) }).where(eq(usersTable.id, userId));
    }

    res.json({
      success: true,
      newBalance: finalBalance,
      recoveredCancellationFee: recoveredFee > 0 ? recoveredFee : undefined,
      message: recoveredFee > 0
        ? `₹${amount} add hue. ₹${recoveredFee.toFixed(2)} pending cancellation fee auto-recover hua.`
        : `₹${amount} wallet mein add ho gaye!`,
    });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
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
    const [user] = await db.select({ walletBalance: usersTable.walletBalance })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    const currentBalance = Number(user.walletBalance);
    if (currentBalance < amount) {
      res.status(400).json({ success: false, error: "Insufficient wallet balance", balance: currentBalance });
      return;
    }

    const newBalance = currentBalance - amount;
    await db.update(usersTable).set({ walletBalance: String(newBalance) }).where(eq(usersTable.id, userId));

    await db.insert(walletTransactionsTable).values({
      userId,
      type: "spend",
      amount: String(-amount),
      description: description ?? `Ride payment — ₹${amount}`,
    });

    res.json({ success: true, newBalance, message: `₹${amount} wallet se deduct ho gaya` });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
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

/* POST /api/wallet/redeem-points — redeem 100 points = ₹10 wallet credit */
router.post("/wallet/redeem-points", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const [user] = await db.select({ loyaltyPoints: usersTable.loyaltyPoints, walletBalance: usersTable.walletBalance })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    const pts = user.loyaltyPoints ?? 0;
    const redeemableSets = Math.floor(pts / 150);
    if (redeemableSets < 1) {
      res.status(400).json({ success: false, error: `Abhi sirf ${pts} points hain. 150 points pe ₹10 milenge.` }); return;
    }

    const pointsToRedeem = redeemableSets * 150;
    const rupees = redeemableSets * 10;
    const newPoints = pts - pointsToRedeem;
    const newBalance = parseFloat(String(user.walletBalance ?? "0")) + rupees;

    await db.update(usersTable).set({
      loyaltyPoints: newPoints,
      walletBalance: String(newBalance.toFixed(2)),
    }).where(eq(usersTable.id, userId));

    await db.insert(walletTransactionsTable).values({
      userId,
      type: "loyalty_redeem",
      amount: String(rupees),
      description: `🏆 ${pointsToRedeem} RaftaarPoints redeem kiye → ₹${rupees} wallet mein credit`,
    });

    res.json({ success: true, pointsRedeemed: pointsToRedeem, rupees, newPoints, newBalance, message: `₹${rupees} wallet mein add ho gaye!` });
  } catch { res.status(500).json({ success: false, error: "Server error" }); }
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
