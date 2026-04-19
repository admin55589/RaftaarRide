import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  SlideInDown,
  SlideOutUp,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type NotifType = "success" | "error" | "info" | "warning" | "ride";

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  type: NotifType;
  icon?: string;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (notif: Omit<InAppNotification, "id">) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const TYPE_CONFIG: Record<NotifType, { bg: string; border: string; dot: string }> = {
  success: {
    bg: "#0E1F13",
    border: "rgba(52,211,153,0.55)",
    dot: "#34D399",
  },
  error: {
    bg: "#1F0E0E",
    border: "rgba(255,77,77,0.55)",
    dot: "#FF4D4D",
  },
  warning: {
    bg: "#1F1A0E",
    border: "rgba(245,166,35,0.55)",
    dot: "#F5A623",
  },
  info: {
    bg: "#0E1220",
    border: "rgba(99,179,237,0.55)",
    dot: "#63B3ED",
  },
  ride: {
    bg: "#140E1F",
    border: "rgba(168,85,247,0.55)",
    dot: "#A855F7",
  },
};

function NotifBanner({
  notif,
  onDismiss,
  topOffset,
}: {
  notif: InAppNotification;
  onDismiss: (id: string) => void;
  topOffset: number;
}) {
  const cfg = TYPE_CONFIG[notif.type];

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(16)}
      exiting={SlideOutUp.springify()}
      style={[
        styles.banner,
        {
          top: topOffset + 8,
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: cfg.dot }]} />

      <View style={styles.iconWrap}>
        <Text style={styles.iconText}>{notif.icon ?? "🔔"}</Text>
      </View>

      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>{notif.title}</Text>
        <Text style={styles.body} numberOfLines={2}>{notif.body}</Text>
      </View>

      <Pressable onPress={() => onDismiss(notif.id)} style={styles.dismissBtn}>
        <Text style={{ color: "#8A8A9A", fontSize: 16, lineHeight: 20 }}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<InAppNotification[]>([]);
  const insets = useSafeAreaInsets();
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setQueue((q) => q.filter((n) => n.id !== id));
  }, []);

  const showNotification = useCallback(
    (notif: Omit<InAppNotification, "id">) => {
      const id = `notif_${Date.now()}_${++counterRef.current}`;
      const full: InAppNotification = { ...notif, id };

      setQueue((q) => [...q.slice(-1), full]);

      const duration = notif.duration ?? 4000;
      setTimeout(() => {
        setQueue((q) => q.filter((n) => n.id !== id));
      }, duration);
    },
    []
  );

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {queue.map((notif, idx) => (
        <NotifBanner
          key={notif.id}
          notif={notif}
          onDismiss={dismiss}
          topOffset={insets.top + idx * 88}
        />
      ))}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be inside NotificationProvider");
  return ctx;
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    zIndex: 99999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconText: { fontSize: 20 },
  textWrap: { flex: 1 },
  title: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 2,
  },
  body: {
    color: "#B0B0C0",
    fontSize: 11,
    lineHeight: 15,
  },
  dismissBtn: {
    padding: 6,
    flexShrink: 0,
  },
});
