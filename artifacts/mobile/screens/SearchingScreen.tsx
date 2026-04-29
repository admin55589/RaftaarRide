import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
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
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { useApp, MOCK_DRIVERS } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { MapView } from "@/components/MapView";
import { useVoiceAI } from "@/hooks/useVoiceAI";
import { ridesApi, type DriverInfo } from "@/lib/ridesApi";
import { connectSocket, joinRideRoom, getSocket } from "@/lib/socket";
import { useNotification } from "@/context/NotificationContext";

const { height: SCREEN_H } = Dimensions.get("window");

const MESSAGES = [
  "Nearby drivers dhundh rahe hain...",
  "Connecting with drivers...",
  "Driver mil raha hai...",
  "Almost there — ruko!",
];

function RadarRing({ delay, size }: { delay: number; size: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0.7);
  useEffect(() => {
    const t = setTimeout(() => {
      scale.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false);
      opacity.value = withRepeat(withTiming(0, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false);
    }, delay);
    return () => clearTimeout(t);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{
      position: "absolute", width: size, height: size,
      borderRadius: size / 2, borderWidth: 1.5,
      borderColor: "rgba(245,166,35,0.5)",
    }, style]} />
  );
}

function SpinningRing() {
  const rotate = useSharedValue(0);
  useEffect(() => {
    rotate.value = withRepeat(withTiming(360, { duration: 2800, easing: Easing.linear }), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.spinRing, style]}>
      <View style={styles.spinDot} />
    </Animated.View>
  );
}

function PulsingDots() {
  const DOTS = [0, 1, 2];
  return (
    <View style={styles.dotsRow}>
      {DOTS.map((i) => {
        const op = useSharedValue(0.25);
        useEffect(() => {
          const t = setTimeout(() => {
            op.value = withRepeat(
              withSequence(
                withTiming(1, { duration: 450 }),
                withTiming(0.25, { duration: 450 }),
              ), -1, false
            );
          }, i * 180);
          return () => clearTimeout(t);
        }, []);
        const s = useAnimatedStyle(() => ({ opacity: op.value }));
        return <Animated.View key={i} style={[styles.dot, s]} />;
      })}
    </View>
  );
}

function LiveBadge() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.3, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View style={styles.liveChip}>
      <Animated.View style={[styles.liveDot, dotStyle]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

function CancelModal({ visible, onConfirm, onDismiss }: { visible: boolean; onConfirm: () => void; onDismiss: () => void }) {
  const { isDark } = useTheme();
  const colors = useColors();
  const iconScale = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      iconScale.value = 0;
      iconScale.value = withSpring(1, { damping: 12, stiffness: 180 });
    }
  }, [visible]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <BlurView intensity={isDark ? 60 : 40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.modalBackdrop} onPress={onDismiss}>
          <Animated.View entering={FadeInUp.springify().damping(14)} style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable>
              <Animated.View style={[styles.modalIconWrap, iconStyle]}>
                <View style={styles.modalIconOuter}>
                  <View style={styles.modalIconInner}>
                    <Text style={styles.modalIconEmoji}>🚫</Text>
                  </View>
                </View>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(80)} style={styles.modalTextWrap}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Ride Cancel Karen?</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  Kya aap sach mein yeh ride cancel karna chahte hain?{"\n"}
                  <Text style={styles.modalNote}>Driver dhundhna bandh ho jaega.</Text>
                </Text>
              </Animated.View>
              <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />
              <Animated.View entering={FadeInDown.delay(140)} style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnKeep, { borderRightColor: colors.border }]} onPress={onDismiss} activeOpacity={0.8}>
                  <Text style={[styles.modalBtnKeepText, { color: colors.foreground }]}>⬅  Nahi, Wapas Jao</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={onConfirm} activeOpacity={0.8}>
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

  const vehicleIcon = selectedVehicle === "bike" ? "🏍️" : selectedVehicle === "auto" ? "🛺" : "🚗";
  const vehicleLabel = selectedVehicle === "bike" ? "Bike" : selectedVehicle === "auto" ? "Auto" : "Cab";
  const vehicleColor = selectedVehicle === "bike" ? "#F5A623" : selectedVehicle === "auto" ? "#22c55e" : "#818cf8";

  useEffect(() => {
    announceSearching();
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    const msgTimer = setInterval(() => setMsgIndex((i) => (i + 1) % MESSAGES.length), 3000);
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
        phone: driver?.phone ?? undefined,
        vehicleNumber: driver?.vehicleNumber ?? mockDriver.vehicleNumber,
        rating: driver ? (typeof driver.rating === "number" ? driver.rating : parseFloat(String(driver.rating)) || mockDriver.rating) : mockDriver.rating,
        eta,
      });
      showNotification({ title: "Driver Mil Gaya! 🎉", body: `${driverName} ${eta} min mein aapke paas pahunchega`, type: "success", icon: "🚗", duration: 5000 });
      setScreen("driver_assigned");
    }

    function handleCancelled() {
      if (cleanedUp) return;
      cleanedUp = true;
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(timerRef.current!);
      clearInterval(msgTimer);
      showNotification({ title: "Ride Cancel Ho Gayi", body: "Dobara try karo — drivers available hain", type: "error", icon: "❌", duration: 4000 });
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
      return () => { clearTimeout(fallbackTimer); clearInterval(timerRef.current!); clearInterval(msgTimer); };
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

  const msgOpacity = useSharedValue(1);
  useEffect(() => {
    msgOpacity.value = withRepeat(
      withSequence(withTiming(0.4, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false
    );
  }, []);
  const msgStyle = useAnimatedStyle(() => ({ opacity: msgOpacity.value }));

  /* Animated progress fill */
  const progressWidth = useSharedValue(0);
  useEffect(() => {
    progressWidth.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 3200, easing: Easing.out(Easing.quad) }),
        withTiming(0.1, { duration: 800, easing: Easing.in(Easing.quad) }),
      ), -1, false
    );
  }, []);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressWidth.value * 100}%` as any }));

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

  /* Cap sheet height so it never overflows the screen */
  const maxSheetH = SCREEN_H * 0.62;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView showRadar />

      <Animated.View entering={FadeIn.springify()} style={[styles.bottomSheet, { maxHeight: maxSheetH, paddingBottom: insets.bottom + 8 }]}>

        {/* Gradient fade at top of sheet */}
        <LinearGradient
          colors={[`${colors.background}00`, `${colors.background}CC`]}
          style={styles.fadeTop}
          pointerEvents="none"
        />

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* ── Header ── */}
            <Animated.View entering={FadeInDown.delay(60)} style={styles.headerRow}>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerTitle, { color: colors.foreground }]}>Driver Mil Raha Hai</Text>
                <Animated.Text style={[styles.headerSub, msgStyle, { color: colors.mutedForeground }]}>
                  {MESSAGES[msgIndex]}
                </Animated.Text>
              </View>
              <LiveBadge />
            </Animated.View>

            {/* ── Radar + Vehicle (compact) ── */}
            <Animated.View entering={FadeInDown.delay(100)} style={styles.radarRow}>
              {/* Left: radar */}
              <View style={styles.radarWrap}>
                <RadarRing delay={0} size={72} />
                <RadarRing delay={740} size={112} />
                <RadarRing delay={1480} size={152} />
                <View style={styles.vehicleIconWrap}>
                  <LinearGradient
                    colors={[vehicleColor, vehicleColor + "CC"]}
                    style={styles.vehicleIconBg}
                  >
                    <Text style={styles.vehicleEmoji}>{vehicleIcon}</Text>
                  </LinearGradient>
                  <SpinningRing />
                </View>
              </View>

              {/* Right: info */}
              <View style={styles.radarInfo}>
                <PulsingDots />
                <Text style={[styles.vehicleLabel, { color: colors.foreground }]}>
                  {vehicleLabel} dhundh{"\n"}rahe hain...
                </Text>
                <View style={[styles.etaBadge, { backgroundColor: vehicleColor + "18", borderColor: vehicleColor + "44" }]}>
                  <Text style={[styles.etaText, { color: vehicleColor }]}>⏱ {formatTime(elapsedSeconds)}</Text>
                </View>
              </View>
            </Animated.View>

            {/* ── Stats row ── */}
            <Animated.View entering={FadeInDown.delay(160)} style={styles.statsRow}>
              <LinearGradient
                colors={["rgba(245,166,35,0.12)", "rgba(245,166,35,0.04)"]}
                style={[styles.statCard, { borderColor: "rgba(245,166,35,0.25)" }]}
              >
                <Text style={styles.statEmoji}>👥</Text>
                <Text style={styles.statNum}>12</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Paas ke{"\n"}Drivers</Text>
              </LinearGradient>

              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

              <LinearGradient
                colors={["rgba(99,102,241,0.12)", "rgba(99,102,241,0.04)"]}
                style={[styles.statCard, { borderColor: "rgba(99,102,241,0.25)" }]}
              >
                <Text style={styles.statEmoji}>⏱️</Text>
                <Text style={[styles.statNum, { color: "#818cf8" }]}>{formatTime(elapsedSeconds)}</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Intezaar{"\n"}ka Waqt</Text>
              </LinearGradient>

              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

              <LinearGradient
                colors={["rgba(34,197,94,0.12)", "rgba(34,197,94,0.04)"]}
                style={[styles.statCard, { borderColor: "rgba(34,197,94,0.25)" }]}
              >
                <Text style={styles.statEmoji}>🗺️</Text>
                <Text style={[styles.statNum, { color: "#22c55e", fontSize: 18 }]}>2km</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Search{"\n"}Radius</Text>
              </LinearGradient>
            </Animated.View>

            {/* ── Progress bar ── */}
            <Animated.View entering={FadeInDown.delay(200)} style={styles.progressWrap}>
              <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
                <Animated.View style={[styles.progressFill, progressStyle]} />
              </View>
              <Text style={[styles.progressHint, { color: colors.mutedForeground }]}>
                Best match dhundha ja raha hai...
              </Text>
            </Animated.View>

            {/* ── Cancel button ── */}
            <Animated.View entering={FadeInDown.delay(240)}>
              <Pressable
                onPress={() => setShowCancelModal(true)}
                style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.75 : 1 }]}
              >
                <LinearGradient
                  colors={["rgba(239,68,68,0.14)", "rgba(239,68,68,0.07)"]}
                  style={styles.cancelGrad}
                >
                  <Text style={styles.cancelX}>✕</Text>
                  <Text style={styles.cancelText}>Ride Cancel Karo</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </View>
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

  fadeTop: {
    position: "absolute",
    top: -40,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 1,
  },

  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },

  card: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
    overflow: "hidden",
  },

  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 2,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    gap: 14,
  },

  /* ── Header ── */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  headerTextCol: { flex: 1 },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    marginTop: 2,
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34,197,94,0.13)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  liveText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#22c55e",
    letterSpacing: 1,
  },

  /* ── Radar row (horizontal layout) ── */
  radarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingVertical: 6,
  },
  radarWrap: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleIconWrap: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F5A623",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  vehicleEmoji: { fontSize: 26 },

  spinRing: {
    borderRadius: 30,
    alignItems: "center",
  },
  spinDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#F5A623",
    position: "absolute",
    top: 0,
    left: "50%",
    marginLeft: -3.5,
    shadowColor: "#F5A623",
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 5,
  },

  radarInfo: {
    flex: 1,
    gap: 8,
  },
  dotsRow: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F5A623",
  },
  vehicleLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 22,
  },
  etaBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  etaText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },

  /* ── Stats ── */
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    gap: 2,
  },
  statDivider: {
    width: 1,
    marginVertical: 8,
  },
  statEmoji: { fontSize: 18 },
  statNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#F5A623",
    letterSpacing: -0.5,
  },
  statLbl: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },

  /* ── Progress ── */
  progressWrap: { gap: 5 },
  progressBg: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#F5A623",
    borderRadius: 2,
  },
  progressHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
  },

  /* ── Cancel ── */
  cancelBtn: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  cancelGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
  },
  cancelX: { fontSize: 12, color: "#f87171" },
  cancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#f87171",
  },

  /* ── Cancel Modal ── */
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  modalCard: {
    width: "100%", borderRadius: 28, overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 20,
  },
  modalIconWrap: { alignItems: "center", paddingTop: 32, paddingBottom: 16 },
  modalIconOuter: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(239,68,68,0.25)" },
  modalIconInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(239,68,68,0.18)", alignItems: "center", justifyContent: "center" },
  modalIconEmoji: { fontSize: 30 },
  modalTextWrap: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 24, gap: 10 },
  modalTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular", lineHeight: 22 },
  modalNote: { color: "#F87171", fontSize: 12, fontFamily: "Inter_500Medium" },
  modalDivider: { height: 1 },
  modalBtnRow: { flexDirection: "row", gap: 0 },
  modalBtn: { flex: 1, paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  modalBtnKeep: { borderRightWidth: 1 },
  modalBtnKeepText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  modalBtnCancel: { backgroundColor: "rgba(239,68,68,0.10)" },
  modalBtnCancelText: { fontSize: 14, fontWeight: "700", color: "#F87171", fontFamily: "Inter_700Bold" },
});
