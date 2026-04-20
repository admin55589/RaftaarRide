import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { useApp, MOCK_DRIVERS } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { MapView } from "@/components/MapView";
import { GlassCard } from "@/components/GlassCard";
import { useVoiceAI } from "@/hooks/useVoiceAI";
import { ridesApi, type DriverInfo } from "@/lib/ridesApi";
import { connectSocket, joinRideRoom, getSocket } from "@/lib/socket";
import { useNotification } from "@/context/NotificationContext";

const MESSAGES = [
  "Finding nearby drivers...",
  "Connecting with drivers...",
  "Driver mil raha hai...",
  "Almost there...",
];

function RadarPulse({ delay, size }: { delay: number; size: number }) {
  const colors = useColors();
  const opacity = useSharedValue(0.8);
  const scale = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => {
      scale.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.out(Easing.quad) }), -1, false);
      opacity.value = withRepeat(withTiming(0, { duration: 2500, easing: Easing.out(Easing.quad) }), -1, false);
    }, delay);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: colors.primary }, style]}
    />
  );
}

function CancelModal({
  visible,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { isDark } = useTheme();
  const iconScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      iconScale.value = 0;
      iconScale.value = withSpring(1, { damping: 12, stiffness: 180 });
    }
  }, [visible]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <BlurView intensity={isDark ? 60 : 40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.modalBackdrop} onPress={onDismiss}>
          <Animated.View entering={FadeInUp.springify().damping(14)} style={styles.modalCard}>
            <Pressable>
              {/* Icon */}
              <Animated.View style={[styles.modalIconWrap, iconStyle]}>
                <View style={styles.modalIconOuter}>
                  <View style={styles.modalIconInner}>
                    <Text style={styles.modalIconEmoji}>🚫</Text>
                  </View>
                </View>
              </Animated.View>

              {/* Text */}
              <Animated.View entering={FadeInDown.delay(80)} style={styles.modalTextWrap}>
                <Text style={styles.modalTitle}>Ride Cancel Karen?</Text>
                <Text style={styles.modalSubtitle}>
                  Kya aap sach mein yeh ride cancel karna chahte hain?{"\n"}
                  <Text style={styles.modalNote}>Driver dhundhna bandh ho jaega.</Text>
                </Text>
              </Animated.View>

              {/* Divider */}
              <View style={styles.modalDivider} />

              {/* Buttons */}
              <Animated.View entering={FadeInDown.delay(140)} style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnKeep]}
                  onPress={onDismiss}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalBtnKeepText}>⬅  Nahi, Wapas Jao</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={onConfirm}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalBtnCancelText}>✕  Haan, Cancel Karo</Text>
                </TouchableOpacity>
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

export function SearchingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { setScreen, setAssignedDriver, selectedVehicle, currentRideId, setCurrentRideId } = useApp();
  const [msgIndex, setMsgIndex] = React.useState(0);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const { announceSearching } = useVoiceAI();
  const { showNotification } = useNotification();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    announceSearching();

    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    const msgTimer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);

    let cleanedUp = false;

    function handleDriverFound(driver: DriverInfo | null) {
      if (cleanedUp) return;
      cleanedUp = true;
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(timerRef.current!);
      clearInterval(msgTimer);
      const mockDriver = MOCK_DRIVERS.find((d) => d.vehicleType === selectedVehicle) ?? MOCK_DRIVERS[2];
      const driverName = driver?.name ?? mockDriver.name;
      const eta = driver?.eta ?? mockDriver.eta;
      setAssignedDriver({
        ...mockDriver,
        name: driverName,
        vehicleNumber: driver?.vehicleNumber ?? mockDriver.vehicleNumber,
        rating: driver ? (typeof driver.rating === "number" ? driver.rating : parseFloat(String(driver.rating)) || mockDriver.rating) : mockDriver.rating,
        eta,
      });
      showNotification({
        title: "Driver Mil Gaya! 🎉",
        body: `${driverName} ${eta} min mein aapke paas pahunchega`,
        type: "success",
        icon: "🚗",
        duration: 5000,
      });
      setScreen("driver_assigned");
    }

    function handleCancelled() {
      if (cleanedUp) return;
      cleanedUp = true;
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(timerRef.current!);
      clearInterval(msgTimer);
      showNotification({
        title: "Ride Cancel Ho Gayi",
        body: "Dobara try karo — drivers available hain",
        type: "error",
        icon: "❌",
        duration: 4000,
      });
      setScreen("home");
    }

    if (currentRideId && token) {
      const socket = connectSocket();
      joinRideRoom(currentRideId);
      socket.on("ride:status", (data: { rideId: number; status: string; driver?: DriverInfo | null }) => {
        if (data.rideId !== currentRideId) return;
        if (data.status === "accepted") handleDriverFound(data.driver ?? null);
        else if (data.status === "cancelled") handleCancelled();
      });
      pollRef.current = setInterval(async () => {
        try {
          const data = await ridesApi.getRide(token, currentRideId);
          if (data.ride.status === "accepted" && data.driver) handleDriverFound(data.driver);
          else if (data.ride.status === "cancelled") handleCancelled();
        } catch { }
      }, 5000);
    } else {
      const fallbackTimer = setTimeout(() => {
        clearInterval(timerRef.current!);
        clearInterval(msgTimer);
        setScreen("driver_assigned");
      }, 6000);
      return () => {
        clearTimeout(fallbackTimer);
        clearInterval(timerRef.current!);
        clearInterval(msgTimer);
      };
    }

    return () => {
      cleanedUp = true;
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(timerRef.current!);
      clearInterval(msgTimer);
      const s = getSocket();
      s.off("ride:status");
    };
  }, [currentRideId, token]);

  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1, false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const handleConfirmCancel = async () => {
    setShowCancelModal(false);
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentRideId && token) {
      try { await ridesApi.cancelRide(token, currentRideId); } catch { }
      setCurrentRideId(null);
    }
    setScreen("home");
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView showRadar />

      <Animated.View entering={FadeIn.springify()} style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
        <GlassCard style={styles.card} padding={24}>
          <View style={styles.radarContainer}>
            <RadarPulse delay={0} size={80} />
            <RadarPulse delay={833} size={140} />
            <RadarPulse delay={1666} size={200} />
            <View style={[styles.centerIcon, { backgroundColor: "rgba(245,166,35,0.13)", borderColor: colors.primary }]}>
              <Text style={{ fontSize: 28 }}>🧭</Text>
            </View>
          </View>

          <Animated.View style={dotStyle}>
            <Text style={[styles.message, { color: colors.foreground }]}>{MESSAGES[msgIndex]}</Text>
          </Animated.View>

          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Searching for {selectedVehicle === "bike" ? "bikes" : selectedVehicle === "auto" ? "autos" : "cabs"} near you
          </Text>

          <View style={styles.statsRow}>
            {[
              { label: "Drivers Nearby", value: "12", icon: "👥" },
              { label: "Wait Time", value: formatTime(elapsedSeconds), icon: "⏱️" },
            ].map(({ label, value, icon }) => (
              <View key={label} style={[styles.stat, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={styles.statIcon}>{icon}</Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => setShowCancelModal(true)}
            style={[styles.cancelBtn, { borderColor: "rgba(239,68,68,0.5)" }]}
          >
            <Text style={{ fontSize: 14, color: colors.destructive }}>✕</Text>
            <Text style={[styles.cancelText, { color: colors.destructive }]}>Ride Cancel Karo</Text>
          </Pressable>
        </GlassCard>
      </Animated.View>

      <CancelModal
        visible={showCancelModal}
        onConfirm={handleConfirmCancel}
        onDismiss={() => setShowCancelModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bottomSheet: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16 },
  card: {
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: "rgba(22,22,30,0.97)",
    alignItems: "center",
    gap: 12,
  },
  radarContainer: { width: 200, height: 200, alignItems: "center", justifyContent: "center" },
  centerIcon: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  message: { fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 12, width: "100%" },
  stat: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: "center", gap: 4 },
  statIcon: { fontSize: 20 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "rgba(18,18,26,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 20,
  },
  modalIconWrap: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 16,
  },
  modalIconOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(239,68,68,0.25)",
  },
  modalIconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(239,68,68,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalIconEmoji: { fontSize: 30 },
  modalTextWrap: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  modalNote: {
    color: "#F87171",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginHorizontal: 0,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 0,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnKeep: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.07)",
  },
  modalBtnKeepText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Inter_600SemiBold",
  },
  modalBtnCancel: {
    backgroundColor: "rgba(239,68,68,0.10)",
  },
  modalBtnCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F87171",
    fontFamily: "Inter_700Bold",
  },
});
