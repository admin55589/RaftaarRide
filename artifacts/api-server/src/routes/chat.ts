import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { chatMessagesTable, ridesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-secret-2024";

function getUserFromToken(req: Request): { id: number; type: "user" | "driver" } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
    if (payload.userId) return { id: payload.userId, type: "user" };
    if (payload.driverId) return { id: payload.driverId, type: "driver" };
  } catch { }
  return null;
}

router.get("/chat/:rideId/messages", async (req: Request, res: Response) => {
  const sender = getUserFromToken(req);
  if (!sender) { res.status(401).json({ message: "Unauthorized" }); return; }
  const rideId = parseInt(String(req.params.rideId), 10);
  try {
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.rideId, rideId))
      .orderBy(chatMessagesTable.createdAt);
    res.json(messages);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/:rideId/send", async (req: Request, res: Response) => {
  const sender = getUserFromToken(req);
  if (!sender) { res.status(401).json({ message: "Unauthorized" }); return; }
  const rideId = parseInt(String(req.params.rideId), 10);
  const { message } = req.body;
  if (!message?.trim()) { res.status(400).json({ message: "Message required" }); return; }
  try {
    const [ride] = await db.select({ id: ridesTable.id, userId: ridesTable.userId, driverId: ridesTable.driverId })
      .from(ridesTable).where(eq(ridesTable.id, rideId));
    if (!ride) { res.status(404).json({ message: "Ride nahi mili" }); return; }
    const allowed =
      (sender.type === "user" && ride.userId === sender.id) ||
      (sender.type === "driver" && ride.driverId === sender.id);
    if (!allowed) { res.status(403).json({ message: "Is ride ka access nahi hai" }); return; }
    const [newMsg] = await db.insert(chatMessagesTable).values({
      rideId,
      senderType: sender.type,
      senderId: sender.id,
      message: message.trim(),
    }).returning();
    res.json(newMsg);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
