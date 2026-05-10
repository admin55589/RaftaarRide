/**
 * pass.ts — RaftaarPass subscription routes
 *
 * User routes (JWT userAuth):
 *   GET  /api/pass/status           — check active pass
 *   POST /api/pass/create-order     — create Razorpay order (₹149)
 *   POST /api/pass/activate         — verify payment + activate pass
 *
 * Admin routes (admin JWT):
 *   GET  /api/admin/passes          — list all passes + stats
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { userPassesTable, usersTable } from "@workspace/db/schema";
import { eq, desc, and, gte, count, sum, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import crypto from "crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "secret";
/* Admin tokens are signed with SESSION_SECRET (same key as admin.ts) */
const ADMIN_JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";
const PASS_PRICE_RUPEES = 149;
const PASS_DURATION_DAYS = 30;
const FREE_CANCELS_LIMIT = 5;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? "",
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
});

/* ── Auth helpers ─────────────────────────────────────────────────────────── */
function userAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.split(" ")[1], JWT_SECRET) as { userId: number };
    if (!payload.userId) { res.status(401).json({ success: false, error: "Invalid token" }); return; }
    (req as any).userId = payload.userId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.split(" ")[1], ADMIN_JWT_SECRET) as { role: string };
    if (payload.role !== "admin") { res.status(403).json({ success: false, error: "Admin only" }); return; }
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

/* ── GET /api/pass/status ─────────────────────────────────────────────────── */
router.get("/pass/status", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const now = new Date();
    const [pass] = await db
      .select()
      .from(userPassesTable)
      .where(and(
        eq(userPassesTable.userId, userId),
        eq(userPassesTable.status, "active"),
        gte(userPassesTable.expiresAt, now),
      ))
      .orderBy(desc(userPassesTable.createdAt))
      .limit(1);

    if (!pass) {
      res.json({ success: true, active: false });
      return;
    }

    res.json({
      success: true,
      active: true,
      plan: pass.plan,
      amount: pass.amount,
      startsAt: pass.startsAt,
      expiresAt: pass.expiresAt,
      freeCancelsUsed: pass.freeCancelsUsed,
      freeCancelsLimit: pass.freeCancelsLimit,
      freeCancelsRemaining: Math.max(0, pass.freeCancelsLimit - pass.freeCancelsUsed),
      passId: pass.id,
    });
  } catch (err) {
    logger.error({ err }, "pass/status error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ── POST /api/pass/create-order ──────────────────────────────────────────── */
router.post("/pass/create-order", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    /* Block if already active */
    const now = new Date();
    const [existing] = await db
      .select({ id: userPassesTable.id, expiresAt: userPassesTable.expiresAt })
      .from(userPassesTable)
      .where(and(
        eq(userPassesTable.userId, userId),
        eq(userPassesTable.status, "active"),
        gte(userPassesTable.expiresAt, now),
      ))
      .limit(1);

    if (existing) {
      res.status(409).json({
        success: false,
        error: `RaftaarPass already active hai till ${new Date(existing.expiresAt).toLocaleDateString("en-IN")}`,
      });
      return;
    }

    const order = await razorpay.orders.create({
      amount: PASS_PRICE_RUPEES * 100, /* paise */
      currency: "INR",
      receipt: `pass_${userId}_${Date.now()}`,
      notes: { userId: String(userId), type: "raftaarpass" },
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: PASS_PRICE_RUPEES * 100,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID ?? "",
    });
  } catch (err) {
    logger.error({ err }, "pass/create-order error");
    res.status(500).json({ success: false, error: "Order banana mein dikkat. Dobara try karein." });
  }
});

/* ── POST /api/pass/activate ──────────────────────────────────────────────── */
router.post("/pass/activate", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { orderId, paymentId, signature } = req.body as {
    orderId?: string; paymentId?: string; signature?: string;
  };

  if (!orderId || !paymentId || !signature) {
    res.status(400).json({ success: false, error: "orderId, paymentId, signature required" });
    return;
  }

  /* HMAC-SHA256 verification */
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const expectedSig = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  if (expectedSig !== signature) {
    res.status(400).json({ success: false, error: "Payment verification failed" });
    return;
  }

  try {
    /* Idempotency — don't create duplicate pass for same payment */
    const [dup] = await db
      .select({ id: userPassesTable.id })
      .from(userPassesTable)
      .where(eq(userPassesTable.razorpayPaymentId, paymentId))
      .limit(1);

    if (dup) {
      res.json({ success: true, message: "Pass already activated", passId: dup.id });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASS_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const [pass] = await db.insert(userPassesTable).values({
      userId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      plan: "monthly",
      amount: String(PASS_PRICE_RUPEES),
      status: "active",
      startsAt: now,
      expiresAt,
      freeCancelsUsed: 0,
      freeCancelsLimit: FREE_CANCELS_LIMIT,
    }).returning();

    res.json({
      success: true,
      message: "🎉 RaftaarPass activate ho gaya! 30 din valid.",
      pass: {
        id: pass.id,
        plan: pass.plan,
        startsAt: pass.startsAt,
        expiresAt: pass.expiresAt,
        freeCancelsRemaining: FREE_CANCELS_LIMIT,
      },
    });
  } catch (err) {
    logger.error({ err }, "pass/activate error");
    res.status(500).json({ success: false, error: "Pass activate nahi hua. Support se contact karein." });
  }
});

/* ── GET /api/admin/passes ────────────────────────────────────────────────── */
router.get("/admin/passes", adminAuth, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const passes = await db
      .select({
        id: userPassesTable.id,
        userId: userPassesTable.userId,
        plan: userPassesTable.plan,
        amount: userPassesTable.amount,
        status: userPassesTable.status,
        startsAt: userPassesTable.startsAt,
        expiresAt: userPassesTable.expiresAt,
        freeCancelsUsed: userPassesTable.freeCancelsUsed,
        freeCancelsLimit: userPassesTable.freeCancelsLimit,
        createdAt: userPassesTable.createdAt,
        userName: usersTable.name,
        userPhone: usersTable.phone,
        userEmail: usersTable.email,
      })
      .from(userPassesTable)
      .leftJoin(usersTable, eq(userPassesTable.userId, usersTable.id))
      .orderBy(desc(userPassesTable.createdAt))
      .limit(200);

    /* Mark expired in response without DB write */
    const enriched = passes.map(p => ({
      ...p,
      isCurrentlyActive: p.status === "active" && new Date(p.expiresAt) > now,
    }));

    /* Stats */
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [totalRow] = await db.select({ c: count() }).from(userPassesTable);
    const [activeRow] = await db.select({ c: count() }).from(userPassesTable)
      .where(and(eq(userPassesTable.status, "active"), gte(userPassesTable.expiresAt, now)));
    const [revenueRow] = await db.select({ total: sum(userPassesTable.amount) }).from(userPassesTable)
      .where(eq(userPassesTable.status, "active"));
    const [thisMonthRow] = await db.select({ c: count() }).from(userPassesTable)
      .where(gte(userPassesTable.createdAt, thirtyDaysAgo));
    const [cancelSavedRow] = await db.select({ total: sql<number>`sum(free_cancels_used)::int` })
      .from(userPassesTable);

    res.json({
      success: true,
      passes: enriched,
      stats: {
        total: Number(totalRow?.c ?? 0),
        active: Number(activeRow?.c ?? 0),
        revenueTotal: parseFloat(String(revenueRow?.total ?? "0")),
        thisMonth: Number(thisMonthRow?.c ?? 0),
        freeCancelsSaved: Number(cancelSavedRow?.total ?? 0),
      },
    });
  } catch (err) {
    logger.error({ err }, "admin/passes error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
