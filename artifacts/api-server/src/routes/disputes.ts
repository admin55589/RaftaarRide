import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { disputesTable, ridesTable, usersTable, driversTable, userPassesTable } from "@workspace/db/schema";
import { eq, desc, inArray, and, gte } from "drizzle-orm";
import jwt from "jsonwebtoken";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

interface JwtPayload { userId?: number; phone?: string; role?: string; }

async function userAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    if (!payload.userId) { res.status(401).json({ success: false, error: "User token required" }); return; }
    (req as any).userId = payload.userId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

async function adminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    if (payload.role !== "admin") { res.status(403).json({ success: false, error: "Admin only" }); return; }
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

const VALID_ISSUES = ["overcharge", "driver_behavior", "route_issue", "payment", "safety", "other"];
const VALID_STATUSES = ["open", "in_review", "resolved", "rejected"];

/* POST /api/disputes — user creates a dispute */
router.post("/disputes", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { rideId, issue, description } = req.body as { rideId?: number; issue?: string; description?: string };

  if (!rideId || !issue || !description?.trim()) {
    res.status(400).json({ success: false, error: "rideId, issue, description required" }); return;
  }
  if (!VALID_ISSUES.includes(issue)) {
    res.status(400).json({ success: false, error: `issue must be one of: ${VALID_ISSUES.join(", ")}` }); return;
  }
  if (description.trim().length < 10) {
    res.status(400).json({ success: false, error: "Description minimum 10 characters honi chahiye" }); return;
  }

  try {
    const [ride] = await db.select({ id: ridesTable.id, userId: ridesTable.userId, driverId: ridesTable.driverId })
      .from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }
    if (ride.userId !== userId) { res.status(403).json({ success: false, error: "Not your ride" }); return; }

    /* ── I: Priority Resolution — check if user has active RaftaarPass ── */
    const [activePass] = await db
      .select({ id: userPassesTable.id })
      .from(userPassesTable)
      .where(and(eq(userPassesTable.userId, userId), eq(userPassesTable.status, "active"), gte(userPassesTable.expiresAt, new Date())))
      .limit(1);
    const isPriority = !!activePass;

    const [dispute] = await db.insert(disputesTable).values({
      rideId, userId, driverId: ride.driverId ?? null, issue, description: description.trim(), isPriority,
    }).returning();

    res.status(201).json({
      success: true,
      dispute,
      message: isPriority
        ? "🛡️ Dispute submit ho gayi — RaftaarPass priority review (24 ghante)"
        : "Dispute submit ho gayi — 72 ghante mein review hogi",
    });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* GET /api/admin/disputes — admin lists all disputes */
router.get("/admin/disputes", adminAuth, async (req: Request, res: Response) => {
  const { status, limit = "50", offset = "0" } = req.query as { status?: string; limit?: string; offset?: string };

  try {
    const query = db.select().from(disputesTable);
    const disputes = await (status
      ? query.where(eq(disputesTable.status, status))
      : query
    ).orderBy(desc(disputesTable.createdAt)).limit(parseInt(limit)).offset(parseInt(offset));

    const userIds = [...new Set(disputes.map(d => d.userId))];
    const driverIds = [...new Set(disputes.filter(d => d.driverId).map(d => d.driverId!))];

    const [users, drivers] = await Promise.all([
      userIds.length ? db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone }).from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
      driverIds.length ? db.select({ id: driversTable.id, name: driversTable.name, phone: driversTable.phone }).from(driversTable).where(inArray(driversTable.id, driverIds)) : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map(u => [u.id, u]));
    const driverMap = new Map(drivers.map(d => [d.id, d]));

    res.json({
      success: true,
      disputes: disputes.map(d => ({
        ...d,
        user: userMap.get(d.userId) ?? null,
        driver: d.driverId ? (driverMap.get(d.driverId) ?? null) : null,
      })),
      total: disputes.length,
    });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* PATCH /api/admin/disputes/:id — admin resolves/updates a dispute */
router.patch("/admin/disputes/:id", adminAuth, async (req: Request, res: Response) => {
  const disputeId = Number(req.params.id);
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };

  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` }); return;
  }

  try {
    const updateData: Record<string, any> = {};
    if (status) updateData.status = status;
    if (adminNote !== undefined) updateData.adminNote = adminNote;
    if (status === "resolved" || status === "rejected") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = "admin";
    }

    const [updated] = await db.update(disputesTable).set(updateData)
      .where(eq(disputesTable.id, disputeId)).returning();
    if (!updated) { res.status(404).json({ success: false, error: "Dispute not found" }); return; }

    res.json({ success: true, dispute: updated });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

export default router;
