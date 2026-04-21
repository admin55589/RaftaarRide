import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { ridesApi } from "@/lib/ridesApi";
import { calculateFare, getRideModeMultiplier, DEFAULT_DISTANCE_KM } from "@/lib/pricing";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RazorpayWebView } from "@/components/RazorpayWebView";
import { useVoiceAI } from "@/hooks/useVoiceAI";
import { paymentApi, type RazorpayOrder } from "@/lib/paymentApi";
import { BASE_URL } from "@/lib/api";

const PAYMENT_OPTIONS = [
  { key: "UPI",             icon: "📲", label: "UPI",                sub: "PhonePe, GPay, Paytm" },
  { key: "Card",            icon: "💳", label: "Card",               sub: "Credit / Debit card" },
  { key: "RaftaarWallet",   icon: "👛", label: "RaftaarRide Wallet", sub: "Instant deduction" },
  { key: "Cash",            icon: "💵", label: "Cash",               sub: "Pay driver directly" },
];

function SuccessTick() {
  const scale = useSharedValue(0);
  const checkScale = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 10, stiffness: 200 });
    checkScale.value = withDelay(200, withSpring(1, { damping: 8, stiffness: 250 }));
  }, []);
  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  return (
    <Animated.View style={[s.successCircle, circleStyle]}>
      <Animated.View style={checkStyle}>
        <Text style={s.checkText}>✓</Text>
      </Animated.View>
    </Animated.View>
  );
}

function StarRating({
  rideId, driverId, token,
}: { rideId: number | null; driverId: string | null; token: string | null }) {
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRate = async (stars: number) => {
    if (submitted || submitting) return;
    setRating(stars);
    if (!rideId || !token) return;
    setSubmitting(true);
    try {
      await fetch(`${BASE_URL}rides/${rideId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: stars }),
      });
      setSubmitted(true);
    } catch { /* silent */ }
    finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <View style={s.ratingDone}>
        <Text style={s.ratingDoneText}>⭐ Shukriya! Rating submit ho gayi</Text>
      </View>
    );
  }

  return (
    <View style={s.stars}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Pressable key={i} onPress={() => handleRate(i + 1)} disabled={submitting}>
          <Text style={[s.starText, { opacity: i < rating ? 1 : 0.32 }]}>⭐</Text>
        </Pressable>
      ))}
      {submitting && <ActivityIndicator size="small" color="#F5A623" style={{ marginLeft: 8 }} />}
    </View>
  );
}

export function PaymentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, user: authUser } = useAuth();
  const {
    setScreen, selectedVehicle, rideMode, estimatedTime, estimatedDistanceKm,
    paymentMethod, assignedDriver, destination, pickup,
    addRideToHistory, refreshHistoryFromServer, currentRideId, setCurrentRideId,
  } = useApp();

  const [paid, setPaid] = useState(false);
  const [completedRideId, setCompletedRideId] = useState<number | null>(null);
  const [completedDriverId, setCompletedDriverId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [razorpayOrder, setRazorpayOrder] = useState<RazorpayOrder | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>(paymentMethod ?? "UPI");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const { announcePaymentSuccess } = useVoiceAI();

  const distanceKm = estimatedDistanceKm ?? DEFAULT_DISTANCE_KM;
  const fare = calculateFare(selectedVehicle, distanceKm, 0, getRideModeMultiplier(rideMode));
  const price = fare.total;
  const duration = Math.round(estimatedTime * (selectedVehicle === "bike" ? 0.7 : selectedVehicle === "auto" ? 0.9 : 1));

  useEffect(() => {
    if (!token) return;
    setWalletLoading(true);
    fetch(`${BASE_URL}wallet/balance`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { if (data.success) setWalletBalance(data.balance); })
      .catch(() => {})
      .finally(() => setWalletLoading(false));
  }, [token]);

  const completeRide = (paidAmount: number, method: string) => {
    setPaid(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    announcePaymentSuccess(paidAmount);
    const driver = assignedDriver ?? { name: "Raj Kumar", rating: 4.8, vehicle: "Swift Dzire", vehicleNumber: "DL 4C AB 1234", vehicleType: selectedVehicle, eta: 5, photo: "RK", id: "1" };
    /* Capture IDs for rating before they are cleared */
    setCompletedRideId(currentRideId);
    setCompletedDriverId(driver.id ?? null);
    addRideToHistory({
      id: currentRideId ? String(currentRideId) : Date.now().toString(),
      pickup, destination, vehicleType: selectedVehicle, rideMode, price: paidAmount,
      duration, distance: `${distanceKm} km`, date: new Date().toISOString(), driver, status: "completed",
    });
    if (token && currentRideId) {
      ridesApi.updateStatus(token, currentRideId, "completed")
        .then(() => { if (token) refreshHistoryFromServer(token); })
        .catch(() => {});
      setCurrentRideId(null);
    }
  };

  const handleWalletPay = async () => {
    if (walletBalance === null || walletBalance < price) {
      Alert.alert(
        "Insufficient Balance",
        `Aapke wallet mein ₹${walletBalance ?? 0} hain, lekin ₹${price} chahiye.\n\nWallet top-up karo ya dusra method chunein.`,
        [{ text: "OK" }]
      );
      return;
    }

    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await fetch(`${BASE_URL}wallet/spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: price, description: `Ride payment — ${pickup ?? ""} → ${destination ?? ""} — ₹${price}` }),
      });
      const data = await res.json();
      if (data.success) {
        setWalletBalance(data.newBalance);
        completeRide(price, "RaftaarRide Wallet");
      } else {
        Alert.alert("Payment Failed", data.error ?? "Wallet se payment nahi ho saki");
      }
    } catch {
      Alert.alert("Error", "Network error — dobara try karein");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePay = async () => {
    if (selectedMethod === "Cash") {
      setIsProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => { completeRide(price, "Cash"); setIsProcessing(false); }, 1000);
      return;
    }

    if (selectedMethod === "RaftaarWallet") {
      await handleWalletPay();
      return;
    }

    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const order = await paymentApi.createOrder(price);
      setRazorpayOrder(order);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Payment start nahi ho saka");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRazorpaySuccess = async (data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => {
    setRazorpayOrder(null);
    setIsProcessing(true);
    try {
      const result = await paymentApi.verifyPayment(data);
      if (result.success) {
        completeRide(price, selectedMethod);
      } else {
        Alert.alert("Verification Failed", "Payment verify nahi hua.");
      }
    } catch {
      Alert.alert("Error", "Payment verification fail ho gayi");
    } finally {
      setIsProcessing(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const walletSufficient = walletBalance !== null && walletBalance >= price;

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: bottomPad + 24 }]} showsVerticalScrollIndicator={false}>
        {paid ? (
          <Animated.View entering={FadeIn.springify()} style={s.successContainer}>
            <SuccessTick />
            <Animated.Text entering={FadeInDown.delay(300).springify()} style={[s.successTitle, { color: colors.foreground }]}>
              Ride Complete!
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(400).springify()} style={[s.successSub, { color: colors.mutedForeground }]}>
              Hope you had a great ride 🎉
            </Animated.Text>

            <Animated.View entering={FadeInDown.delay(500).springify()} style={[s.receiptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { icon: "🏷️", label: "Amount Paid",    value: `₹${price}` },
                { icon: "🕐", label: "Duration",        value: `${duration} min` },
                { icon: "📍", label: "Distance",        value: `${distanceKm} km` },
                { icon: "💳", label: "Payment Method",  value: selectedMethod === "RaftaarWallet" ? "RaftaarRide Wallet 👛" : selectedMethod },
              ].map(({ icon, label, value }) => (
                <View key={label} style={[s.receiptRow, { borderColor: colors.border }]}>
                  <View style={s.receiptLabelRow}>
                    <Text style={s.receiptIcon}>{icon}</Text>
                    <Text style={[s.receiptLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  </View>
                  <Text style={[s.receiptValue, { color: colors.foreground }]}>{value}</Text>
                </View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(700).springify()} style={s.ratingContainer}>
              <Text style={[s.ratingTitle, { color: colors.foreground }]}>Rate your driver</Text>
              <StarRating rideId={completedRideId} driverId={completedDriverId} token={token} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(900).springify()} style={{ width: "100%" }}>
              <PrimaryButton label="Back to Home" onPress={() => setScreen("home")} />
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.springify()} style={s.payContainer}>
            <Text style={[s.pageTitle, { color: colors.foreground }]}>Payment</Text>

            {/* Fare breakdown */}
            <GlassCard style={s.amountCard} padding={24}>
              <Text style={[s.amountLabel, { color: colors.mutedForeground }]}>Total Fare</Text>
              <Text style={[s.amount, { color: colors.primary }]}>₹{price}</Text>
              <View style={[s.amountDivider, { backgroundColor: colors.border }]} />
              <View style={s.amountDetails}>
                {[
                  { icon: "🏷️", label: "Base Fare",       value: Math.round(price * 0.7) },
                  { icon: "📍", label: "Distance",         value: Math.round(price * 0.25) },
                  { icon: "%",  label: "Convenience Fee",  value: Math.round(price * 0.05) },
                ].map(({ icon, label, value }) => (
                  <View key={label} style={s.amountRow}>
                    <View style={s.amountLabelRow}>
                      <Text style={s.amountIcon}>{icon}</Text>
                      <Text style={[s.amountDetailLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    </View>
                    <Text style={[s.amountDetailValue, { color: colors.foreground }]}>₹{value}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            {/* Payment method selection */}
            <View style={s.methodSection}>
              <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>PAYMENT METHOD CHUNEIN</Text>

              {PAYMENT_OPTIONS.map((opt) => {
                const isSelected = selectedMethod === opt.key;
                const isWallet = opt.key === "RaftaarWallet";

                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => { Haptics.selectionAsync(); setSelectedMethod(opt.key); }}
                    activeOpacity={0.8}
                    style={[
                      s.methodCard,
                      {
                        backgroundColor: isSelected ? colors.primary + "14" : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={[s.methodIcon, { backgroundColor: isSelected ? colors.primary + "20" : "rgba(255,255,255,0.06)" }]}>
                      <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.methodName, { color: colors.foreground }]}>{opt.label}</Text>
                      <Text style={[s.methodSub, { color: colors.mutedForeground }]}>
                        {isWallet
                          ? walletLoading
                            ? "Loading..."
                            : walletBalance !== null
                              ? `Balance: ₹${walletBalance.toFixed(2)}${walletSufficient ? " ✅" : " ❌ Low balance"}`
                              : opt.sub
                          : opt.sub}
                      </Text>
                    </View>
                    <View style={[s.radioOuter, { borderColor: isSelected ? colors.primary : colors.border }]}>
                      {isSelected && <View style={[s.radioInner, { backgroundColor: colors.primary }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Wallet insufficient warning */}
            {selectedMethod === "RaftaarWallet" && walletBalance !== null && !walletSufficient && (
              <Animated.View entering={FadeInDown.duration(300)} style={[s.warnBox, { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }]}>
                <Text style={{ color: "#F87171", fontSize: 13, fontFamily: "Inter_500Medium" }}>
                  ⚠️ Aapke wallet mein ₹{(walletBalance ?? 0).toFixed(2)} hain — ₹{price} ke liye {Math.ceil(price - (walletBalance ?? 0))} aur chahiye.{" "}
                  Wallet tab se top-up karein.
                </Text>
              </Animated.View>
            )}

            {/* Wallet sufficient info */}
            {selectedMethod === "RaftaarWallet" && walletSufficient && (
              <Animated.View entering={FadeInDown.duration(300)} style={[s.warnBox, { backgroundColor: "rgba(74,222,128,0.08)", borderColor: "rgba(74,222,128,0.25)" }]}>
                <Text style={{ color: "#4ADE80", fontSize: 13, fontFamily: "Inter_500Medium" }}>
                  ✅ ₹{price} wallet se deduct hoga. Baad mein balance: ₹{(walletBalance - price).toFixed(2)}
                </Text>
              </Animated.View>
            )}

            <PrimaryButton
              label={
                isProcessing
                  ? "Processing..."
                  : selectedMethod === "RaftaarWallet"
                    ? `👛 Wallet se Pay ₹${price}`
                    : selectedMethod === "Cash"
                      ? `💵 Cash se Pay ₹${price}`
                      : `Pay ₹${price} →`
              }
              onPress={handlePay}
              loading={isProcessing}
              disabled={isProcessing || (selectedMethod === "RaftaarWallet" && !walletSufficient)}
            />

            <Pressable onPress={() => setScreen("live_tracking")} style={s.backRow}>
              <Text style={[s.back, { color: colors.mutedForeground }]}>← Back</Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {razorpayOrder && (
        <RazorpayWebView
          visible
          order={razorpayOrder}
          userInfo={{ name: authUser?.name || "RaftaarRide User" }}
          onSuccess={handleRazorpaySuccess}
          onDismiss={() => setRazorpayOrder(null)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, alignItems: "center", gap: 20 },
  payContainer: { width: "100%", gap: 20 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 28 },
  amountCard: { width: "100%", borderRadius: 24, alignItems: "center" },
  amountLabel: { fontFamily: "Inter_400Regular", fontSize: 14 },
  amount: { fontFamily: "Inter_700Bold", fontSize: 52, marginVertical: 4 },
  amountDivider: { width: "100%", height: 1, marginVertical: 12 },
  amountDetails: { width: "100%", gap: 8 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  amountDetailLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  amountDetailValue: { fontFamily: "Inter_500Medium", fontSize: 13 },
  amountIcon: { fontSize: 12, lineHeight: 16, width: 16, textAlign: "center" },

  methodSection: { width: "100%", gap: 10 },
  sectionTitle: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.8 },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
  },
  methodIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  methodName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  methodSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 11, height: 11, borderRadius: 6 },

  warnBox: { width: "100%", borderRadius: 12, padding: 14, borderWidth: 1 },

  backRow: { alignItems: "center", paddingVertical: 4 },
  back: { fontFamily: "Inter_500Medium", fontSize: 14 },

  successContainer: { width: "100%", alignItems: "center", gap: 20, paddingTop: 20 },
  successCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center", shadowColor: "#22C55E", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 12 },
  checkText: { fontSize: 52, color: "#FFFFFF", fontWeight: "bold", lineHeight: 60, textAlign: "center" },
  successTitle: { fontFamily: "Inter_700Bold", fontSize: 32, textAlign: "center" },
  successSub: { fontFamily: "Inter_400Regular", fontSize: 16, textAlign: "center" },
  receiptCard: { width: "100%", borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  receiptLabelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  receiptIcon: { fontSize: 13, lineHeight: 18 },
  receiptLabel: { fontFamily: "Inter_400Regular", fontSize: 14 },
  receiptValue: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  ratingContainer: { alignItems: "center", gap: 12 },
  ratingTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18 },
  stars: { flexDirection: "row", gap: 4, alignItems: "center" },
  starText: { fontSize: 36 },
  ratingDone: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "rgba(74,222,128,0.12)", borderRadius: 12, borderWidth: 1, borderColor: "#4ADE80" },
  ratingDoneText: { color: "#4ADE80", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
