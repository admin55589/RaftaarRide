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
import { useAuth } from "@/context/AuthContext";
import { calculateFare, getRideModeMultiplier, DEFAULT_DISTANCE_KM, getSurgeInfo } from "@/lib/pricing";
import { ridesApi } from "@/lib/ridesApi";
import { GlassCard } from "@/components/GlassCard";
import { VehicleSelector } from "@/components/VehicleSelector";
import { RideModeSelector } from "@/components/RideModeSelector";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MapView } from "@/components/MapView";

export function BookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const {
    setScreen,
    destination,
    pickup,
    pickupCoords,
    dropCoords,
    selectedVehicle,
    rideMode,
    estimatedTime,
    setAssignedDriver,
    paymentMethod,
    setPaymentMethod,
    estimatedDistanceKm,
    setCurrentRideId,
  } = useApp();

  const surgeInfo = getSurgeInfo();
  const distanceKm = estimatedDistanceKm ?? DEFAULT_DISTANCE_KM;
  const fare = calculateFare(selectedVehicle, distanceKm, 0, getRideModeMultiplier(rideMode) * surgeInfo.multiplier);
  const price = fare.total;
  const timeMultiplier = selectedVehicle === "bike" ? 0.7 : selectedVehicle === "auto" ? 0.9 : 1;
  const duration = Math.round(estimatedTime * timeMultiplier);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const handleBookRide = useCallback(async () => {
    const driver = MOCK_DRIVERS.find((d) => d.vehicleType === selectedVehicle) ?? MOCK_DRIVERS[2];
    setAssignedDriver(driver);
    setScreen("searching");

    if (token) {
      try {
        const result = await ridesApi.createRide(token, {
          pickup: {
            lat: pickupCoords?.lat ?? 28.6328,
            lng: pickupCoords?.lng ?? 77.2197,
            address: pickup,
          },
          drop: {
            lat: dropCoords?.lat ?? 28.7041,
            lng: dropCoords?.lng ?? 77.1025,
            address: destination,
          },
          vehicleType: selectedVehicle,
          rideMode,
          price,
          distanceKm,
        });
        setCurrentRideId(result.rideId);
      } catch (err) {
        console.warn("[booking] ride save failed:", err);
      }
    }
  }, [selectedVehicle, token, pickup, destination, pickupCoords, dropCoords, rideMode, price, distanceKm]);

  const PAYMENT_METHODS = [
    { label: "UPI", icon: "📱" },
    { label: "Cash", icon: "💵" },
    { label: "Card", icon: "💳" },
    { label: "Wallet", icon: "👛" },
  ];

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
                {PAYMENT_METHODS.map(({ label, icon }) => (
                  <Pressable
                    key={label}
                    onPress={() => setPaymentMethod(label)}
                    style={[
                      styles.paymentChip,
                      {
                        backgroundColor: paymentMethod === label ? colors.primary + "22" : colors.secondary,
                        borderColor: paymentMethod === label ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.paymentIcon}>{icon}</Text>
                    <Text
                      style={[
                        styles.paymentLabel,
                        { color: paymentMethod === label ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {surgeInfo.isActive && (
              <View style={[styles.surgeBanner, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b55" }]}>
                <Text style={{ fontSize: 14 }}>⚡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.surgeTitle, { color: "#f59e0b" }]}>Surge Pricing — {surgeInfo.label}</Text>
                  <Text style={[styles.surgeSubtitle, { color: "#f59e0b99" }]}>{surgeInfo.reason}</Text>
                </View>
              </View>
            )}

            <View style={[styles.priceSummary, { borderColor: colors.border }]}>
              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Feather name="tag" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>RaftaarRide Fare</Text>
                </View>
                <Text style={[styles.priceValue, { color: colors.primary }]}>₹{price}</Text>
              </View>
              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Feather name="trending-down" size={13} color="#22c55e" />
                  <Text style={[styles.priceLabel, { color: "#22c55e" }]}>Sabse sasta</Text>
                </View>
                <Text style={[styles.priceValue, { color: "#22c55e" }]}>
                  ₹{fare.savings} ({fare.savingsPct}%)
                </Text>
              </View>
              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Feather name="clock" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Duration</Text>
                </View>
                <Text style={[styles.priceValue, { color: colors.foreground }]}>{duration} min</Text>
              </View>
              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Feather name="map-pin" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Distance</Text>
                </View>
                <Text style={[styles.priceValue, { color: colors.foreground }]}>~{distanceKm} km</Text>
              </View>
              <View style={[styles.priceRow, { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
                <View style={styles.priceLabelRow}>
                  <Text style={{ fontSize: 11 }}>⏱️</Text>
                  <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Waiting charge</Text>
                </View>
                <Text style={[styles.priceValue, { color: colors.mutedForeground }]}>₹0.5/min</Text>
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
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  paymentIcon: {
    fontSize: 15,
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
    alignItems: "center",
  },
  priceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  surgeBanner: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  surgeTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  surgeSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
});
