import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";

let io: Server;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST", "PATCH"] },
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
