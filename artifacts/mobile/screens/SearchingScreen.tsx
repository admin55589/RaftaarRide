import React, { useEffect, useRef } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useApp, MOCK_DRIVERS } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { MapView } from "@/components/MapView";
import { GlassCard } from "@/components/GlassCard";
import { Feather } from "@expo/vector-icons";
import { useVoiceAI } from "@/hooks/useVoiceAI";
import { ridesApi } from "@/lib/ridesApi";

const MESSAGES = [
  "Finding nearby drivers...",
  "Connecting with drivers...",
  "Driver mil raha hai...",
  "Almost there...",
];

const HINGLISH_MSGS = [
  "Aas-paas drivers dhundh rahe hain...",
  "Aapke liye best driver choose kar rahe hain...",
  "Driver confirm ho raha hai...",
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

export function SearchingScreen() {
  const colors = useColors();
  const { token } = useAuth();
  const { setScreen, setAssignedDriver, selectedVehicle, currentRideId, setCurrentRideId } = useApp();
  const [msgIndex, setMsgIndex] = React.useState(0);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const { announceSearching } = useVoiceAI();
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

    if (currentRideId && token) {
      pollRef.current = setInterval(async () => {
        try {
          const data = await ridesApi.getRide(token, currentRideId);
          if (data.ride.status === "accepted" && data.driver) {
            clearInterval(pollRef.current!);
            clearInterval(timerRef.current!);
            clearInterval(msgTimer);
            const mockDriver = MOCK_DRIVERS.find((d) => d.vehicleType === selectedVehicle) ?? MOCK_DRIVERS[2];
            setAssignedDriver({
              ...mockDriver,
              name: data.driver.name ?? mockDriver.name,
              vehicleNumber: data.driver.vehicleNumber ?? mockDriver.vehicleNumber,
              rating: typeof data.driver.rating === "number" ? data.driver.rating : parseFloat(String(data.driver.rating)) || mockDriver.rating,
              eta: data.driver.eta ?? mockDriver.eta,
            });
            setScreen("driver_assigned");
          } else if (data.ride.status === "cancelled") {
            clearInterval(pollRef.current!);
            clearInterval(timerRef.current!);
            clearInterval(msgTimer);
            setScreen("home");
          }
        } catch { }
      }, 3000);
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
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(timerRef.current!);
      clearInterval(msgTimer);
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

  const handleCancel = () => {
    Alert.alert(
      "Ride Cancel Karen?",
      "Kya aap sach mein yeh ride cancel karna chahte hain?",
      [
        { text: "Nahi", style: "cancel" },
        {
          text: "Haan, Cancel Karo",
          style: "destructive",
          onPress: async () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            if (currentRideId && token) {
              try { await ridesApi.cancelRide(token, currentRideId); } catch { }
              setCurrentRideId(null);
            }
            setScreen("home");
          },
        },
      ]
    );
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView showRadar />

      <Animated.View entering={FadeIn.springify()} style={styles.bottomSheet}>
        <GlassCard style={styles.card} padding={24}>
          <View style={styles.radarContainer}>
            <RadarPulse delay={0} size={80} />
            <RadarPulse delay={833} size={140} />
            <RadarPulse delay={1666} size={200} />
            <View style={[styles.centerIcon, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
              <Feather name="navigation" size={28} color={colors.primary} />
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
            onPress={handleCancel}
            style={[styles.cancelBtn, { borderColor: colors.destructive + "80" }]}
          >
            <Feather name="x" size={14} color={colors.destructive} />
            <Text style={[styles.cancelText, { color: colors.destructive }]}>Ride Cancel Karo</Text>
          </Pressable>
        </GlassCard>
      </Animated.View>
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
});
