import React, { useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

const { width } = Dimensions.get("window");

interface MapViewProps {
  showRadar?: boolean;
  showRoute?: boolean;
  routeProgress?: number;
}

function PulseCircle({ delay, size }: { delay: number; size: number }) {
  const colors = useColors();
  const opacity = useSharedValue(0.7);
  const scale = useSharedValue(0.3);

  useEffect(() => {
    const timeout = setTimeout(() => {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 2000, easing: Easing.out(Easing.quad) })
        ),
        -1,
        false
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) })
        ),
        -1,
        false
      );
    }, delay);
    return () => clearTimeout(timeout);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
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
        animStyle,
      ]}
    />
  );
}

function CarDot() {
  const colors = useColors();
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 2000 }),
        withTiming(-20, { duration: 1500 }),
        withTiming(20, { duration: 1800 }),
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.primary,
          shadowOpacity: 0.6,
          shadowRadius: 12,
          elevation: 8,
        },
        animStyle,
      ]}
    >
      <Text style={{ fontSize: 16 }}>🚗</Text>
    </Animated.View>
  );
}

export function MapView({ showRadar = false, showRoute = false, routeProgress = 0 }: MapViewProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={`h-${i}`}
            style={[styles.hLine, { borderColor: colors.border, top: `${(i + 1) * 14}%` as any }]}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={`v-${i}`}
            style={[styles.vLine, { borderColor: colors.border, left: `${(i + 1) * 12}%` as any }]}
          />
        ))}
      </View>

      <View style={styles.center}>
        {showRadar && (
          <>
            <PulseCircle delay={0} size={80} />
            <PulseCircle delay={666} size={140} />
            <PulseCircle delay={1333} size={200} />
            <View
              style={[
                styles.centerDot,
                { backgroundColor: colors.primary },
              ]}
            />
          </>
        )}

        {showRoute && (
          <View style={styles.routeContainer}>
            <CarDot />
            <View style={[styles.routeLine, { backgroundColor: colors.primary }]}>
              <View
                style={[
                  styles.routeProgress,
                  {
                    width: `${routeProgress * 100}%`,
                    backgroundColor: colors.success,
                  },
                ]}
              />
            </View>
            <View
              style={[
                styles.destinationDot,
                { borderColor: colors.primary, backgroundColor: colors.card },
              ]}
            />
          </View>
        )}

        {!showRadar && !showRoute && (
          <View style={[styles.locationPin, { backgroundColor: colors.primary }]}>
            <View style={[styles.pinInner, { backgroundColor: colors.primaryForeground }]} />
          </View>
        )}
      </View>

      <View style={[styles.streetLabel, { top: "20%", left: "10%" }]}>
        <Text style={[styles.streetText, { color: colors.mutedForeground }]}>MG Road</Text>
      </View>
      <View style={[styles.streetLabel, { top: "55%", right: "12%" }]}>
        <Text style={[styles.streetText, { color: colors.mutedForeground }]}>Ring Road</Text>
      </View>
      <View style={[styles.streetLabel, { bottom: "25%", left: "20%" }]}>
        <Text style={[styles.streetText, { color: colors.mutedForeground }]}>NH-48</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
  },
  hLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
  },
  vLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  centerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  locationPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeLine: {
    width: 120,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    opacity: 0.4,
  },
  routeProgress: {
    height: "100%",
    borderRadius: 2,
  },
  destinationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  streetLabel: {
    position: "absolute",
  },
  streetText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
