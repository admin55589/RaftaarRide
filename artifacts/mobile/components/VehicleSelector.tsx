import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useApp, VehicleType } from "@/context/AppContext";
import { calculateFare, getRideModeMultiplier, VEHICLE_PRICING, DEFAULT_DISTANCE_KM } from "@/lib/pricing";

const VEHICLES: { type: VehicleType; timeMultiplier: number }[] = [
  { type: "bike",  timeMultiplier: 0.7 },
  { type: "auto",  timeMultiplier: 0.9 },
  { type: "prime", timeMultiplier: 1.0 },
  { type: "suv",   timeMultiplier: 1.1 },
];

function VehicleCard({ vehicle }: { vehicle: typeof VEHICLES[0] }) {
  const colors = useColors();
  const { selectedVehicle, setSelectedVehicle, estimatedTime, rideMode, estimatedDistanceKm } = useApp();
  const scale = useSharedValue(1);
  const isSelected = selectedVehicle === vehicle.type;

  const vehicleColor =
    vehicle.type === "bike" ? colors.bikeColor :
    vehicle.type === "auto" ? colors.autoColor :
    vehicle.type === "suv" ? "#9333ea" : colors.cabColor;

  const distanceKm = estimatedDistanceKm ?? DEFAULT_DISTANCE_KM;
  const fare = calculateFare(vehicle.type, distanceKm, 0, getRideModeMultiplier(rideMode));
  const time = Math.round(estimatedTime * vehicle.timeMultiplier);
  const vp = VEHICLE_PRICING[vehicle.type];

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 20 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
        onPress={() => setSelectedVehicle(vehicle.type)}
        style={[
          styles.card,
          {
            backgroundColor: isSelected ? vehicleColor + "22" : colors.secondary,
            borderColor: isSelected ? vehicleColor : colors.border,
          },
        ]}
      >
        <View style={[styles.iconBg, { backgroundColor: vehicleColor + "20" }]}>
          <Text style={styles.vehicleEmoji}>{vp.emoji}</Text>
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>{vp.label}</Text>
        <Text style={[styles.price, { color: vehicleColor }]}>₹{fare.total}</Text>
        {fare.savingsPct > 0 && (
          <Text style={styles.savings}>↓{fare.savingsPct}% sasta</Text>
        )}
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{time} min</Text>
      </Pressable>
    </Animated.View>
  );
}

export function VehicleSelector() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {VEHICLES.map((v) => (
        <VehicleCard key={v.type} vehicle={v} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    width: 100,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  iconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleEmoji: {
    fontSize: 26,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  savings: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: "#22c55e",
  },
  price: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  time: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
