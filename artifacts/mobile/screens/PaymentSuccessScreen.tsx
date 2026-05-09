import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BASE_URL } from "@/lib/api";
import { downloadReceipt } from "@/lib/generateReceipt";

function SuccessBurst() {
  const scale = useSharedValue(0);
  const ring1 = useSharedValue(0.8);
  const ring1Opacity = useSharedValue(0.6);
  const ring2 = useSharedValue(0.6);
  const ring2Opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 180 });
    ring1.value = withDelay(200, withRepeat(withSequence(withTiming(1.5, { duration: 1200 }), withTiming(0.8, { duration: 0 })), -1, false));
    ring1Opacity.value = withDelay(200, withRepeat(withSequence(withTiming(0, { duration: 1200 }), withTiming(0.6, { duration: 0 })), -1, false));
    ring2.value = withDelay(400, withRepeat(withSequence(withTiming(2.0, { duration: 1400 }), withTiming(0.6, { duration: 0 })), -1, false));
    ring2Opacity.value = withDelay(400, withRepeat(withSequence(withTiming(0, { duration: 1400 }), withTiming(0.4, { duration: 0 })), -1, false));
  }, []);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ring1Style = useAnimatedStyle(() => ({ transform: [{ scale: ring1.value }], opacity: ring1Opacity.value }));
  const ring2Style = useAnimatedStyle(() => ({ transform: [{ scale: ring2.value }], opacity: ring2Opacity.value }));

  return (
    <View style={s.burstContainer}>
      <Animated.View style={[s.ring, ring2Style, { borderColor: "rgba(34,197,94,0.25)" }]} />
      <Animated.View style={[s.ring, ring1Style, { borderColor: "rgba(34,197,94,0.45)" }]} />
      <Animated.View style={[s.successCircle, circleStyle]}>
        <Text style={s.checkEmoji}>✓</Text>
      </Animated.View>
    </View>
  );
}

function StarRating({
  rideId,
  driverId,
  token,
}: {
  rideId: number | null;
  driverId: string | null;
  token: string | null;
}) {
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = async (stars: number) => {
    setRating(stars);
    if (!rideId || !token || submitted) return;
    setSubmitting(true);
    try {
      await fetch(`${BASE_URL}rides/${rideId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: stars }),
      });
      setSubmitted(true);
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Text style={s.ratingDone}>Shukriya! Aapki rating submit ho gayi 🙏</Text>
    );
  }

  return (
    <View style={s.stars}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Pressable key={i} onPress={() => handleRate(i + 1)} disabled={submitting}>
          <Text style={[s.starText, { opacity: i < rating ? 1 : 0.28 }]}>⭐</Text>
        </Pressable>
      ))}
      {submitting && <ActivityIndicator size="small" color="#F5A623" style={{ marginLeft: 8 }} />}
    </View>
  );
}

export function PaymentSuccessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const {
    setScreen,
    pickup,
    destination,
    selectedVehicle,
    estimatedDistanceKm,
    estimatedTime,
    assignedDriver,
    fareBreakdown,
    finalPaymentPrice,
    lastCompletedRideId,
    lastCompletedDriverId,
    lastPaymentMethod,
    setAssignedDriver,
    setFinalPaymentPrice,
    setFareBreakdown,
  } = useApp();

  const [receiptLoading, setReceiptLoading] = useState(false);

  const price = finalPaymentPrice > 0 ? finalPaymentPrice : 0;
  const duration = Math.round(estimatedTime * (selectedVehicle === "bike" ? 0.7 : selectedVehicle === "auto" ? 0.9 : 1));
  const distanceKm = fareBreakdown?.distanceKm ?? estimatedDistanceKm ?? 0;

  const confetti = useSharedValue(0);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    confetti.value = withTiming(1, { duration: 800 });
  }, []);

  const handleGoHome = () => {
    setAssignedDriver(null);
    setFinalPaymentPrice(0);
    setFareBreakdown(null);
    setScreen("home");
  };

  const handleDownloadReceipt = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReceiptLoading(true);
    try {
      await downloadReceipt({
        rideId: lastCompletedRideId,
        dateTime: new Date(),
        pickup: pickup ?? "—",
        destination: destination ?? "—",
        distanceKm: distanceKm as number,
        durationMin: duration,
        vehicleType: selectedVehicle ?? "prime",
        paymentMethod: lastPaymentMethod,
        baseFare: fareBreakdown?.rideFare ?? price,
        platformFee: fareBreakdown?.platformFee ?? 0,
        distanceCharge: fareBreakdown?.distanceCharge ?? 0,
        waitingCharge: fareBreakdown?.waitingCharge ?? 0,
        promoDiscount: fareBreakdown?.promoDiscount ?? 0,
        promoCode: fareBreakdown?.promoCode ?? "",
        totalPaid: price,
        driverName: assignedDriver?.name ?? "",
        driverVehicle: assignedDriver?.vehicle ?? "",
        driverVehicleNumber: assignedDriver?.vehicleNumber ?? "",
        driverRating: assignedDriver?.rating ?? 0,
      });
    } finally {
      setReceiptLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const methodLabel =
    lastPaymentMethod === "RaftaarWallet"
      ? "RaftaarRide Wallet 👛"
      : lastPaymentMethod === "Cash"
      ? "💵 Cash"
      : lastPaymentMethod;

  return (
    <LinearGradient
      colors={["#0f1117", "#0a1a0f", "#0f1117"]}
      style={[s.container, { paddingTop: topPad }]}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)} style={s.heroSection}>
          <SuccessBurst />

          <Animated.Text
            entering={FadeInDown.delay(300).springify()}
            style={[s.title, { color: colors.foreground }]}
          >
            Ride Complete!
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(420).springify()}
            style={[s.subtitle, { color: colors.mutedForeground }]}
          >
            Aapki ride successfully complete ho gayi 🎉
          </Animated.Text>
        </Animated.View>

        {lastPaymentMethod === "Cash" && (
          <Animated.View
            entering={FadeInDown.delay(480).springify()}
            style={[s.cashBanner, { borderColor: "rgba(34,197,94,0.3)" }]}
          >
            <Text style={s.cashBannerTitle}>💵 Cash Payment Confirmed</Text>
            <Text style={s.cashBannerBody}>
              Aapne ₹{price} driver ko seedha diye hain. Yeh digital receipt aapka proof hai.
            </Text>
            <Text style={s.cashBannerId}>
              Proof ID: RR-{lastCompletedRideId ?? Date.now().toString().slice(-8)} · {new Date().toLocaleString("en-IN")}
            </Text>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(540).springify()}>
          <GlassCard style={s.receiptCard} padding={20}>
            <View style={s.receiptHeader}>
              <Text style={[s.receiptHeaderTitle, { color: colors.foreground }]}>🧾 Receipt</Text>
              {lastCompletedRideId && (
                <Text style={[s.receiptId, { color: colors.mutedForeground }]}>
                  #{lastCompletedRideId}
                </Text>
              )}
            </View>

            {[
              { icon: "₹", label: "Amount Paid", value: `₹${price}` },
              { icon: "🕐", label: "Duration",    value: `${duration} min` },
              { icon: "📍", label: "Distance",    value: `${distanceKm.toFixed ? distanceKm.toFixed(1) : distanceKm} km` },
              { icon: "💳", label: "Payment",     value: methodLabel },
              ...(fareBreakdown?.promoCode && fareBreakdown.promoDiscount > 0
                ? [{ icon: "🎁", label: `Promo (${fareBreakdown.promoCode})`, value: `-₹${fareBreakdown.promoDiscount}` }]
                : []),
            ].map(({ icon, label, value }) => (
              <View key={label} style={[s.receiptRow, { borderColor: colors.border }]}>
                <View style={s.receiptLabelRow}>
                  <Text style={s.receiptIcon}>{icon}</Text>
                  <Text style={[s.receiptLabel, { color: colors.mutedForeground }]}>{label}</Text>
                </View>
                <Text style={[s.receiptValue, { color: label.startsWith("Promo") ? "#22c55e" : colors.foreground }]}>
                  {value}
                </Text>
              </View>
            ))}

            {pickup && destination && (
              <View style={[s.routeRow, { borderColor: colors.border, backgroundColor: colors.card + "55" }]}>
                <Text style={[s.routeText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  📍 {pickup}
                </Text>
                <Text style={[s.routeArrow, { color: colors.mutedForeground }]}>↓</Text>
                <Text style={[s.routeText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  🏁 {destination}
                </Text>
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {assignedDriver && (
          <Animated.View entering={FadeInDown.delay(640).springify()}>
            <GlassCard style={s.driverCard} padding={16}>
              <View style={s.driverRow}>
                <View style={[s.driverAvatar, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
                  <Text style={[s.driverAvatarText, { color: colors.primary }]}>{assignedDriver.photo}</Text>
                </View>
                <View style={s.driverInfo}>
                  <Text style={[s.driverName, { color: colors.foreground }]}>{assignedDriver.name}</Text>
                  <Text style={[s.driverSub, { color: colors.mutedForeground }]}>
                    {assignedDriver.vehicle} · {assignedDriver.vehicleNumber}
                  </Text>
                </View>
                <View style={[s.ratingPill, { backgroundColor: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.3)" }]}>
                  <Text style={s.ratingPillText}>⭐ {assignedDriver.rating}</Text>
                </View>
              </View>
            </GlassCard>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(760).springify()} style={s.ratingSection}>
          <Text style={[s.ratingTitle, { color: colors.foreground }]}>Driver ko rate karo</Text>
          <Text style={[s.ratingHint, { color: colors.mutedForeground }]}>Aapka feedback bahut important hai</Text>
          <StarRating
            rideId={lastCompletedRideId}
            driverId={lastCompletedDriverId}
            token={token}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(880).springify()} style={s.actionSection}>
          <PrimaryButton label="Ghar Wapis Jao 🏠" onPress={handleGoHome} />

          {/* Receipt Download */}
          <Pressable
            onPress={handleDownloadReceipt}
            disabled={receiptLoading}
            style={({ pressed }) => [
              s.receiptBtn,
              {
                borderColor: colors.primary + "66",
                backgroundColor: pressed
                  ? colors.primary + "18"
                  : colors.primary + "0D",
                opacity: receiptLoading ? 0.7 : 1,
              },
            ]}
          >
            {receiptLoading ? (
              <ActivityIndicator size="small" color="#F5A623" />
            ) : (
              <Text style={s.receiptBtnIcon}>📄</Text>
            )}
            <Text style={[s.receiptBtnText, { color: colors.primary }]}>
              {receiptLoading ? "Generating…" : "Receipt Download karo"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setScreen("home")}
            style={[s.historyBtn, { borderColor: colors.border }]}
          >
            <Text style={[s.historyBtnText, { color: colors.mutedForeground }]}>
              Ride History Dekho →
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 24, gap: 16 },

  heroSection: { alignItems: "center", paddingVertical: 8, gap: 12 },
  burstContainer: { width: 120, height: 120, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  ring: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#22c55e",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  checkEmoji: { fontSize: 36, color: "#fff", fontWeight: "900" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  cashBanner: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  cashBannerTitle: { color: "#4ADE80", fontFamily: "Inter_700Bold", fontSize: 14 },
  cashBannerBody: { color: "#86EFAC", fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  cashBannerId: { color: "#4ADE80", fontFamily: "Inter_600SemiBold", fontSize: 11, marginTop: 2 },

  receiptCard: { borderRadius: 20 },
  receiptHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  receiptHeaderTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  receiptId: { fontSize: 12, fontFamily: "Inter_400Regular" },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  receiptLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  receiptIcon: { fontSize: 14, width: 20, textAlign: "center" },
  receiptLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  receiptValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  routeRow: {
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  routeText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  routeArrow: { fontSize: 14, paddingLeft: 4 },

  driverCard: { borderRadius: 20 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  driverAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  driverSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  ratingPill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ratingPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#F5A623" },

  ratingSection: { alignItems: "center", gap: 6 },
  ratingTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ratingHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  stars: { flexDirection: "row", gap: 8, marginTop: 4 },
  starText: { fontSize: 30 },
  ratingDone: { color: "#86EFAC", fontFamily: "Inter_600SemiBold", fontSize: 13, textAlign: "center" },

  actionSection: { gap: 12, paddingTop: 8 },
  receiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 13,
  },
  receiptBtnIcon: { fontSize: 16 },
  receiptBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  historyBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  historyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
