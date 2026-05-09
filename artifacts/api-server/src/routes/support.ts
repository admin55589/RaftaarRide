import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { supportChatsTable, supportMessagesTable } from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

interface JwtPayload { userId?: number; driverId?: number; role?: string; }

function userAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const p = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    if (!p.userId) { res.status(401).json({ success: false, error: "User token required" }); return; }
    (req as any).userId = p.userId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

function driverAuthMW(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const p = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    if (!p.driverId) { res.status(401).json({ success: false, error: "Driver token required" }); return; }
    (req as any).driverId = p.driverId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

function flexAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const p = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    if (p.userId) { (req as any).userId = p.userId; (req as any).callerRole = "user"; }
    else if (p.driverId) { (req as any).driverId = p.driverId; (req as any).callerRole = "driver"; }
    else { res.status(401).json({ success: false, error: "Invalid token" }); return; }
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const p = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    if (p.role !== "admin") { res.status(403).json({ success: false, error: "Admin only" }); return; }
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

/* ── POST /api/support/chat ─── create or return existing open chat ── */
router.post("/support/chat", flexAuth, async (req: Request, res: Response) => {
  const userId: number | undefined = (req as any).userId;
  const driverId: number | undefined = (req as any).driverId;
  const role: string = (req as any).callerRole;
  const { subject } = req.body as { subject?: string };
  if (!subject?.trim()) { res.status(400).json({ success: false, error: "Subject required" }); return; }
  try {
    /* Return existing open chat if one exists */
    const existing = userId
      ? await db.select().from(supportChatsTable).where(and(eq(supportChatsTable.userId, userId), eq(supportChatsTable.status, "open"))).limit(1)
      : await db.select().from(supportChatsTable).where(and(eq(supportChatsTable.driverId, driverId!), eq(supportChatsTable.status, "open"))).limit(1);

    if (existing.length > 0) {
      const msgs = await db.select().from(supportMessagesTable).where(eq(supportMessagesTable.chatId, existing[0].id)).orderBy(supportMessagesTable.createdAt);
      res.json({ success: true, chat: existing[0], messages: msgs });
      return;
    }

    const [chat] = await db.insert(supportChatsTable).values({
      userId: userId ?? null,
      driverId: driverId ?? null,
      role,
      subject: subject.trim(),
      status: "open",
    }).returning();

    /* Auto-welcome message from admin */
    await db.insert(supportMessagesTable).values({
      chatId: chat.id,
      senderRole: "admin",
      message: "Namaste! 🙏 RaftaarRide Support mein aapka swagat hai. Aapki problem humne note kar li hai. 10 minute mein reply karenge. Kripya thoda wait karein.",
      isRead: true,
    });

    const msgs = await db.select().from(supportMessagesTable).where(eq(supportMessagesTable.chatId, chat.id)).orderBy(supportMessagesTable.createdAt);
    res.json({ success: true, chat, messages: msgs });
  } catch (err) {
    logger.error({ err }, "support chat create error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ── GET /api/support/chat ─── get my chat + messages ── */
router.get("/support/chat", flexAuth, async (req: Request, res: Response) => {
  const userId: number | undefined = (req as any).userId;
  const driverId: number | undefined = (req as any).driverId;
  try {
    const chats = userId
      ? await db.select().from(supportChatsTable).where(eq(supportChatsTable.userId, userId)).orderBy(desc(supportChatsTable.createdAt)).limit(1)
      : await db.select().from(supportChatsTable).where(eq(supportChatsTable.driverId, driverId!)).orderBy(desc(supportChatsTable.createdAt)).limit(1);

    if (chats.length === 0) { res.json({ success: true, chat: null, messages: [] }); return; }

    const msgs = await db.select().from(supportMessagesTable).where(eq(supportMessagesTable.chatId, chats[0].id)).orderBy(supportMessagesTable.createdAt);
    res.json({ success: true, chat: chats[0], messages: msgs });
  } catch (err) {
    logger.error({ err }, "support chat fetch error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ── POST /api/support/chat/message ─── user/driver sends message ── */
router.post("/support/chat/message", flexAuth, async (req: Request, res: Response) => {
  const userId: number | undefined = (req as any).userId;
  const driverId: number | undefined = (req as any).driverId;
  const senderRole: string = (req as any).callerRole;
  const { chatId, message } = req.body as { chatId?: number; message?: string };
  if (!chatId || !message?.trim()) { res.status(400).json({ success: false, error: "chatId and message required" }); return; }
  try {
    /* Verify chat ownership */
    const [chat] = await db.select().from(supportChatsTable).where(eq(supportChatsTable.id, chatId));
    if (!chat) { res.status(404).json({ success: false, error: "Chat not found" }); return; }
    if (userId && chat.userId !== userId) { res.status(403).json({ success: false, error: "Forbidden" }); return; }
    if (driverId && chat.driverId !== driverId) { res.status(403).json({ success: false, error: "Forbidden" }); return; }

    const [msg] = await db.insert(supportMessagesTable).values({
      chatId,
      senderRole,
      message: message.trim(),
    }).returning();

    res.json({ success: true, message: msg });
  } catch (err) {
    logger.error({ err }, "support message send error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ── GET /api/admin/support ─── list all support chats ── */
router.get("/admin/support", adminAuth, async (req: Request, res: Response) => {
  try {
    const chats = await db.select().from(supportChatsTable).orderBy(desc(supportChatsTable.createdAt)).limit(200);

    /* Attach unread count per chat (messages from user/driver not read) */
    const enriched = await Promise.all(chats.map(async (c) => {
      const [row] = await db.select({ cnt: sql<number>`count(*)::int` })
        .from(supportMessagesTable)
        .where(and(eq(supportMessagesTable.chatId, c.id), eq(supportMessagesTable.isRead, false)));
      return { ...c, unreadCount: row?.cnt ?? 0 };
    }));

    res.json({ success: true, chats: enriched });
  } catch (err) {
    logger.error({ err }, "admin support list error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ── GET /api/admin/support/:id/messages ─── thread messages ── */
router.get("/admin/support/:id/messages", adminAuth, async (req: Request, res: Response) => {
  const chatId = parseInt(String(req.params.id), 10);
  if (isNaN(chatId)) { res.status(400).json({ success: false, error: "Invalid id" }); return; }
  try {
    const msgs = await db.select().from(supportMessagesTable).where(eq(supportMessagesTable.chatId, chatId)).orderBy(supportMessagesTable.createdAt);
    /* Mark all as read */
    await db.update(supportMessagesTable).set({ isRead: true }).where(eq(supportMessagesTable.chatId, chatId));
    res.json({ success: true, messages: msgs });
  } catch (err) {
    logger.error({ err }, "admin support messages error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ── POST /api/admin/support/:id/reply ─── admin sends message ── */
router.post("/admin/support/:id/reply", adminAuth, async (req: Request, res: Response) => {
  const chatId = parseInt(String(req.params.id), 10);
  if (isNaN(chatId)) { res.status(400).json({ success: false, error: "Invalid id" }); return; }
  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ success: false, error: "Message required" }); return; }
  try {
    const [msg] = await db.insert(supportMessagesTable).values({
      chatId,
      senderRole: "admin",
      message: message.trim(),
      isRead: true,
    }).returning();
    res.json({ success: true, message: msg });
  } catch (err) {
    logger.error({ err }, "admin support reply error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ── PATCH /api/admin/support/:id/resolve ─── mark resolved ── */
router.patch("/admin/support/:id/resolve", adminAuth, async (req: Request, res: Response) => {
  const chatId = parseInt(String(req.params.id), 10);
  if (isNaN(chatId)) { res.status(400).json({ success: false, error: "Invalid id" }); return; }
  try {
    /* Send resolution message first */
    await db.insert(supportMessagesTable).values({
      chatId,
      senderRole: "admin",
      message: "✅ Aapki issue resolve kar di gayi hai. Agar koi aur problem ho toh naya ticket open karein. RaftaarRide mein safar karte rahein! 🚗",
      isRead: true,
    });
    await db.update(supportChatsTable).set({ status: "resolved" }).where(eq(supportChatsTable.id, chatId));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "admin support resolve error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
