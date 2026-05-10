import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { MapView } from "@/components/MapView";
import { useVoiceAI } from "@/hooks/useVoiceAI";
import { ridesApi, type DriverInfo } from "@/lib/ridesApi";
import { connectSocket, joinRideRoom, getSocket } from "@/lib/socket";
import { useNotification } from "@/context/NotificationContext";
import { API_BASE } from "@/lib/api";

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

const CANCEL_REASONS = [
  "Driver bahut door hai",
  "Plan change ho gaya",
  "Galat pickup location",
  "Driver response nahi kar raha",
  "Emergency",
  "Koi aur reason",
];

function CancelModal({ visible, onConfirm, onDismiss }: { visible: boolean; onConfirm: (reason: string) => void; onDismiss: () => void }) {
  const { isDark } = useTheme();
  const colors = useColors();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const iconScale = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      iconScale.value = 0;
      iconScale.value = withSpring(1, { damping: 12, stiffness: 180 });
      setSelectedReason(null);
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
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Cancel Kyon Karna Chahte Ho?</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  Ek reason select karo (analytics ke liye)
                </Text>
                <View style={{ marginTop: 8, backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" }}>
                  <Text style={{ color: "#22c55e", fontSize: 12, fontWeight: "600", textAlign: "center" }}>
                    ✅ Abhi cancel karo — koi charge nahi lagega
                  </Text>
                </View>
              </Animated.View>
              <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
                {CANCEL_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    onPress={() => setSelectedReason(reason)}
                    activeOpacity={0.7}
                    style={{
                      paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: selectedReason === reason ? "#f59e0b" : colors.border,
                      backgroundColor: selectedReason === reason ? "rgba(245,158,11,0.1)" : colors.muted,
                      flexDirection: "row", alignItems: "center", gap: 8,
                    }}
                  >
                    <View style={{
                      width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                      borderColor: selectedReason === reason ? "#f59e0b" : colors.mutedForeground,
                      backgroundColor: selectedReason === reason ? "#f59e0b" : "transparent",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {selectedReason === reason && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "white" }} />}
                    </View>
                    <Text style={{ color: selectedReason === reason ? "#f59e0b" : colors.foreground, fontSize: 13, fontWeight: "500", flex: 1 }}>{reason}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Animated.View entering={FadeInDown.delay(140)} style={[styles.modalBtnRow, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.modalBtnKeep, { borderColor: colors.border }]}
                  onPress={onDismiss}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 15 }}>←</Text>
                  <Text style={[styles.modalBtnKeepText, { color: colors.foreground }]}>Wapas Jao</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnCancel, { opacity: selectedReason ? 1 : 0.45 }]}
                  onPress={() => selectedReason && onConfirm(selectedReason)}
                  activeOpacity={0.8}
                  disabled={!selectedReason}
                >
                  <Text style={{ fontSize: 15 }}>✕</Text>
                  <Text style={styles.modalBtnCancelText}>Cancel Karo</Text>
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
  const { setScreen, setAssignedDriver, selectedVehicle, currentRideId, setCurrentRideId, pickup, destination } = useApp();
  const [msgIndex, setMsgIndex] = React.useState(0);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [onlineDriverCount, setOnlineDriverCount] = useState<number | null>(null);
  const [searchRadiusKm, setSearchRadiusKm] = useState<number>(5);
  const [radiusMsg, setRadiusMsg] = useState<string | null>(null);
  const { announceSearching } = useVoiceAI();
  const { showNotification } = useNotification();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const vehicleIcon = selectedVehicle === "bike" ? "🏍️" : selectedVehicle === "auto" ? "🛺" : selectedVehicle === "suv" ? "🚙" : "🚗";
  const vehicleLabel = selectedVehicle === "bike" ? "Bike" : selectedVehicle === "auto" ? "Auto" : selectedVehicle === "suv" ? "SUV" : "Cab";
  const vehicleColor = selectedVehicle === "bike" ? "#F5A623" : selectedVehicle === "auto" ? "#22c55e" : selectedVehicle === "suv" ? "#9333ea" : "#818cf8";

  useEffect(() => {
    fetch(`${API_BASE}/stats/online-drivers`)
      .then((r) => r.json())
      .then((d: { count: number }) => setOnlineDriverCount(d.count))
      .catch(() => {});
  }, []);

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
      const ratingVal = driver
        ? (typeof driver.rating === "number" ? driver.rating : parseFloat(String(driver.rating)) || 4.5)
        : 4.5;
      const vehicleLabel = (vt: string) => {
        switch (vt.toLowerCase()) {
          case "bike":  return "Bike";
          case "auto":  return "Auto Rickshaw";
          case "suv":   return "SUV";
          case "prime":
          case "cab":
          case "car":   return "Sedan Car";
          default:      return "Sedan Car";
        }
      };
      const vType = (driver?.vehicleType ?? selectedVehicle ?? "prime") as import("@/context/AppContext").VehicleType;
      const initials = driver?.name
        ? driver.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
        : "DR";
      setAssignedDriver({
        id: driver?.id ? String(driver.id) : "0",
        name: driver?.name ?? "Driver",
        phone: driver?.phone ?? undefined,
        vehicleType: vType,
        vehicleNumber: driver?.vehicleNumber ?? "—",
        vehicle: vehicleLabel(driver?.vehicleType ?? selectedVehicle ?? "prime"),
        rating: ratingVal,
        eta: driver?.eta ?? 5,
        photo: initials,
      });
      showNotification({ title: "Driver Mil Gaya! 🎉", body: `${driver?.name ?? "Driver"} ${driver?.eta ?? 5} min mein aapke paas pahunchega`, type: "success", icon: "🚗", duration: 5000 });
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

      /* All broadcast attempts exhausted — no driver available */
      socket.on("ride:no_driver", (data: { rideId: number }) => {
        if (data.rideId !== currentRideId) return;
        if (cleanedUp) return;
        cleanedUp = true;
        if (pollRef.current) clearInterval(pollRef.current);
        clearInterval(timerRef.current!);
        clearInterval(msgTimer);
        showNotification({
          title: "Koi Driver Nahi Mila 😔",
          body: "Is area mein abhi koi driver available nahi. Thodi der baad dobara try karein.",
          type: "error", icon: "😔", duration: 6000,
        });
        setScreen("home");
      });

      /* Women safety: no female driver found — ask user preference */
      socket.on("ride:no_female_driver", (data: { rideId: number; message: string }) => {
        if (data.rideId !== currentRideId) return;
        if (cleanedUp) return;
        Alert.alert(
          "👩 Female Driver Nahi Mili",
          data.message,
          [
            {
              text: "Nahi, Cancel Karo",
              style: "destructive",
              onPress: () => {
                if (currentRideId && token) {
                  ridesApi.cancelRide(token, currentRideId, "Female driver nahi mili").catch(() => {});
                  setCurrentRideId(null);
                }
                setScreen("home");
              },
            },
            {
              text: "Haan, Male Driver Chalega",
              onPress: () => {
                if (currentRideId && token) {
                  ridesApi.allowMaleDriver(token, currentRideId).catch(() => {});
                }
              },
            },
          ],
          { cancelable: false },
        );
      });

      /* Progressive radius expansion notification */
      socket.on("ride:radius_expanded", (data: { rideId: number; prevRadiusKm: number; newRadiusKm: number | null; message: string }) => {
        if (data.rideId !== currentRideId) return;
        setSearchRadiusKm(data.newRadiusKm ?? 99);
        setRadiusMsg(data.message);
        showNotification({
          title: "🔍 Search Badha Rahe Hain",
          body: data.message,
          type: "info",
          icon: "📍",
          duration: 4000,
        });
      });

      pollRef.current = setInterval(async () => {
        try {
          const data = await ridesApi.getRide(token, currentRideId);
          if (data.ride.status === "accepted" && data.driver) handleDriverFound(data.driver);
          else if (data.ride.status === "cancelled") handleCancelled();
        } catch { }
      }, 5000);
    } else {
      /* No rideId — ride was likely already cancelled or state is inconsistent; go home safely */
      const fallbackTimer = setTimeout(() => {
        clearInterval(timerRef.current!);
        clearInterval(msgTimer);
        setScreen("home");
      }, 3000);
      return () => { clearTimeout(fallbackTimer); clearInterval(timerRef.current!); clearInterval(msgTimer); };
    }
    return () => {
      cleanedUp = true;
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(timerRef.current!);
      clearInterval(msgTimer);
      const s = getSocket();
      s.off("ride:status");
      s.off("ride:no_driver");
      s.off("ride:no_female_driver");
      s.off("ride:radius_expanded");
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

  const handleConfirmCancel = async (cancelReason: string) => {
    setShowCancelModal(false);
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentRideId && token) {
      try { await ridesApi.cancelRide(token, currentRideId, cancelReason); } catch { }
      setCurrentRideId(null);
    }
    setScreen("home");
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView showRadar />

      {/* Top gradient overlay over map */}
      <LinearGradient
        colors={["transparent", `${colors.background}99`, colors.background]}
        style={styles.mapOverlay}
        pointerEvents="none"
      />

      <Animated.View
        entering={FadeInUp.springify().damping(18)}
        style={[styles.bottomSheet, { paddingBottom: insets.bottom + 8 }]}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* ── Header row ── */}
            <Animated.View entering={FadeInDown.delay(60)} style={styles.headerRow}>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerTitle, { color: colors.foreground }]}>Driver Mil Raha Hai</Text>
                <Animated.Text style={[styles.headerSub, msgStyle, { color: colors.mutedForeground }]}>
                  {MESSAGES[msgIndex]}
                </Animated.Text>
              </View>
              <LiveBadge />
            </Animated.View>

            {/* ── Route strip ── */}
            <Animated.View entering={FadeInDown.delay(80)} style={[styles.routeStrip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.routeRow}>
                <View style={styles.routeDotCol}>
                  <View style={[styles.routeDotInner, { backgroundColor: "#22c55e" }]} />
                  <View style={[styles.routeConnector, { backgroundColor: colors.border }]} />
                </View>
                <Text style={[styles.routeText, { color: colors.foreground }]} numberOfLines={1}>
                  {pickup || "Aapki location"}
                </Text>
              </View>
              <View style={styles.routeRow}>
                <View style={styles.routeDotCol}>
                  <View style={[styles.routeDotInner, { backgroundColor: vehicleColor }]} />
                </View>
                <Text style={[styles.routeText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {destination || "Destination"}
                </Text>
              </View>
            </Animated.View>

            {/* ── Centered Radar + Vehicle ── */}
            <Animated.View entering={FadeInDown.delay(120)} style={styles.radarCenter}>
              <View style={styles.radarWrap}>
                <RadarRing delay={0} size={90} />
                <RadarRing delay={740} size={136} />
                <RadarRing delay={1480} size={182} />
                <View style={styles.vehicleIconWrap}>
                  <LinearGradient
                    colors={[vehicleColor, vehicleColor + "BB"]}
                    style={styles.vehicleIconBg}
                  >
                    <Text style={styles.vehicleEmoji}>{vehicleIcon}</Text>
                  </LinearGradient>
                  <SpinningRing />
                </View>
              </View>

              <View style={styles.radarTextCol}>
                <PulsingDots />
                <Text style={[styles.vehicleLabel, { color: colors.foreground }]}>
                  {vehicleLabel} dhundh rahe hain...
                </Text>
                <View style={[styles.etaBadge, { backgroundColor: vehicleColor + "20", borderColor: vehicleColor + "55" }]}>
                  <Text style={[styles.etaText, { color: vehicleColor }]}>⏱ {formatTime(elapsedSeconds)}</Text>
                </View>
              </View>
            </Animated.View>

            {/* ── Stats row ── */}
            <Animated.View entering={FadeInDown.delay(160)} style={styles.statsRow}>
              <LinearGradient
                colors={["rgba(245,166,35,0.13)", "rgba(245,166,35,0.04)"]}
                style={[styles.statCard, { borderColor: "rgba(245,166,35,0.3)" }]}
              >
                <Text style={styles.statEmoji}>👥</Text>
                <Text style={styles.statNum}>{onlineDriverCount ?? "—"}</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Online{"\n"}Drivers</Text>
              </LinearGradient>

              <LinearGradient
                colors={["rgba(99,102,241,0.13)", "rgba(99,102,241,0.04)"]}
                style={[styles.statCard, { borderColor: "rgba(99,102,241,0.3)" }]}
              >
                <Text style={styles.statEmoji}>⏱️</Text>
                <Text style={[styles.statNum, { color: "#818cf8" }]}>{formatTime(elapsedSeconds)}</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Intezaar{"\n"}ka Waqt</Text>
              </LinearGradient>

              <LinearGradient
                colors={["rgba(34,197,94,0.13)", "rgba(34,197,94,0.04)"]}
                style={[styles.statCard, { borderColor: "rgba(34,197,94,0.3)" }]}
              >
                <Text style={styles.statEmoji}>🗺️</Text>
                <Text style={[styles.statNum, { color: "#22c55e" }]}>
                  {searchRadiusKm >= 99 ? "🌆" : `${searchRadiusKm}km`}
                </Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Search{"\n"}Radius</Text>
              </LinearGradient>
            </Animated.View>

            {/* ── Radius expansion banner ── */}
            {radiusMsg && (
              <Animated.View
                entering={FadeInDown.springify().damping(14)}
                style={[styles.radiusBanner, { borderColor: "rgba(245,166,35,0.4)", backgroundColor: "rgba(245,166,35,0.08)" }]}
              >
                <Text style={styles.radiusBannerIcon}>📍</Text>
                <Text style={[styles.radiusBannerText, { color: "#f5a623" }]} numberOfLines={2}>
                  {radiusMsg}
                </Text>
              </Animated.View>
            )}

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
                  colors={["rgba(239,68,68,0.15)", "rgba(239,68,68,0.06)"]}
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

  mapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.45,
    zIndex: 0,
  },

  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },

  card: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
    overflow: "hidden",
  },

  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 16,
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
    fontSize: 22,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    marginTop: 3,
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

  /* ── Route Strip ── */
  routeStrip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 0,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 28,
  },
  routeDotCol: {
    width: 16,
    alignItems: "center",
    gap: 0,
  },
  routeDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeConnector: {
    width: 2,
    height: 12,
    borderRadius: 1,
    marginTop: 2,
  },
  routeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },

  /* ── Radar centered ── */
  radarCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 4,
  },
  radarWrap: {
    width: 168,
    height: 168,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleIconWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F5A623",
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  vehicleEmoji: { fontSize: 32 },

  spinRing: {
    borderRadius: 36,
    alignItems: "center",
  },
  spinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F5A623",
    position: "absolute",
    top: 0,
    left: "50%",
    marginLeft: -4,
    shadowColor: "#F5A623",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },

  radarTextCol: {
    flex: 1,
    gap: 10,
    justifyContent: "center",
  },
  dotsRow: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#F5A623",
  },
  vehicleLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    lineHeight: 24,
  },
  etaBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  etaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },

  /* ── Stats ── */
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    gap: 3,
    borderRadius: 16,
    borderWidth: 1,
  },
  statEmoji: { fontSize: 20 },
  statNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: "#F5A623",
    letterSpacing: -0.5,
  },
  statLbl: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },

  /* ── Radius expansion banner ── */
  radiusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  radiusBannerIcon: {
    fontSize: 16,
  },
  radiusBannerText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
  },

  /* ── Progress ── */
  progressWrap: { gap: 6 },
  progressBg: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#F5A623",
    borderRadius: 3,
  },
  progressHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11.5,
    textAlign: "center",
  },

  /* ── Cancel ── */
  cancelBtn: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
  },
  cancelGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  cancelX: { fontSize: 13, color: "#f87171" },
  cancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14.5,
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
  modalBtnRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20,
    borderTopWidth: 1,
  },
  modalBtnKeep: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  modalBtnKeepText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  modalBtnCancel: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalBtnCancelText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF", fontFamily: "Inter_700Bold" },
});
