import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
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
  const { amount, method } = req.body as { amount: number; method: string };

  if (!amount || amount < 10 || amount > 50000) {
    res.status(400).json({ success: false, error: "Amount 10 se 50,000 ke beech hona chahiye" });
    return;
  }

  const validMethods = ["upi", "card", "netbanking", "wallet"];
  if (!method || !validMethods.includes(method)) {
    res.status(400).json({ success: false, error: "Invalid payment method" });
    return;
  }

  try {
    const [user] = await db.select({ walletBalance: usersTable.walletBalance })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    const newBalance = Number(user.walletBalance) + Number(amount);

    await db.update(usersTable)
      .set({ walletBalance: String(newBalance) })
      .where(eq(usersTable.id, userId));

    await db.insert(walletTransactionsTable).values({
      userId,
      type: "topup",
      amount: String(amount),
      description: `Wallet top-up via ${method.toUpperCase()} — ₹${amount}`,
    });

    res.json({ success: true, newBalance, message: `₹${amount} wallet mein add ho gaye!` });
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
