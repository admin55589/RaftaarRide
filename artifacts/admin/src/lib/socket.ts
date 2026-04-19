import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : window.location.origin;

let socket: Socket | null = null;

export function getAdminSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  }
  return socket;
}

export function connectAdminSocket(): Socket {
  const s = getAdminSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectAdminSocket() {
  if (socket?.connected) socket.disconnect();
}
