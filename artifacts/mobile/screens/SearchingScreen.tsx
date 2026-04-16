import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
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
import { useApp } from "@/context/AppContext";
import { MapView } from "@/components/MapView";
import { GlassCard } from "@/components/GlassCard";
import { Feather } from "@expo/vector-icons";

const MESSAGES = [
  "Finding nearby drivers...",
  "Connecting with drivers...",
  "Almost there...",
];

function RadarPulse({ delay, size }: { delay: number; size: number }) {
  const colors = useColors();
  const opacity = useSharedValue(0.8);
  const scale = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => {
      scale.value = withRepeat(
        withTiming(1, { duration: 2500, easing: Easing.out(Easing.quad) }),
        -1, false
      );
      opacity.value = withRepeat(
        withTiming(0, { duration: 2500, easing: Easing.out(Easing.quad) }),
        -1, false
      );
    }, delay);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: colors.primary,
        },
        style,
      ]}
    />
  );
}

export function SearchingScreen() {
  const colors = useColors();
  const { setScreen, assignedDriver, selectedVehicle } = useApp();
  const [msgIndex, setMsgIndex] = React.useState(0);

  useEffect(() => {
    const intervals = [
      setTimeout(() => setMsgIndex(1), 2000),
      setTimeout(() => setMsgIndex(2), 4000),
      setTimeout(() => { setScreen("driver_assigned"); }, 5500),
    ];
    return () => intervals.forEach(clearTimeout);
  }, []);

  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1, false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

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
            <Text style={[styles.message, { color: colors.foreground }]}>
              {MESSAGES[msgIndex]}
            </Text>
          </Animated.View>

          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Searching for {selectedVehicle === "bike" ? "bikes" : selectedVehicle === "auto" ? "autos" : "cabs"} near you
          </Text>

          <View style={styles.statsRow}>
            {[
              { label: "Drivers Nearby", value: "12" },
              { label: "Avg ETA", value: "4 min" },
            ].map(({ label, value }) => (
              <View key={label} style={[styles.stat, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>
        </GlassCard>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  card: {
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: "rgba(22,22,30,0.97)",
    alignItems: "center",
    gap: 12,
  },
  radarContainer: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  centerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  stat: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
});
