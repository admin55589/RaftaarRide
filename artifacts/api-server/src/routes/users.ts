import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, promoCodesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

const MAX_PHOTO_SIZE_BYTES = 500 * 1024;

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

router.get("/users/me", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const [user] = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      email: usersTable.email,
      photoUrl: usersTable.photoUrl,
      gender: usersTable.gender,
      isVerified: usersTable.isVerified,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.patch("/users/me", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { name, email, photoUrl, gender } = req.body as { name?: string; email?: string; photoUrl?: string; gender?: string };

  if (!name && !email && photoUrl === undefined && gender === undefined) {
    res.status(400).json({ success: false, error: "Provide at least one field to update" }); return;
  }

  if (photoUrl !== undefined && photoUrl !== null && photoUrl.length > MAX_PHOTO_SIZE_BYTES) {
    res.status(400).json({ success: false, error: "Photo size too large. Please use a smaller image (max 500KB)." }); return;
  }

  const updates: Record<string, string | null> = {};
  if (name?.trim()) updates.name = name.trim();
  if (email?.trim()) updates.email = email.trim().toLowerCase();
  if (photoUrl !== undefined) updates.photoUrl = photoUrl ?? null;
  if (gender !== undefined) updates.gender = gender ?? null;

  try {
    const [updated] = await db.update(usersTable)
      .set(updates as any)
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        email: usersTable.email,
        photoUrl: usersTable.photoUrl,
        gender: usersTable.gender,
        isVerified: usersTable.isVerified,
      });

    if (!updated) { res.status(404).json({ success: false, error: "User not found" }); return; }
    res.json({ success: true, user: updated, message: "Profile updated successfully" });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.post("/promo/validate", userAuth, async (req: Request, res: Response) => {
  const { code, fareAmount } = req.body as { code: string; fareAmount: number };

  if (!code) { res.status(400).json({ success: false, error: "Promo code is required" }); return; }

  try {
    const [promo] = await db.select().from(promoCodesTable)
      .where(eq(promoCodesTable.code, code.toUpperCase().trim()))
      .limit(1);

    if (!promo) { res.status(404).json({ success: false, error: "Invalid promo code" }); return; }
    if (!promo.isActive) { res.status(400).json({ success: false, error: "This promo code is no longer active" }); return; }
    if (promo.expiresAt && new Date() > promo.expiresAt) {
      res.status(400).json({ success: false, error: "This promo code has expired" }); return;
    }
    if (promo.usedCount >= promo.maxUses) {
      res.status(400).json({ success: false, error: "This promo code has reached its usage limit" }); return;
    }

    const discountAmount = Math.round((fareAmount ?? 0) * (promo.discountPct / 100));
    const finalFare = Math.max(0, (fareAmount ?? 0) - discountAmount);

    res.json({
      success: true,
      code: promo.code,
      discountPct: promo.discountPct,
      discountAmount,
      originalFare: fareAmount,
      finalFare,
      message: `${promo.discountPct}% discount applied! You save ₹${discountAmount}`,
    });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

export default router;
