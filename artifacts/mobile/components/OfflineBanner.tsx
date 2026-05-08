import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
      if (!offline) {
        setWasOffline(true);
        if (showTimer.current) clearTimeout(showTimer.current);
        showTimer.current = setTimeout(() => setWasOffline(false), 3000);
      }
    });
    return () => {
      unsub();
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, []);

  const visible = isOffline || wasOffline;
  const bgColor = isOffline ? "#DC2626" : "#16A34A";
  const icon = isOffline ? "📵" : "✅";
  const message = isOffline
    ? "Internet nahi hai — offline mode"
    : "Internet wapas aa gaya!";

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : -60,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] }]}
      pointerEvents="none"
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  icon: { fontSize: 16 },
  text: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
});
