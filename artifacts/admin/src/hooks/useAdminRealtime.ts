import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectAdminSocket, disconnectAdminSocket, getAdminSocket } from "@/lib/socket";

export interface RealtimeEvent {
  type: "ride_new" | "ride_updated";
  timestamp: number;
  data: unknown;
}

export function useAdminRealtime() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  useEffect(() => {
    const socket = connectAdminSocket();

    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRideNew(data: unknown) {
      setLastEvent({ type: "ride_new", timestamp: Date.now(), data });
      queryClient.invalidateQueries({ queryKey: ["rides"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }

    function onRideUpdated(data: unknown) {
      setLastEvent({ type: "ride_updated", timestamp: Date.now(), data });
      queryClient.invalidateQueries({ queryKey: ["rides"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("admin:ride:new", onRideNew);
    socket.on("admin:ride:updated", onRideUpdated);

    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("admin:ride:new", onRideNew);
      socket.off("admin:ride:updated", onRideUpdated);
    };
  }, [queryClient]);

  return { isConnected, lastEvent };
}
