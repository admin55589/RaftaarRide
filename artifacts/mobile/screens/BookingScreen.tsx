import React, { useCallback, useState, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeIn } from "react-native-reanimated";
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
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "https://workspaceapi-server-production-2e22.up.railway.app/api";
})();

interface PromoResult {
  code: string;
  discountPct: number;
  discountAmount: number;
  originalFare: number;
  finalFare: number;
  message: string;
}

export function BookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang, toggleLanguage } = useLanguage();
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
  const basePrice = fare.total;
  const timeMultiplier = selectedVehicle === "bike" ? 0.7 : selectedVehicle === "auto" ? 0.9 : 1;
  const duration = Math.round(estimatedTime * timeMultiplier);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  /* ---- Promo Code State ---- */
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoApplied, setPromoApplied] = useState<PromoResult | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoExpanded, setPromoExpanded] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const finalPrice = promoApplied ? promoApplied.finalFare : basePrice;

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) { setPromoError("Promo code daalo"); return; }
    if (!token) { setPromoError("Login karein pehle"); return; }

    setPromoLoading(true);
    setPromoError("");
    Keyboard.dismiss();

    try {
      const res = await fetch(`${BASE_URL}/promo/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, fareAmount: basePrice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error || "Invalid promo code");
        setPromoApplied(null);
      } else {
        setPromoApplied(data as PromoResult);
        setPromoError("");
      }
    } catch {
      setPromoError("Network error. Dobara koshish karo.");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoApplied(null);
    setPromoInput("");
    setPromoError("");
  };

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
          price: finalPrice,
          distanceKm,
          promoCode: promoApplied?.code,
          discountAmount: promoApplied?.discountAmount,
          originalPrice: promoApplied ? basePrice : undefined,
        });
        setCurrentRideId(result.rideId);
      } catch (err) {
        console.warn("[booking] ride save failed:", err);
      }
    }
  }, [selectedVehicle, token, pickup, destination, pickupCoords, dropCoords, rideMode, finalPrice, distanceKm, promoApplied, basePrice]);

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
          <Text style={[styles.backArrow, { color: colors.foreground }]}>←</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={toggleLanguage}
        hitSlop={8}
        style={{ position: "absolute", top: topPad + 8, right: 16, zIndex: 100, width: 40, height: 40, borderRadius: 20, borderWidth: 1, backgroundColor: colors.primary + "22", borderColor: colors.primary + "66", alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{lang === "hi" ? "हिं" : "EN"}</Text>
      </Pressable>

      <Animated.View entering={FadeInUp.springify()} style={styles.sheet}>
        <GlassCard style={styles.card} padding={0}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <Animated.View entering={FadeInDown.springify()} style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={styles.routeIconCol}>
                <View style={[styles.routeIconBox, { backgroundColor: "rgba(245,166,35,0.2)" }]}>
                  <View style={[styles.routeCircleOuter, { borderColor: colors.primary }]}>
                    <View style={[styles.routeCircleInner, { backgroundColor: colors.primary }]} />
                  </View>
                </View>
              </View>
              <View style={styles.routeInfo}>
                <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>PICKUP</Text>
                <Text style={[styles.routeValue, { color: colors.foreground }]} numberOfLines={1}>
                  {pickup}
                </Text>
              </View>
            </View>
            <View style={styles.routeLineContainer}>
              <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.routeRow}>
              <View style={styles.routeIconCol}>
                <View style={[styles.routeIconBox, { backgroundColor: "rgba(34,197,94,0.2)" }]}>
                  <View style={[styles.routeSquare, { backgroundColor: "#22c55e", borderRadius: 3 }]} />
                  <View style={[styles.routePinTail, { backgroundColor: "#22c55e" }]} />
                </View>
              </View>
              <View style={styles.routeInfo}>
                <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>DESTINATION</Text>
                <Text style={[styles.routeValue, { color: colors.foreground }]} numberOfLines={1}>
                  {destination}
                </Text>
              </View>
              <Pressable onPress={() => setScreen("home")} style={styles.editBtn}>
                <View style={[styles.editIconBox, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <View style={[styles.editLine, { backgroundColor: colors.mutedForeground }]} />
                  <View style={[styles.editLine, { backgroundColor: colors.mutedForeground, width: 10 }]} />
                  <View style={[styles.editLine, { backgroundColor: colors.mutedForeground, width: 8 }]} />
                </View>
              </Pressable>
            </View>
          </Animated.View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}>
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

            {/* ---- PROMO CODE SECTION ---- */}
            <View style={styles.section}>
              <Pressable
                onPress={() => {
                  if (!promoApplied) {
                    setPromoExpanded((v) => !v);
                    if (!promoExpanded) setTimeout(() => inputRef.current?.focus(), 200);
                  }
                }}
                style={[
                  styles.promoToggle,
                  {
                    backgroundColor: promoApplied
                      ? "rgba(34,197,94,0.1)"
                      : colors.secondary,
                    borderColor: promoApplied ? "#22c55e" : promoExpanded ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 16 }}>{promoApplied ? "🎉" : "🏷️"}</Text>
                <View style={{ flex: 1 }}>
                  {promoApplied ? (
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#22c55e", fontFamily: "Inter_700Bold" }}>
                      {promoApplied.code} applied — {promoApplied.discountPct}% off!
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                      {lang === "hi" ? "Promo code hai? Lagao" : "Have a promo code?"}
                    </Text>
                  )}
                </View>
                {promoApplied ? (
                  <Pressable onPress={handleRemovePromo} hitSlop={8} style={{ padding: 4 }}>
                    <Text style={{ fontSize: 16, color: "#ef4444" }}>✕</Text>
                  </Pressable>
                ) : (
                  <Text style={{ fontSize: 14, color: colors.mutedForeground }}>{promoExpanded ? "▲" : "▼"}</Text>
                )}
              </Pressable>

              {promoExpanded && !promoApplied && (
                <Animated.View entering={FadeIn.duration(200)} style={styles.promoInputRow}>
                  <TextInput
                    ref={inputRef}
                    value={promoInput}
                    onChangeText={(t) => { setPromoInput(t.toUpperCase()); setPromoError(""); }}
                    placeholder={lang === "hi" ? "जैसे: SAVE20" : "e.g. SAVE20"}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleApplyPromo}
                    style={[
                      styles.promoInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.card,
                        borderColor: promoError ? "#ef4444" : colors.border,
                      },
                    ]}
                  />
                  <Pressable
                    onPress={handleApplyPromo}
                    disabled={promoLoading || !promoInput.trim()}
                    style={[
                      styles.promoApplyBtn,
                      {
                        backgroundColor: promoInput.trim() ? colors.primary : colors.secondary,
                        opacity: promoLoading ? 0.7 : 1,
                      },
                    ]}
                  >
                    {promoLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, fontFamily: "Inter_700Bold" }}>
                        {lang === "hi" ? "लगाओ" : "Apply"}
                      </Text>
                    )}
                  </Pressable>
                </Animated.View>
              )}

              {promoError ? (
                <Animated.View entering={FadeIn.duration(150)} style={styles.promoErrorRow}>
                  <Text style={{ fontSize: 12 }}>❌</Text>
                  <Text style={{ fontSize: 12, color: "#ef4444", fontFamily: "Inter_400Regular", flex: 1 }}>
                    {promoError}
                  </Text>
                </Animated.View>
              ) : null}
            </View>

            {surgeInfo.isActive && (
              <View style={[styles.surgeBanner, { backgroundColor: "rgba(245,158,11,0.13)", borderColor: "rgba(245,158,11,0.33)" }]}>
                <Text style={{ fontSize: 14 }}>⚡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.surgeTitle, { color: "#f59e0b" }]}>Surge Pricing — {surgeInfo.label}</Text>
                  <Text style={[styles.surgeSubtitle, { color: "rgba(245,158,11,0.6)" }]}>{surgeInfo.reason}</Text>
                </View>
              </View>
            )}

            <View style={[styles.priceSummary, { borderColor: colors.border }]}>
              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Text style={styles.priceIcon}>🏷️</Text>
                  <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>RaftaarRide Fare</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {promoApplied && (
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, textDecorationLine: "line-through", fontFamily: "Inter_400Regular" }}>
                      ₹{basePrice}
                    </Text>
                  )}
                  <Text style={[styles.priceValue, { color: promoApplied ? "#22c55e" : colors.primary }]}>
                    ₹{finalPrice}
                  </Text>
                </View>
              </View>

              {promoApplied && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.priceRow}>
                  <View style={styles.priceLabelRow}>
                    <Text style={styles.priceIcon}>🎁</Text>
                    <Text style={[styles.priceLabel, { color: "#22c55e" }]}>
                      Promo ({promoApplied.code})
                    </Text>
                  </View>
                  <Text style={[styles.priceValue, { color: "#22c55e" }]}>
                    -₹{promoApplied.discountAmount}
                  </Text>
                </Animated.View>
              )}

              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Text style={styles.priceIcon}>📉</Text>
                  <Text style={[styles.priceLabel, { color: "#22c55e" }]}>Sabse sasta</Text>
                </View>
                <Text style={[styles.priceValue, { color: "#22c55e" }]}>
                  ₹{fare.savings} ({fare.savingsPct}%)
                </Text>
              </View>
              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Text style={styles.priceIcon}>🕐</Text>
                  <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Duration</Text>
                </View>
                <Text style={[styles.priceValue, { color: colors.foreground }]}>{duration} min</Text>
              </View>
              <View style={styles.priceRow}>
                <View style={styles.priceLabelRow}>
                  <Text style={styles.priceIcon}>📍</Text>
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
              <PrimaryButton
                label={`Book ${selectedVehicle.charAt(0).toUpperCase() + selectedVehicle.slice(1)} — ₹${finalPrice}${promoApplied ? ` (Save ₹${promoApplied.discountAmount})` : ""}`}
                onPress={handleBookRide}
              />
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
    maxHeight: 560,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
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
  routeIconCol: {
    width: 32,
    alignItems: "center",
  },
  routeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  routeCircleOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  routeCircleInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  routeSquare: {
    width: 10,
    height: 10,
    marginBottom: 1,
  },
  routePinTail: {
    width: 2,
    height: 4,
    borderRadius: 1,
  },
  routeLineContainer: {
    paddingLeft: 15,
    marginVertical: 2,
  },
  routeLine: {
    width: 1,
    height: 14,
  },
  editBtn: {
    marginLeft: 4,
  },
  editIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 6,
  },
  editLine: {
    width: 12,
    height: 1.5,
    borderRadius: 1,
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
    gap: 8,
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
  promoToggle: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  promoInputRow: {
    marginHorizontal: 20,
    flexDirection: "row",
    gap: 8,
  },
  promoInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  promoApplyBtn: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  promoErrorRow: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  priceIcon: {
    fontSize: 13,
    lineHeight: 18,
  },
  backArrow: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "300",
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
