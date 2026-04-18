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

const VEHICLES = [
  {
    type: "bike" as VehicleType,
    label: "Bike",
    emoji: "🏍️",
    priceMultiplier: 0.6,
    timeMultiplier: 0.7,
    description: "Fastest option",
  },
  {
    type: "auto" as VehicleType,
    label: "Auto",
    emoji: "🛺",
    priceMultiplier: 0.85,
    timeMultiplier: 0.9,
    description: "Budget friendly",
  },
  {
    type: "cab" as VehicleType,
    label: "Cab",
    emoji: "🚗",
    priceMultiplier: 1,
    timeMultiplier: 1,
    description: "Comfortable ride",
  },
];

function VehicleCard({ vehicle }: { vehicle: typeof VEHICLES[0] }) {
  const colors = useColors();
  const { selectedVehicle, setSelectedVehicle, estimatedPrice, estimatedTime, rideMode } = useApp();
  const scale = useSharedValue(1);
  const isSelected = selectedVehicle === vehicle.type;

  const vehicleColor =
    vehicle.type === "bike"
      ? colors.bikeColor
      : vehicle.type === "auto"
      ? colors.autoColor
      : colors.cabColor;

  const rideModeMultiplier = rideMode === "economy" ? 1 : rideMode === "fast" ? 1.3 : 1.7;
  const price = Math.round(estimatedPrice * vehicle.priceMultiplier * rideModeMultiplier);
  const time = Math.round(estimatedTime * vehicle.timeMultiplier);

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
          <Text style={styles.vehicleEmoji}>{vehicle.emoji}</Text>
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>{vehicle.label}</Text>
        <Text style={[styles.price, { color: vehicleColor }]}>₹{price}</Text>
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
  price: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  time: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
