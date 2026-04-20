import { io, type Socket } from "socket.io-client";

const SOCKET_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "http://localhost:8080";
})();

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

export function joinRideRoom(rideId: number) {
  const s = getSocket();
  if (s.connected) {
    s.emit("ride:join", rideId);
  } else {
    s.once("connect", () => s.emit("ride:join", rideId));
  }
}

export function joinDriverRoom(driverId: number) {
  const s = getSocket();
  if (s.connected) {
    s.emit("driver:join", driverId);
  } else {
    s.once("connect", () => s.emit("driver:join", driverId));
  }
}

export function emitDriverLocation(driverId: number, rideId: number, lat: number, lng: number) {
  const s = getSocket();
  if (s.connected) {
    s.emit("driver:location", { driverId, rideId, lat, lng });
  }
}

export function sendChatMessage(rideId: number, senderId: string, senderName: string, role: "user" | "driver", text: string) {
  const s = getSocket();
  const payload = { rideId, senderId, senderName, role, text, timestamp: Date.now() };
  if (s.connected) {
    s.emit("chat:message", payload);
  } else {
    s.once("connect", () => s.emit("chat:message", payload));
  }
}
