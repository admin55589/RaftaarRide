import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, Platform } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { MapView } from "@/components/MapView";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { connectSocket, joinRideRoom, getSocket } from "@/lib/socket";
import { useNotification } from "@/context/NotificationContext";
import { useLanguage } from "@/context/LanguageContext";
import { useVoiceAI } from "@/hooks/useVoiceAI";

const STAGES = ["Pickup", "On Ride", "Arriving"];

function StageBar({ stage }: { stage: number }) {
  const colors = useColors();
  return (
    <View style={styles.stageBar}>
      {STAGES.map((s, i) => (
        <React.Fragment key={s}>
          <View style={styles.stageItem}>
            <View
              style={[
                styles.stageDot,
                {
                  backgroundColor: i <= stage ? colors.primary : colors.border,
                  borderColor: i <= stage ? colors.primary : colors.border,
                },
              ]}
            >
              {i < stage && (
                <Text style={{ fontSize: 9, color: colors.primaryForeground, lineHeight: 12 }}>✓</Text>
              )}
              {i === stage && (
                <View style={[styles.stageDotInner, { backgroundColor: colors.primaryForeground }]} />
              )}
            </View>
            <Text
              style={[
                styles.stageLabel,
                { color: i <= stage ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {s}
            </Text>
          </View>
          {i < STAGES.length - 1 && (
            <View
              style={[
                styles.stageLine,
                { backgroundColor: i < stage ? colors.primary : colors.border },
              ]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

export function LiveTrackingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang, toggleLanguage } = useLanguage();
  const { assignedDriver, setScreen, addRideToHistory, destination, pickup, selectedVehicle, rideMode, estimatedPrice, currentRideId } = useApp();
  const { showNotification } = useNotification();
  const { announcePickupReached, announceRideStarted, announceArrived } = useVoiceAI();
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(12);
  const [driverLiveLocation, setDriverLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [ridePin, setRidePin] = useState<number | null>(null);

  useEffect(() => {
    if (!currentRideId) return;
    const socket = connectSocket();
    joinRideRoom(currentRideId);

    function onDriverLocation(data: { lat: number; lng: number; driverId: number }) {
      setDriverLiveLocation({ lat: data.lat, lng: data.lng });
    }

    function onRidePin(data: { pin: number }) {
      setRidePin(data.pin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    function onPinConfirmed() {
      setTimeout(() => setScreen("payment"), 600);
    }

    function onRideStatus(data: { status: string }) {
      if (data.status === "completed") {
        setTimeout(() => setScreen("payment"), 600);
      }
    }

    socket.on("driver:location", onDriverLocation);
    socket.on("ride:pin", onRidePin);
    socket.on("ride:pin:confirmed", onPinConfirmed);
    socket.on("ride:status", onRideStatus);

    return () => {
      socket.off("driver:location", onDriverLocation);
      socket.off("ride:pin", onRidePin);
      socket.off("ride:pin:confirmed", onPinConfirmed);
      socket.off("ride:status", onRideStatus);
    };
  }, [currentRideId]);

  useEffect(() => {
    const tick = setInterval(() => {
      setProgress((p) => {
        const next = p + 0.025;
        if (next >= 0.35 && stage === 0) {
          setStage(1);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showNotification({
            title: "Driver Aa Gaya! 📍",
            body: "Aapka driver pickup point pe hai — bahar aao!",
            type: "ride",
            icon: "📍",
            duration: 5000,
          });
          announcePickupReached();
        }
        if (next >= 0.7 && stage <= 1) {
          setStage(2);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showNotification({
            title: "Ride Shuru Ho Gayi! 🚀",
            body: "Manzil ki taraf chal padhe — safe journey!",
            type: "info",
            icon: "🚀",
            duration: 4000,
          });
          announceRideStarted(destination ?? "manzil");
        }
        if (next >= 1) {
          clearInterval(tick);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showNotification({
            title: "Safar Complete! 🎉",
            body: "Apni manzil pe pahunch gaye — enjoy karo!",
            type: "success",
            icon: "🎉",
            duration: 4000,
          });
          announceArrived();
          setTimeout(() => setScreen("payment"), 800);
          return 1;
        }
        return next;
      });
      setTimeLeft((t) => Math.max(0, t - 0.3));
    }, 300);
    return () => clearInterval(tick);
  }, [stage]);

  const driver = assignedDriver ?? { name: "Raj Kumar", rating: 4.8, vehicle: "Swift Dzire", vehicleNumber: "DL 4C AB 1234", vehicleType: selectedVehicle, eta: 5, photo: "RK" };

  const vehicleColor =
    driver.vehicleType === "bike" ? colors.bikeColor : driver.vehicleType === "auto" ? colors.autoColor : colors.cabColor;

  const glowOpacity = useSharedValue(1);
  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1, false
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView showRoute routeProgress={progress} driverLocation={driverLiveLocation} />

      <Pressable
        onPress={toggleLanguage}
        hitSlop={8}
        style={{ position: "absolute", top: topPad + 8, right: 16, zIndex: 200, width: 40, height: 40, borderRadius: 20, borderWidth: 1, backgroundColor: colors.primary + "22", borderColor: colors.primary + "66", alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{lang === "hi" ? "हिं" : "EN"}</Text>
      </Pressable>

      <View style={[styles.header, { paddingTop: topPad + 8, paddingHorizontal: 16 }]}>
        <GlassCard style={styles.headerCard} padding={12}>
          <StageBar stage={stage} />
        </GlassCard>
      </View>

      <Animated.View entering={FadeInDown.springify()} style={styles.sheet}>
        <GlassCard style={styles.card} padding={0}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={[styles.content, { paddingBottom: bottomPad + 12 }]}>
            <View style={styles.timerRow}>
              <View style={styles.timerInfo}>
                <Animated.View style={[styles.glowDot, { backgroundColor: vehicleColor }, glowStyle]} />
                <Text style={[styles.timerLabel, { color: colors.mutedForeground }]}>Arriving in</Text>
              </View>
              <Text style={[styles.timerValue, { color: vehicleColor }]}>
                {Math.ceil(timeLeft)} min
              </Text>
            </View>

            <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress * 100}%`,
                    backgroundColor: vehicleColor,
                  },
                ]}
              />
            </View>

            <View style={styles.driverRow}>
              <View style={[styles.driverAvatar, { backgroundColor: vehicleColor + "22", borderColor: vehicleColor }]}>
                <Text style={[styles.driverInitials, { color: vehicleColor }]}>{driver.photo}</Text>
              </View>
              <View style={styles.driverInfo}>
                <Text style={[styles.driverName, { color: colors.foreground }]}>{driver.name}</Text>
                <Text style={[styles.driverPlate, { color: colors.mutedForeground }]}>{driver.vehicleNumber}</Text>
              </View>
              <Pressable style={[styles.callBtn, { backgroundColor: colors.success + "22", borderColor: colors.success }]}>
                <Text style={styles.callBtnEmoji}>📞</Text>
              </Pressable>
            </View>

            {ridePin && (
              <View style={[styles.pinBox, { borderColor: colors.primary + "66", backgroundColor: colors.primary + "18" }]}>
                <Text style={[styles.pinLabel, { color: colors.mutedForeground }]}>🔐 Driver ko yeh PIN batao</Text>
                <Text style={[styles.pinNumber, { color: colors.primary }]}>{ridePin}</Text>
                <Text style={[styles.pinHint, { color: colors.mutedForeground }]}>Ride complete hone par driver maangega</Text>
              </View>
            )}

            <View style={styles.sosRow}>
              <Pressable style={[styles.sosBtn, { backgroundColor: "rgba(239,68,68,0.13)", borderColor: colors.destructive }]}>
                <Text style={{ fontSize: 14 }}>⚠️</Text>
                <Text style={[styles.sosText, { color: colors.destructive }]}>Emergency SOS</Text>
              </Pressable>
              <Pressable style={[styles.shareBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={{ fontSize: 14 }}>📤</Text>
              </Pressable>
            </View>
          </View>
        </GlassCard>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerCard: {
    borderRadius: 20,
  },
  stageBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  stageItem: {
    alignItems: "center",
    gap: 4,
  },
  stageDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stageDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stageLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  stageLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    marginBottom: 16,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
  },
  content: {
    padding: 20,
    gap: 14,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timerLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  timerValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  driverInitials: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  driverInfo: { flex: 1 },
  driverName: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  driverPlate: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  callBtnEmoji: {
    fontSize: 18,
  },
  sosRow: {
    flexDirection: "row",
    gap: 10,
  },
  sosBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
  },
  sosText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  shareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pinBox: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 4,
  },
  pinLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  pinNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    letterSpacing: 10,
  },
  pinHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
