import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";

let io: Server;

function buildSocketCorsOrigin(): string | string[] | boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  if (!raw.trim()) return false;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

interface RideQueueHandlers {
  onDriverReject: (rideId: number, driverId: number) => Promise<void>;
  onDriverAccept: (rideId: number, driverId: number) => Promise<unknown>;
}

let _queueHandlers: RideQueueHandlers | null = null;

/** Wire rideQueue handlers after initialisation — prevents circular imports */
export function registerRideQueueHandlers(handlers: RideQueueHandlers) {
  _queueHandlers = handlers;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: buildSocketCorsOrigin(), methods: ["GET", "POST", "PATCH"], credentials: true },
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket) => {
    logger.info({ id: socket.id }, "[socket] client connected");

    socket.on("ride:join", (rideId: number) => {
      socket.join(`ride:${rideId}`);
      logger.info({ rideId, socketId: socket.id }, "[socket] joined ride room");
    });

    socket.on("driver:join", (driverId: number) => {
      socket.join(`driver:${driverId}`);
      logger.info({ driverId, socketId: socket.id }, "[socket] driver joined room");
    });

    socket.on("driver:location", (data: { driverId: number; rideId: number; lat: number; lng: number }) => {
      io.to(`ride:${data.rideId}`).emit("driver:location", {
        lat: data.lat,
        lng: data.lng,
        driverId: data.driverId,
      });
    });

    socket.on("chat:message", (data: { rideId: number; senderId: string; senderName: string; role: "user" | "driver"; text: string; timestamp: number }) => {
      io.to(`ride:${data.rideId}`).emit("chat:message", data);
      logger.info({ rideId: data.rideId, role: data.role }, "[socket] chat message");
    });

    /* ── Driver Re-broadcast: driver rejects ride offer via socket ── */
    socket.on("driver:reject_ride", (data: { rideId: number; driverId: number }) => {
      if (!_queueHandlers) return;
      const { rideId, driverId } = data;
      if (!rideId || !driverId) return;
      _queueHandlers.onDriverReject(rideId, driverId).catch((err) =>
        logger.error({ err, rideId, driverId }, "[socket] onDriverReject error"),
      );
    });

    /* ── Driver Re-broadcast: driver accepts ride offer via socket ── */
    socket.on("driver:accept_ride", (data: { rideId: number; driverId: number }) => {
      if (!_queueHandlers) return;
      const { rideId, driverId } = data;
      if (!rideId || !driverId) return;
      _queueHandlers.onDriverAccept(rideId, driverId).catch((err) =>
        logger.error({ err, rideId, driverId }, "[socket] onDriverAccept error"),
      );
    });

    socket.on("disconnect", () => {
      logger.info({ id: socket.id }, "[socket] client disconnected");
    });
  });

  return io;
}

export function getIO(): Server {
  return io;
}

export function emitRideUpdate(rideId: number, event: string, data: unknown) {
  if (!io) return;
  io.to(`ride:${rideId}`).emit(event, data);
}

export function emitToDriver(driverId: number, event: string, data: unknown) {
  if (!io) return;
  io.to(`driver:${driverId}`).emit(event, data);
}

export function emitAdminUpdate(event: string, data: unknown) {
  if (!io) return;
  io.emit(event, data);
}
