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
  fraudFlagsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, and, gte, lte, isNotNull, ne, inArray, count, max, sum } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { validateAccountDetails, createRazorpayPayout } from "../lib/razorpay-payout";
import { sendPushNotification } from "../lib/expoPush";
import { isAutomationEnabled, setAutomationEnabled } from "../lib/automation-state";
import { calculateAiSurge, generateNext24hForecast } from "../lib/surgeAi";
import { referralConfig } from "../lib/referral-config";
import OpenAI from "openai";

const router: IRouter = Router();

/* ── AI KYC Verification ─────────────────────────────── */
const openaiKyc = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

interface KycAiResult {
  verdict: "APPROVE" | "REJECT" | "NEEDS_REVIEW";
  confidence: number;
  findings: { aadhaar: string; license: string; rc: string; selfie: string };
  issues: string[];
  summary: string;
}

async function runAiKycVerification(kyc: {
  driverName: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  licenseFront: string | null;
  licenseBack: string | null;
  rcFront: string | null;
  selfie: string | null;
}): Promise<KycAiResult> {
  const docs = [
    { label: "Aadhaar Front", url: kyc.aadhaarFront },
    { label: "Aadhaar Back", url: kyc.aadhaarBack },
    { label: "Driving License Front", url: kyc.licenseFront },
    { label: "Driving License Back", url: kyc.licenseBack },
    { label: "RC Book", url: kyc.rcFront },
    { label: "Driver Selfie", url: kyc.selfie },
  ].filter((d): d is { label: string; url: string } => !!d.url);

  if (docs.length === 0) {
    return {
      verdict: "NEEDS_REVIEW",
      confidence: 0,
      findings: { aadhaar: "Not provided", license: "Not provided", rc: "Not provided", selfie: "Not provided" },
      issues: ["Koi bhi document upload nahi kiya gaya"],
      summary: "No documents uploaded — manual review required.",
    };
  }

  const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = docs.map((d) => ({
    type: "image_url" as const,
    image_url: { url: d.url, detail: "low" as const },
  }));

  const prompt = `You are a KYC verification AI for an Indian ride-hailing app (RaftaarRide).
Analyze these driver documents carefully.

Driver Name: ${kyc.driverName ?? "Unknown"}
Vehicle Type: ${kyc.vehicleType ?? "Unknown"}
Vehicle Number: ${kyc.vehicleNumber ?? "Unknown"}
Documents provided: ${docs.map((d) => d.label).join(", ")}

Check each document for:
1. Clarity — is it readable, not blurry or cropped?
2. Correct document type — does it match the label?
3. Name consistency — same name across all documents?
4. For RC: vehicle number should match ${kyc.vehicleNumber ?? "stated number"}
5. For Selfie: clear face, no obstructions

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "verdict": "APPROVE" or "REJECT" or "NEEDS_REVIEW",
  "confidence": <integer 0-100>,
  "findings": {
    "aadhaar": "<what you see or 'Not provided'>",
    "license": "<what you see or 'Not provided'>",
    "rc": "<what you see or 'Not provided'>",
    "selfie": "<what you see or 'Not provided'>"
  },
  "issues": ["<issue 1>", "<issue 2>"],
  "summary": "<1-2 sentences summarizing verification result>"
}

Verdict rules:
- APPROVE (confidence >= 80): all documents clear, authentic, consistent
- REJECT (confidence >= 75): clearly fake, tampered, or wrong document
- NEEDS_REVIEW: uncertain, partially readable, or minor issues`;

  const response = await openaiKyc.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageContent],
      },
    ],
    max_tokens: 600,
  });

  const rawText = response.choices[0]?.message?.content ?? "{}";
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as KycAiResult;
}

if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET environment variable is required");
const JWT_SECRET = process.env.SESSION_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin.raftaarride@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Luck@12345RR";

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

/* GET /api/surge — public endpoint: returns active surge multiplier for mobile app */
router.get("/surge", async (_req: Request, res: Response) => {
  try {
    const [surge] = await db.select({
      multiplier: surgeSettingsTable.multiplier,
      isActive: surgeSettingsTable.isActive,
      reason: surgeSettingsTable.reason,
    }).from(surgeSettingsTable).orderBy(desc(surgeSettingsTable.updatedAt)).limit(1);
    if (!surge) { res.json({ isActive: false, multiplier: 1, reason: null }); return; }
    res.json({
      isActive: surge.isActive,
      multiplier: parseFloat(String(surge.multiplier)),
      reason: surge.reason ?? null,
    });
  } catch { res.json({ isActive: false, multiplier: 1, reason: null }); }
});

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
    const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY ?? "";
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
  try {
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
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* GET /api/admin/live-stats — real-time dashboard counters (online drivers, active rides) */
router.get("/admin/live-stats", authMiddleware, async (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [onlineDriversResult, activeRidesResult, todayRidesResult, searchingRidesResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(driversTable).where(eq(driversTable.isOnline, true)).then(r => r[0]),
      db.select({ count: sql<number>`count(*)` }).from(ridesTable).where(
        sql`status IN ('accepted','arrived','onRide')`
      ).then(r => r[0]),
      db.select({ count: sql<number>`count(*)` }).from(ridesTable).where(
        gte(ridesTable.createdAt, todayStart)
      ).then(r => r[0]),
      db.select({ count: sql<number>`count(*)` }).from(ridesTable).where(
        eq(ridesTable.status, "searching")
      ).then(r => r[0]),
    ]);

    res.json({
      onlineDrivers: Number(onlineDriversResult?.count ?? 0),
      activeRides: Number(activeRidesResult?.count ?? 0),
      todayRides: Number(todayRidesResult?.count ?? 0),
      searchingRides: Number(searchingRidesResult?.count ?? 0),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.get("/admin/users", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const usersWithRides = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
        totalRides: sql<number>`count(${ridesTable.id})`,
      })
      .from(usersTable)
      .leftJoin(ridesTable, eq(ridesTable.userId, usersTable.id))
      .groupBy(usersTable.id, usersTable.name, usersTable.email, usersTable.phone, usersTable.status, usersTable.createdAt)
      .orderBy(desc(usersTable.createdAt));

    res.json(usersWithRides.map(u => ({ ...u, totalRides: Number(u.totalRides), createdAt: u.createdAt.toISOString() })));
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.get("/admin/drivers", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const [drivers, ratingStats] = await Promise.all([
      db.select().from(driversTable).orderBy(desc(driversTable.createdAt)),
      db.select({
        driverId: ridesTable.driverId,
        avgRating: sql<number>`coalesce(avg(${ridesTable.userRating}), 0)`,
        ratingCount: sql<number>`count(${ridesTable.userRating})`,
      })
        .from(ridesTable)
        .where(sql`${ridesTable.userRating} is not null`)
        .groupBy(ridesTable.driverId),
    ]);

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
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.get("/admin/rides", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, limit = "500", offset = "0" } = req.query as { status?: string; limit?: string; offset?: string };

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
      .orderBy(desc(ridesTable.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

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
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.get("/admin/rides/recent", authMiddleware, async (_req: Request, res: Response) => {
  try {
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
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.get("/admin/analytics/daily", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    /* 3 aggregated queries instead of 90 — group by calendar day in DB timezone */
    const [ridesPerDay, earningsPerDay, usersPerDay] = await Promise.all([
      db.select({
        day: sql<string>`to_char(date_trunc('day', ${ridesTable.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      }).from(ridesTable).where(gte(ridesTable.createdAt, since))
        .groupBy(sql`date_trunc('day', ${ridesTable.createdAt})`),

      db.select({
        day: sql<string>`to_char(date_trunc('day', ${ridesTable.createdAt}), 'YYYY-MM-DD')`,
        total: sql<number>`coalesce(sum(price::numeric), 0)`,
      }).from(ridesTable).where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, since)))
        .groupBy(sql`date_trunc('day', ${ridesTable.createdAt})`),

      db.select({
        day: sql<string>`to_char(date_trunc('day', ${usersTable.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      }).from(usersTable).where(gte(usersTable.createdAt, since))
        .groupBy(sql`date_trunc('day', ${usersTable.createdAt})`),
    ]);

    const ridesMap = new Map(ridesPerDay.map((r) => [r.day, Number(r.count)]));
    const earningsMap = new Map(earningsPerDay.map((r) => [r.day, Number(r.total)]));
    const usersMap = new Map(usersPerDay.map((r) => [r.day, Number(r.count)]));

    const analytics = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      return {
        date: dateStr,
        rides: ridesMap.get(dateStr) ?? 0,
        earnings: earningsMap.get(dateStr) ?? 0,
        newUsers: usersMap.get(dateStr) ?? 0,
      };
    });

    res.json(analytics);
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.patch("/admin/rides/:id/assign", authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { driverId } = req.body as { driverId: number };

    const [updated] = await db
      .update(ridesTable)
      .set({ driverId, status: "assigned" })
      .where(eq(ridesTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ message: "Ride not found" }); return; }

    const [[user], driver] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, updated.userId)).limit(1),
      driverId ? db.select().from(driversTable).where(eq(driversTable.id, driverId)).limit(1).then(r => r[0] ?? null) : Promise.resolve(null),
    ]);

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
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
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
        aiNote: driverKycTable.aiNote,
        aiConfidence: driverKycTable.aiConfidence,
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

/* POST /api/admin/kyc/auto-verify-all — bulk AI verify all pending KYC */
router.post("/admin/kyc/auto-verify-all", authMiddleware, async (req: Request, res: Response) => {
  try {
    const pendingList = await db
      .select({
        id: driverKycTable.id,
        driverId: driverKycTable.driverId,
        driverName: driversTable.name,
        vehicleType: driversTable.vehicleType,
        vehicleNumber: driversTable.vehicleNumber,
        aadhaarFront: driverKycTable.aadhaarFront,
        aadhaarBack: driverKycTable.aadhaarBack,
        licenseFront: driverKycTable.licenseFront,
        licenseBack: driverKycTable.licenseBack,
        rcFront: driverKycTable.rcFront,
        selfie: driverKycTable.selfie,
      })
      .from(driverKycTable)
      .leftJoin(driversTable, eq(driverKycTable.driverId, driversTable.id))
      .where(eq(driverKycTable.status, "pending"))
      .orderBy(desc(driverKycTable.createdAt))
      .limit(20);

    if (pendingList.length === 0) {
      res.json({ success: true, processed: 0, approved: 0, rejected: 0, needsReview: 0, message: "Koi pending KYC nahi hai" });
      return;
    }

    let approved = 0, rejected = 0, needsReview = 0;

    for (const kyc of pendingList) {
      try {
        const aiResult = await runAiKycVerification(kyc);
        let newStatus: string = "pending";
        let newRejectionReason: string | null = null;

        if (aiResult.verdict === "APPROVE" && aiResult.confidence >= 80) {
          newStatus = "verified";
          approved++;
        } else if (aiResult.verdict === "REJECT" && aiResult.confidence >= 75) {
          newStatus = "rejected";
          newRejectionReason = aiResult.issues?.join("; ") || "AI verification failed";
          rejected++;
        } else {
          needsReview++;
        }

        await db.update(driverKycTable).set({
          aiNote: aiResult.summary,
          aiConfidence: aiResult.confidence,
          status: newStatus,
          rejectionReason: newStatus === "rejected" ? newRejectionReason : null,
          verifiedAt: newStatus === "verified" ? new Date() : null,
          verifiedBy: newStatus === "verified" ? "AI Auto-Verify" : null,
        }).where(eq(driverKycTable.id, kyc.id));

        if (newStatus !== "pending") {
          await db.update(driversTable).set({
            kycStatus: newStatus,
            ...(newStatus === "verified" ? { status: "active" } : {}),
          }).where(eq(driversTable.id, kyc.driverId!));
        }
      } catch (err) {
        req.log.error({ kycId: kyc.id, err }, "AI KYC verification failed for record");
        needsReview++;
      }
    }

    res.json({
      success: true,
      processed: pendingList.length,
      approved,
      rejected,
      needsReview,
      message: `${pendingList.length} records processed: ${approved} approved, ${rejected} rejected, ${needsReview} need manual review`,
    });
  } catch (err) {
    req.log.error({ err }, "Bulk AI KYC verification failed");
    res.status(500).json({ success: false, error: "AI verification failed — try again" });
  }
});

/* POST /api/admin/kyc/:id/auto-verify — AI verify single KYC record */
router.post("/admin/kyc/:id/auto-verify", authMiddleware, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ success: false, error: "Invalid KYC ID" }); return; }

  try {
    const [kyc] = await db
      .select({
        id: driverKycTable.id,
        driverId: driverKycTable.driverId,
        status: driverKycTable.status,
        rejectionReason: driverKycTable.rejectionReason,
        verifiedAt: driverKycTable.verifiedAt,
        verifiedBy: driverKycTable.verifiedBy,
        driverName: driversTable.name,
        vehicleType: driversTable.vehicleType,
        vehicleNumber: driversTable.vehicleNumber,
        aadhaarFront: driverKycTable.aadhaarFront,
        aadhaarBack: driverKycTable.aadhaarBack,
        licenseFront: driverKycTable.licenseFront,
        licenseBack: driverKycTable.licenseBack,
        rcFront: driverKycTable.rcFront,
        selfie: driverKycTable.selfie,
      })
      .from(driverKycTable)
      .leftJoin(driversTable, eq(driverKycTable.driverId, driversTable.id))
      .where(eq(driverKycTable.id, id))
      .limit(1);

    if (!kyc) { res.status(404).json({ success: false, error: "KYC record nahi mila" }); return; }

    const aiResult = await runAiKycVerification(kyc);

    let newStatus = kyc.status;
    let newRejectionReason = kyc.rejectionReason;

    if (aiResult.verdict === "APPROVE" && aiResult.confidence >= 80) {
      newStatus = "verified";
      newRejectionReason = null;
    } else if (aiResult.verdict === "REJECT" && aiResult.confidence >= 75) {
      newStatus = "rejected";
      newRejectionReason = aiResult.issues?.join("; ") || "AI verification failed";
    }

    const autoActioned = newStatus !== kyc.status;

    const [updated] = await db.update(driverKycTable).set({
      aiNote: aiResult.summary,
      aiConfidence: aiResult.confidence,
      status: newStatus,
      rejectionReason: newRejectionReason,
      verifiedAt: newStatus === "verified" ? new Date() : (newStatus !== "verified" ? null : kyc.verifiedAt),
      verifiedBy: newStatus === "verified" ? "AI Auto-Verify" : kyc.verifiedBy,
    }).where(eq(driverKycTable.id, id)).returning();

    if (autoActioned) {
      await db.update(driversTable).set({
        kycStatus: newStatus,
        ...(newStatus === "verified" ? { status: "active" } : {}),
      }).where(eq(driversTable.id, kyc.driverId!));

      if (newStatus === "verified") {
        const [driver] = await db.select({ pushToken: driversTable.pushToken }).from(driversTable).where(eq(driversTable.id, kyc.driverId!)).limit(1);
        if (driver?.pushToken) {
          await sendPushNotification({ to: driver.pushToken, title: "✅ KYC Approved!", body: "Aapki KYC AI se verify ho gayi — ab rides accept karo!", data: { type: "kyc_approved" } });
        }
      }
    }

    res.json({
      success: true,
      verdict: aiResult.verdict,
      confidence: aiResult.confidence,
      findings: aiResult.findings,
      issues: aiResult.issues ?? [],
      summary: aiResult.summary,
      autoActioned,
      newStatus,
      kyc: updated,
    });
  } catch (err) {
    req.log.error({ err }, "AI KYC auto-verify failed");
    res.status(500).json({ success: false, error: "AI verification failed — try again baad mein" });
  }
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
      .select({ walletBalance: driversTable.walletBalance, name: driversTable.name, phone: driversTable.phone, pendingCommission: driversTable.pendingCommission })
      .from(driversTable).where(eq(driversTable.id, driverId)).limit(1);

    if (!driver) {
      res.status(404).json({ success: false, message: "Driver nahi mila" });
      return;
    }

    const prevBalance = Number(driver.walletBalance ?? 0);
    const pendingAmt = Number(driver.pendingCommission ?? 0);
    const now = new Date().toISOString();

    /* Auto-recover pending commission from this credit */
    const autoDeduct = Math.min(pendingAmt, parsedAmount);
    const newBalance = parseFloat((prevBalance + parsedAmount - autoDeduct).toFixed(2));
    const newPendingCommission = parseFloat((pendingAmt - autoDeduct).toFixed(2));

    await db.update(driversTable)
      .set({
        walletBalance: newBalance.toFixed(2),
        pendingCommission: newPendingCommission.toFixed(2),
      })
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

    /* Log auto-deducted commission if any */
    if (autoDeduct > 0) {
      await db.insert(walletTransactionsTable).values({
        driverId,
        type: "commission_debit",
        amount: String(-autoDeduct),
        description: `Pending commission ₹${autoDeduct.toFixed(2)} admin credit se auto-recover ki gayi ✅`,
      });
      if (newPendingCommission === 0) {
        await db.update(ridesTable)
          .set({ commissionStatus: "auto_collected" })
          .where(and(eq(ridesTable.driverId, driverId), eq(ridesTable.commissionStatus, "pending")));
      }
    }

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

/* GET /api/admin/sms-balance — 2Factor.in + Fast2SMS credits balance */
router.get("/admin/sms-balance", authMiddleware, async (req: Request, res: Response) => {
  const twoFactorKey = process.env.TWOFACTOR_API_KEY;
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;

  let twoFactorCredits: number | null = null;
  let twoFactorError: string | null = null;
  let fast2SmsWallet: number | null = null;
  let fast2SmsError: string | null = null;

  const [tfResult, f2Result] = await Promise.allSettled([
    twoFactorKey
      ? fetch(`https://2factor.in/API/V1/${twoFactorKey}/BAL/SMS`, { signal: AbortSignal.timeout(8000) })
          .then((r) => r.json() as Promise<{ Status: string; Details: string }>)
      : Promise.reject(new Error("TWOFACTOR_API_KEY not configured")),
    fast2SmsKey
      ? fetch(`https://www.fast2sms.com/dev/wallet`, {
          headers: { authorization: fast2SmsKey },
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.json() as Promise<{ return: boolean; wallet: string; message?: string | string[] }>)
      : Promise.reject(new Error("FAST2SMS_API_KEY not configured")),
  ]);

  if (tfResult.status === "fulfilled") {
    if (tfResult.value.Status === "Success") {
      twoFactorCredits = Number(tfResult.value.Details ?? 0);
    } else {
      twoFactorError = tfResult.value.Details ?? "Unknown error";
      req.log.warn({ details: twoFactorError }, "[2Factor] balance fetch failed");
    }
  } else {
    twoFactorError = tfResult.reason?.message ?? "Fetch failed";
  }

  if (f2Result.status === "fulfilled") {
    if (f2Result.value.return === true) {
      fast2SmsWallet = parseFloat(f2Result.value.wallet ?? "0");
    } else {
      const msg = f2Result.value.message;
      fast2SmsError = Array.isArray(msg) ? msg.join(", ") : (msg ?? "Unknown error");
    }
  } else {
    fast2SmsError = f2Result.reason?.message ?? "Fetch failed";
  }

  res.json({
    credits: twoFactorCredits,
    fast2SmsWallet,
    error: twoFactorCredits === null ? (twoFactorError ?? "Fetch failed") : undefined,
    fast2SmsError: fast2SmsWallet === null ? (fast2SmsError ?? undefined) : undefined,
  });
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

  if (!mapsKey) {
    res.json({ error: "GOOGLE_MAPS_SERVER_KEY not configured" });
    return;
  }

  /* Test only authorized APIs — Geocoding and Directions (Places/Distance Matrix not enabled) */
  try {
    const [geocoding, directions] = await Promise.allSettled([
      fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=Delhi,India&key=${mapsKey}`,
        { signal: AbortSignal.timeout(8000) }
      ).then((r) => r.json() as Promise<{ status: string; error_message?: string }>),
      fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=Delhi&destination=Mumbai&key=${mapsKey}`,
        { signal: AbortSignal.timeout(8000) }
      ).then((r) => r.json() as Promise<{ status: string; error_message?: string }>),
    ]);

    const toStatus = (r: PromiseSettledResult<{ status: string; error_message?: string }>) => {
      if (r.status !== "fulfilled") return "error";
      const s = r.value.status;
      return s === "OK" || s === "ZERO_RESULTS" ? "ok" : (r.value.error_message ?? s);
    };

    const FREE_CREDIT_USD = 200;
    const USD_TO_INR = 84;

    res.json({
      apis: {
        geocoding: toStatus(geocoding),
        directions: toStatus(directions),
      },
      pricing: {
        geocodingPer1k: 5,
        directionsPer1k: 10,
        freeCreditUSD: FREE_CREDIT_USD,
        freeCreditINR: FREE_CREDIT_USD * USD_TO_INR,
        note: "$200/month free credit (~₹16,800) — renews each month",
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "[maps-usage] fetch failed");
    res.json({ error: err?.message ?? "Fetch failed" });
  }
});

/* GET /api/admin/surge — get current surge settings + AI preview */
router.get("/admin/surge", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const [surge] = await db.select().from(surgeSettingsTable).orderBy(desc(surgeSettingsTable.updatedAt)).limit(1);
    const row = surge ?? { multiplier: "1.00", isActive: false, reason: null, updatedAt: null, aiMode: false, cityLat: "28.613900", cityLng: "77.209000" };
    let aiPreview = null;
    if (row.aiMode) {
      const lat = parseFloat(String(row.cityLat ?? "28.613900"));
      const lng = parseFloat(String(row.cityLng ?? "77.209000"));
      aiPreview = await calculateAiSurge(lat, lng);
    }
    const forecast = generateNext24hForecast();
    res.json({ success: true, surge: row, aiPreview, forecast });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* GET /api/admin/surge/preview — live AI preview without saving */
router.get("/admin/surge/preview", authMiddleware, async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(String(req.query.lat ?? "28.613900"));
    const lng = parseFloat(String(req.query.lng ?? "77.209000"));
    const [aiPreview, forecast] = await Promise.all([calculateAiSurge(lat, lng), Promise.resolve(generateNext24hForecast())]);
    res.json({ success: true, aiPreview, forecast });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* POST /api/admin/surge — upsert surge settings */
router.post("/admin/surge", authMiddleware, async (req: Request, res: Response) => {
  const { multiplier, isActive, reason, aiMode, cityLat, cityLng } = req.body as {
    multiplier?: number; isActive?: boolean; reason?: string;
    aiMode?: boolean; cityLat?: number; cityLng?: number;
  };

  const mult = multiplier !== undefined ? Number(multiplier) : undefined;
  if (mult !== undefined && (isNaN(mult) || mult < 1 || mult > 5)) {
    res.status(400).json({ success: false, error: "Multiplier 1.0 se 5.0 ke beech hona chahiye" }); return;
  }

  try {
    const [existing] = await db.select({ id: surgeSettingsTable.id }).from(surgeSettingsTable).limit(1);
    const setData: Record<string, unknown> = { updatedAt: new Date(), updatedBy: "admin" };
    if (mult !== undefined) setData.multiplier = String(mult.toFixed(2));
    if (isActive !== undefined) setData.isActive = isActive;
    if (reason !== undefined) setData.reason = reason.trim() || null;
    if (aiMode !== undefined) setData.aiMode = aiMode;
    if (cityLat !== undefined) setData.cityLat = String(cityLat);
    if (cityLng !== undefined) setData.cityLng = String(cityLng);

    let surge;
    if (existing) {
      [surge] = await db.update(surgeSettingsTable).set(setData).where(eq(surgeSettingsTable.id, existing.id)).returning();
    } else {
      [surge] = await db.insert(surgeSettingsTable).values({
        multiplier: String((mult ?? 1).toFixed(2)),
        isActive: isActive ?? false,
        reason: reason?.trim() || null,
        aiMode: aiMode ?? false,
        cityLat: cityLat ? String(cityLat) : "28.613900",
        cityLng: cityLng ? String(cityLng) : "77.209000",
        updatedBy: "admin",
      }).returning();
    }

    let aiPreview = null;
    if (surge?.aiMode) {
      const lat = parseFloat(String(surge.cityLat ?? "28.613900"));
      const lng = parseFloat(String(surge.cityLng ?? "77.209000"));
      aiPreview = await calculateAiSurge(lat, lng);
    }
    res.json({ success: true, surge, aiPreview });
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

    /* Fetch penalty revenue (platform_revenue type, no userId/driverId) in the same date range */
    const penaltyConditions: Parameters<typeof and>[0][] = [eq(walletTransactionsTable.type, "platform_revenue")];
    if (from) penaltyConditions.push(gte(walletTransactionsTable.createdAt, new Date(from)));
    if (to) penaltyConditions.push(lte(walletTransactionsTable.createdAt, new Date(to + "T23:59:59")));
    const penaltyRows = await db
      .select({ amount: walletTransactionsTable.amount, description: walletTransactionsTable.description, createdAt: walletTransactionsTable.createdAt })
      .from(walletTransactionsTable)
      .where(and(...penaltyConditions))
      .orderBy(desc(walletTransactionsTable.createdAt));
    const totalPenaltyRevenue = parseFloat(penaltyRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0).toFixed(2));

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
        totalRides: rides.length,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalDriverEarnings: parseFloat(totalDriverEarnings.toFixed(2)),
        totalPlatformFees,
        totalPenaltyRevenue,
        totalAdminRevenue: parseFloat((totalPlatformFees + totalPenaltyRevenue).toFixed(2)),
        byPaymentMethod,
        byVehicle,
      },
      rides,
      penaltyTransactions: penaltyRows,
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

/* ─────────────────────────────────────────────────────────────────────────
   LOYALTY PROGRAM MANAGEMENT
   ───────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────
   FINANCIAL HEALTH — P&L Overview
   ───────────────────────────────────────────────────────────────────────── */
router.get("/admin/financial-health", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    /* ── Revenue ── */
    /* 1. Commission from completed rides (all time + this month) */
    const [commissionAll] = await db
      .select({ total: sum(ridesTable.commissionAmount), cnt: count() })
      .from(ridesTable)
      .where(and(eq(ridesTable.status, "completed"), isNotNull(ridesTable.commissionAmount)));
    const [commissionMonth] = await db
      .select({ total: sum(ridesTable.commissionAmount) })
      .from(ridesTable)
      .where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, startOfMonth)));

    /* 2. Driver plan subscriptions */
    const [planAll] = await db
      .select({ total: sum(planTransactionsTable.amountRupees), cnt: count() })
      .from(planTransactionsTable);
    const [planMonth] = await db
      .select({ total: sum(planTransactionsTable.amountRupees) })
      .from(planTransactionsTable)
      .where(gte(planTransactionsTable.createdAt, startOfMonth));

    /* 3. Wallet topups (for Razorpay fee calc) */
    const [topupAll] = await db
      .select({ total: sum(walletTransactionsTable.amount), cnt: count() })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.type, "topup"));
    const [topupMonth] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(and(eq(walletTransactionsTable.type, "topup"), gte(walletTransactionsTable.createdAt, startOfMonth)));

    /* ── Platform Expenses (DB-tracked) ── */
    /* 4. Loyalty redemptions */
    const [loyaltyAll] = await db
      .select({ total: sum(walletTransactionsTable.amount), cnt: count() })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.type, "loyalty_redeem"));
    const [loyaltyMonth] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(and(eq(walletTransactionsTable.type, "loyalty_redeem"), gte(walletTransactionsTable.createdAt, startOfMonth)));

    /* 5. Referral bonuses */
    const [referralAll] = await db
      .select({ total: sum(walletTransactionsTable.amount), cnt: count() })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.type, "referral_credit"));
    const [referralMonth] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(and(eq(walletTransactionsTable.type, "referral_credit"), gte(walletTransactionsTable.createdAt, startOfMonth)));

    /* 6. Driver withdrawals paid out */
    const [withdrawalAll] = await db
      .select({ total: sum(withdrawalRequestsTable.amount), cnt: count() })
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.status, "approved"));

    /* ── Totals ── */
    const commissionTotal = parseFloat(String(commissionAll?.total ?? "0"));
    const commissionThisMonth = parseFloat(String(commissionMonth?.total ?? "0"));
    const planTotal = parseFloat(String(planAll?.total ?? "0"));
    const planThisMonth = parseFloat(String(planMonth?.total ?? "0"));
    const topupTotal = parseFloat(String(topupAll?.total ?? "0"));
    const topupThisMonth = parseFloat(String(topupMonth?.total ?? "0"));

    const loyaltyTotal = parseFloat(String(loyaltyAll?.total ?? "0"));
    const loyaltyThisMonth = parseFloat(String(loyaltyMonth?.total ?? "0"));
    const referralTotal = parseFloat(String(referralAll?.total ?? "0"));
    const referralThisMonth = parseFloat(String(referralMonth?.total ?? "0"));
    const withdrawalTotal = parseFloat(String(withdrawalAll?.total ?? "0"));

    /* Razorpay fee estimate: 2% + 18% GST = 2.36% of topups */
    const razorpayFeeTotal = parseFloat((topupTotal * 0.0236).toFixed(2));
    const razorpayFeeMonth = parseFloat((topupThisMonth * 0.0236).toFixed(2));

    const totalRides = Number(commissionAll?.cnt ?? 0);
    const totalTopups = Number(topupAll?.cnt ?? 0);
    const totalUsers = (await db.select({ cnt: count() }).from(usersTable))[0]?.cnt ?? 0;

    /* SMS cost estimate: ~₹0.30 per OTP (avg 1.5 OTPs per user login session) */
    const estimatedSmsOtps = Number(totalUsers) * 3; /* signup + ~2 logins */
    const estimatedSmsCostTotal = parseFloat((estimatedSmsOtps * 0.30).toFixed(2));
    const estimatedSmsCostMonth = parseFloat((estimatedSmsCostTotal / 12).toFixed(2));

    /* Maps cost: each ride ~5 API calls (autocomplete×2 + geocode + distance + directions) */
    /* Google gives $200/mo free = ~40,000 calls free. At $5/1000 calls (directions) */
    const mapsCallsPerRide = 5;
    const totalMapsCalls = totalRides * mapsCallsPerRide;
    const freeMapsCalls = 40000;
    const billableMapsCalls = Math.max(0, totalMapsCalls - freeMapsCalls);
    const estimatedMapsCost = parseFloat((billableMapsCalls / 1000 * 5 * 83).toFixed(2)); /* $5/1000 * ₹83 */

    /* Server costs (monthly estimates) */
    const serverCosts = {
      railway: { name: "Railway (API Server)", monthlyInr: 1200, note: "Hobby plan ~$14.99/mo" },
      vercel: { name: "Vercel (Admin Panel)", monthlyInr: 0, note: "Free tier — sufficient" },
      neon: { name: "Neon PostgreSQL", monthlyInr: 0, note: "Free tier — 512MB storage" },
    };
    const totalServerMonthly = Object.values(serverCosts).reduce((s, c) => s + c.monthlyInr, 0);

    /* ── Revenue totals ── */
    const revenueTotal = commissionTotal + planTotal;
    const revenueThisMonth = commissionThisMonth + planThisMonth;

    /* ── Expense totals (DB-tracked) ── */
    const dbExpenseTotal = loyaltyTotal + referralTotal + razorpayFeeTotal;
    const dbExpenseMonth = loyaltyThisMonth + referralThisMonth + razorpayFeeMonth;

    /* ── Net P&L ── */
    const netPnlTotal = revenueTotal - dbExpenseTotal;
    const netPnlThisMonth = revenueThisMonth - dbExpenseMonth - totalServerMonthly;

    res.json({
      success: true,
      revenue: {
        commission: { total: commissionTotal, thisMonth: commissionThisMonth, count: totalRides },
        plans: { total: planTotal, thisMonth: planThisMonth, count: Number(planAll?.cnt ?? 0) },
        total: revenueTotal,
        thisMonth: revenueThisMonth,
      },
      expenses: {
        loyalty: { total: loyaltyTotal, thisMonth: loyaltyThisMonth, count: Number(loyaltyAll?.cnt ?? 0) },
        referral: { total: referralTotal, thisMonth: referralThisMonth, count: Number(referralAll?.cnt ?? 0) },
        razorpay: { total: razorpayFeeTotal, thisMonth: razorpayFeeMonth, count: totalTopups, note: "2.36% of wallet topups (estimated)" },
        withdrawals: { total: withdrawalTotal, count: Number(withdrawalAll?.cnt ?? 0) },
        dbTrackedTotal: dbExpenseTotal,
        dbTrackedThisMonth: dbExpenseMonth,
      },
      infrastructure: {
        sms: { estimatedTotalSpent: estimatedSmsCostTotal, estimatedMonthly: estimatedSmsCostMonth, otpsEstimated: estimatedSmsOtps, note: "₹0.30/OTP via 2Factor — approximate" },
        maps: { totalCalls: totalMapsCalls, freeCallsLimit: freeMapsCalls, billableCalls: billableMapsCalls, estimatedCostInr: estimatedMapsCost, note: "5 API calls per ride, $200/mo free credit" },
        server: { monthly: totalServerMonthly, breakdown: serverCosts },
      },
      netPnl: {
        total: netPnlTotal,
        thisMonth: netPnlThisMonth,
        profitMarginPct: revenueTotal > 0 ? parseFloat(((netPnlTotal / revenueTotal) * 100).toFixed(1)) : 0,
      },
      meta: { generatedAt: new Date().toISOString(), totalRides, totalUsers: Number(totalUsers), totalTopupAmount: topupTotal },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* In-memory loyalty config — persists until server restart.
   In production this should live in a DB settings table.              */
let loyaltyConfig = {
  enabled: true,
  ptsPerRupee10: 1,       /* Points awarded per ₹10 of ride fare */
  redemptionPts: 150,     /* Points needed for one redemption     */
  redemptionRupees: 10,   /* ₹ credited per redemption            */
};

/* GET /api/admin/loyalty — full stats + config */
router.get("/admin/loyalty", authMiddleware, async (_req: Request, res: Response) => {
  try {
    /* Total ₹ given out via loyalty redemptions */
    const [expenseRow] = await db
      .select({ total: sum(walletTransactionsTable.amount), cnt: count() })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.type, "loyalty_redeem"));

    /* Total active (unredeemed) points across all users */
    const [pointsRow] = await db
      .select({ totalPoints: sum(usersTable.loyaltyPoints), userCount: count() })
      .from(usersTable)
      .where(isNotNull(usersTable.loyaltyPoints));

    /* Users who have earned at least 1 point */
    const [activeUsersRow] = await db
      .select({ cnt: count() })
      .from(usersTable)
      .where(sql`${usersTable.loyaltyPoints} > 0`);

    /* Recent 25 redemptions with user info */
    const recent = await db
      .select({
        id: walletTransactionsTable.id,
        userId: walletTransactionsTable.userId,
        amount: walletTransactionsTable.amount,
        description: walletTransactionsTable.description,
        createdAt: walletTransactionsTable.createdAt,
      })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.type, "loyalty_redeem"))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(25);

    /* Fetch user names for recent redemptions */
    const userIds = [...new Set(recent.map(r => r.userId).filter(Boolean))] as number[];
    const users = userIds.length
      ? await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const totalExpense = parseFloat(String(expenseRow?.total ?? "0"));
    const totalRedemptions = Number(expenseRow?.cnt ?? 0);
    const totalActivePoints = Number(pointsRow?.totalPoints ?? 0);
    const potentialLiability = parseFloat(((totalActivePoints / loyaltyConfig.redemptionPts) * loyaltyConfig.redemptionRupees).toFixed(2));
    const effectiveCashbackPct = ((loyaltyConfig.ptsPerRupee10 / loyaltyConfig.redemptionPts) * loyaltyConfig.redemptionRupees * 10).toFixed(2);

    res.json({
      success: true,
      stats: {
        totalExpense,
        totalRedemptions,
        totalActivePoints,
        potentialLiability,
        activeUsers: Number(activeUsersRow?.cnt ?? 0),
        avgPointsPerActiveUser: Number(activeUsersRow?.cnt ?? 0) > 0
          ? parseFloat((totalActivePoints / Number(activeUsersRow.cnt)).toFixed(1))
          : 0,
        effectiveCashbackPct: `${effectiveCashbackPct}%`,
      },
      config: loyaltyConfig,
      recentRedemptions: recent.map(r => ({
        ...r,
        user: r.userId ? (userMap.get(r.userId) ?? null) : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* GET /api/admin/loyalty/config — read current loyalty config */
router.get("/admin/loyalty/config", authMiddleware, (_req: Request, res: Response) => {
  res.json({ success: true, config: loyaltyConfig });
});

/* PATCH /api/admin/loyalty/config — update loyalty program settings */
router.patch("/admin/loyalty/config", authMiddleware, async (req: Request, res: Response) => {
  const { enabled, ptsPerRupee10, redemptionPts, redemptionRupees } = req.body as {
    enabled?: boolean;
    ptsPerRupee10?: number;
    redemptionPts?: number;
    redemptionRupees?: number;
  };

  if (typeof enabled === "boolean") loyaltyConfig.enabled = enabled;
  if (ptsPerRupee10 != null && ptsPerRupee10 >= 0 && ptsPerRupee10 <= 10) loyaltyConfig.ptsPerRupee10 = ptsPerRupee10;
  if (redemptionPts != null && redemptionPts >= 10 && redemptionPts <= 1000) loyaltyConfig.redemptionPts = redemptionPts;
  if (redemptionRupees != null && redemptionRupees >= 1 && redemptionRupees <= 500) loyaltyConfig.redemptionRupees = redemptionRupees;

  res.json({ success: true, config: loyaltyConfig, message: "Loyalty config update ho gaya" });
});

/* ─── REFERRAL PROGRAM CONFIG ────────────────────────────────────────────── */

/* GET /api/admin/referral/config — get current referral config */
router.get("/admin/referral/config", authMiddleware, (_req: Request, res: Response) => {
  res.json({ success: true, config: referralConfig });
});

/* PATCH /api/admin/referral/config — toggle referral program on/off + update bonus */
router.patch("/admin/referral/config", authMiddleware, (req: Request, res: Response) => {
  const { enabled, bonusAmount } = req.body as { enabled?: boolean; bonusAmount?: number };
  if (typeof enabled === "boolean") referralConfig.enabled = enabled;
  if (bonusAmount != null && bonusAmount >= 0 && bonusAmount <= 500) referralConfig.bonusAmount = bonusAmount;
  res.json({ success: true, config: referralConfig, message: `Referral program ${referralConfig.enabled ? "ON" : "OFF"} kar diya` });
});

/* ─── FRAUD DETECTION ─────────────────────────────────────────────────────── */

/* GET /api/admin/fraud/flags — list fraud flags with optional filters */
router.get("/admin/fraud/flags", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, status, limit: limitStr } = req.query as Record<string, string>;
    const pageLimit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 200);

    const conditions = [];
    if (type) conditions.push(eq(fraudFlagsTable.type, type));
    if (status) conditions.push(eq(fraudFlagsTable.status, status));

    const flags = await db
      .select({
        id: fraudFlagsTable.id,
        type: fraudFlagsTable.type,
        severity: fraudFlagsTable.severity,
        driverId: fraudFlagsTable.driverId,
        userId: fraudFlagsTable.userId,
        rideId: fraudFlagsTable.rideId,
        details: fraudFlagsTable.details,
        status: fraudFlagsTable.status,
        reviewedBy: fraudFlagsTable.reviewedBy,
        reviewNote: fraudFlagsTable.reviewNote,
        resolvedAt: fraudFlagsTable.resolvedAt,
        createdAt: fraudFlagsTable.createdAt,
        driverName: driversTable.name,
        driverPhone: driversTable.phone,
        userName: usersTable.name,
        userPhone: usersTable.phone,
      })
      .from(fraudFlagsTable)
      .leftJoin(driversTable, eq(fraudFlagsTable.driverId, driversTable.id))
      .leftJoin(usersTable, eq(fraudFlagsTable.userId, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(fraudFlagsTable.createdAt))
      .limit(pageLimit);

    /* Stats */
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [totalRow] = await db.select({ total: count() }).from(fraudFlagsTable);
    const [openRow] = await db.select({ c: count() }).from(fraudFlagsTable).where(eq(fraudFlagsTable.status, "open"));
    const [critRow] = await db.select({ c: count() }).from(fraudFlagsTable).where(and(eq(fraudFlagsTable.severity, "critical"), eq(fraudFlagsTable.status, "open")));
    const [highRow] = await db.select({ c: count() }).from(fraudFlagsTable).where(and(eq(fraudFlagsTable.severity, "high"), eq(fraudFlagsTable.status, "open")));
    const [weekRow] = await db.select({ c: count() }).from(fraudFlagsTable).where(gte(fraudFlagsTable.createdAt, sevenDaysAgo));
    const byTypeRows = await db
      .select({ type: fraudFlagsTable.type, c: count() })
      .from(fraudFlagsTable)
      .groupBy(fraudFlagsTable.type);

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) byType[row.type] = Number(row.c);

    res.json({
      success: true,
      flags,
      total: Number(totalRow?.total ?? 0),
      stats: {
        total: Number(totalRow?.total ?? 0),
        open: Number(openRow?.c ?? 0),
        critical: Number(critRow?.c ?? 0),
        high: Number(highRow?.c ?? 0),
        thisWeek: Number(weekRow?.c ?? 0),
        byType,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* PATCH /api/admin/fraud/flags/:id — update status / add review note */
router.patch("/admin/fraud/flags/:id", authMiddleware, async (req: Request, res: Response) => {
  const flagId = Number(req.params.id);
  if (isNaN(flagId)) { res.status(400).json({ success: false, error: "Invalid flag id" }); return; }

  try {
    const { status, reviewNote } = req.body as { status?: string; reviewNote?: string };
    const validStatuses = ["open", "reviewed", "dismissed", "actioned"];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ success: false, error: "Invalid status" }); return;
    }

    const updates: Record<string, unknown> = {};
    if (status) {
      updates.status = status;
      if (status !== "open") updates.resolvedAt = new Date();
    }
    if (reviewNote !== undefined) updates.reviewNote = reviewNote;

    /* Get admin name from token */
    const token = (req.headers.authorization ?? "").split(" ")[1];
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? "secret") as { email?: string };
      if (payload.email) updates.reviewedBy = payload.email;
    } catch { /* ignore */ }

    const [updated] = await db
      .update(fraudFlagsTable)
      .set(updates)
      .where(eq(fraudFlagsTable.id, flagId))
      .returning();

    if (!updated) { res.status(404).json({ success: false, error: "Flag not found" }); return; }
    res.json({ success: true, flag: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
