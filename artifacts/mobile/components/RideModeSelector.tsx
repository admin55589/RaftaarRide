import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useApp, RideMode } from "@/context/AppContext";

const MODES = [
  { mode: "economy" as RideMode, label: "Economy", icon: "leaf", colorKey: "autoColor" },
  { mode: "fast" as RideMode, label: "Fast", icon: "zap", colorKey: "primary" },
  { mode: "premium" as RideMode, label: "Premium", icon: "star", colorKey: "destructive" },
];

function ModeChip({ item }: { item: typeof MODES[0] }) {
  const colors = useColors();
  const { rideMode, setRideMode } = useApp();
  const scale = useSharedValue(1);
  const isSelected = rideMode === item.mode;
  const modeColor = (colors as any)[item.colorKey] as string;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animStyle, { flex: 1 }]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.93, { damping: 20 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
        onPress={() => setRideMode(item.mode)}
        style={[
          styles.chip,
          {
            backgroundColor: isSelected ? modeColor + "22" : colors.secondary,
            borderColor: isSelected ? modeColor : colors.border,
          },
        ]}
      >
        <Text style={[styles.chipLabel, { color: isSelected ? modeColor : colors.mutedForeground }]}>
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function RideModeSelector() {
  const colors = useColors();

  return (
    <View style={styles.container}>
      {MODES.map((m) => (
        <ModeChip key={m.mode} item={m} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
  },
  chip: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: "center",
  },
  chipLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
