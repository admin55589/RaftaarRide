import React, { useCallback } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, MOCK_DRIVERS } from "@/context/AppContext";
import { GlassCard } from "@/components/GlassCard";
import { VehicleSelector } from "@/components/VehicleSelector";
import { RideModeSelector } from "@/components/RideModeSelector";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MapView } from "@/components/MapView";

export function BookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    setScreen,
    destination,
    pickup,
    selectedVehicle,
    rideMode,
    estimatedPrice,
    estimatedTime,
    setAssignedDriver,
    paymentMethod,
    setPaymentMethod,
  } = useApp();

  const rideModeMultiplier = rideMode === "economy" ? 1 : rideMode === "fast" ? 1.3 : 1.7;
  const vehicleMultiplier = selectedVehicle === "bike" ? 0.6 : selectedVehicle === "auto" ? 0.85 : 1;
  const price = Math.round(estimatedPrice * vehicleMultiplier * rideModeMultiplier);
  const duration = Math.round(estimatedTime * (selectedVehicle === "bike" ? 0.7 : selectedVehicle === "auto" ? 0.9 : 1));

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const handleBookRide = useCallback(() => {
    const driver = MOCK_DRIVERS.find((d) => d.vehicleType === selectedVehicle) ?? MOCK_DRIVERS[2];
    setAssignedDriver(driver);
    setScreen("searching");
  }, [selectedVehicle]);

  const PAYMENT_METHODS = ["UPI", "Cash", "Card", "Wallet"];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView />

      <View style={[styles.backBtn, { top: topPad + 8 }]}>
        <Pressable
          onPress={() => setScreen("home")}
          style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <Animated.View entering={FadeInUp.springify()} style={styles.sheet}>
        <GlassCard style={styles.card} padding={0}>
          <View style={styles.handle} />

          <Animated.View entering={FadeInDown.springify()} style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
              <View style={styles.routeInfo}>
                <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>Pickup</Text>
                <Text style={[styles.routeValue, { color: colors.foreground }]} numberOfLines={1}>
                  {pickup}
                </Text>
              </View>
            </View>
            <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
              <View style={styles.routeInfo}>
                <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>Destination</Text>
                <Text style={[styles.routeValue, { color: colors.foreground }]} numberOfLines={1}>
                  {destination}
                </Text>
              </View>
              <Pressable onPress={() => setScreen("home")}>
                <Feather name="edit-2" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </Animated.View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>RIDE TYPE</Text>
              <VehicleSelector />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MODE</Text>
              <RideModeSelector />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PAYMENT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paymentRow}>
                {PAYMENT_METHODS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPaymentMethod(m)}
                    style={[
                      styles.paymentChip,
                      {
                        backgroundColor: paymentMethod === m ? colors.primary + "22" : colors.secondary,
                        borderColor: paymentMethod === m ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentLabel,
                        { color: paymentMethod === m ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {m}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={[styles.priceSummary, { borderColor: colors.border }]}>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Estimated Fare</Text>
                <Text style={[styles.priceValue, { color: colors.primary }]}>₹{price}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Duration</Text>
                <Text style={[styles.priceValue, { color: colors.foreground }]}>{duration} min</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Distance</Text>
                <Text style={[styles.priceValue, { color: colors.foreground }]}>~8.2 km</Text>
              </View>
            </View>

            <View style={styles.bookBtnContainer}>
              <PrimaryButton label={`Book ${selectedVehicle.charAt(0).toUpperCase() + selectedVehicle.slice(1)} — ₹${price}`} onPress={handleBookRide} />
            </View>
          </ScrollView>
        </GlassCard>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    position: "absolute",
    left: 16,
    zIndex: 20,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "rgba(22,22,30,0.98)",
    borderColor: "rgba(255,255,255,0.1)",
    maxHeight: 540,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  routeCard: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 1,
    height: 16,
    marginLeft: 4.5,
  },
  routeInfo: {
    flex: 1,
  },
  routeLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  routeValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  section: {
    paddingTop: 12,
    gap: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.8,
    paddingHorizontal: 20,
  },
  paymentRow: {
    paddingHorizontal: 20,
    gap: 10,
  },
  paymentChip: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  paymentLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  priceSummary: {
    marginHorizontal: 20,
    marginTop: 16,
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 8,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  priceValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  bookBtnContainer: {
    padding: 20,
  },
});
