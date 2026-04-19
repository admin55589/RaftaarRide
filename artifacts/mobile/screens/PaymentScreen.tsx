import React, { useEffect, useState } from "react";
import {
  Alert,
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
  withSpring,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
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

function SuccessTick() {
  const scale = useSharedValue(0);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 10, stiffness: 200 });
    checkScale.value = withDelay(200, withSpring(1, { damping: 8, stiffness: 250 }));
  }, []);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <Animated.View style={[styles.successCircle, circleStyle]}>
      <Animated.View style={checkStyle}>
        <Text style={styles.checkText}>✓</Text>
      </Animated.View>
    </Animated.View>
  );
}

function StarRating() {
  const [rating, setRating] = useState(0);
  return (
    <View style={styles.stars}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Pressable key={i} onPress={() => setRating(i + 1)}>
          <Text style={[styles.starText, { opacity: i < rating ? 1 : 0.35 }]}>⭐</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PaymentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, user: authUser } = useAuth();
  const { setScreen, selectedVehicle, rideMode, estimatedTime, estimatedDistanceKm, paymentMethod, assignedDriver, destination, pickup, addRideToHistory, currentRideId, setCurrentRideId } = useApp();
  const [paid, setPaid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [razorpayOrder, setRazorpayOrder] = useState<RazorpayOrder | null>(null);
  const { announcePaymentSuccess } = useVoiceAI();

  const distanceKm = estimatedDistanceKm ?? DEFAULT_DISTANCE_KM;
  const fare = calculateFare(selectedVehicle, distanceKm, 0, getRideModeMultiplier(rideMode));
  const price = fare.total;
  const duration = Math.round(estimatedTime * (selectedVehicle === "bike" ? 0.7 : selectedVehicle === "auto" ? 0.9 : 1));

  const completeRide = (paidAmount: number) => {
    setPaid(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    announcePaymentSuccess(paidAmount);
    const driver = assignedDriver ?? { name: "Raj Kumar", rating: 4.8, vehicle: "Swift Dzire", vehicleNumber: "DL 4C AB 1234", vehicleType: selectedVehicle, eta: 5, photo: "RK", id: "1" };
    addRideToHistory({
      id: Date.now().toString(),
      pickup,
      destination,
      vehicleType: selectedVehicle,
      rideMode,
      price: paidAmount,
      duration,
      distance: `${distanceKm} km`,
      date: new Date().toISOString(),
      driver,
    });

    if (token && currentRideId) {
      ridesApi.updateStatus(token, currentRideId, "completed").catch((e) =>
        console.warn("[payment] status update failed:", e)
      );
      setCurrentRideId(null);
    }
  };

  const handlePay = async () => {
    if (paymentMethod === "Cash") {
      setIsProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => { completeRide(price); setIsProcessing(false); }, 1000);
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
        completeRide(price);
      } else {
        Alert.alert("Verification Failed", "Payment verify nahi hua. Support se contact karo.");
      }
    } catch {
      Alert.alert("Error", "Payment verification fail ho gayi");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHome = () => setScreen("home");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 24 }]} showsVerticalScrollIndicator={false}>
        {paid ? (
          <Animated.View entering={FadeIn.springify()} style={styles.successContainer}>
            <SuccessTick />
            <Animated.Text
              entering={FadeInDown.delay(300).springify()}
              style={[styles.successTitle, { color: colors.foreground }]}
            >
              Ride Complete!
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(400).springify()}
              style={[styles.successSub, { color: colors.mutedForeground }]}
            >
              Hope you had a great ride
            </Animated.Text>

            <Animated.View entering={FadeInDown.delay(500).springify()} style={[styles.receiptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { icon: "tag", label: "Amount Paid", value: `₹${price}` },
                { icon: "clock", label: "Duration", value: `${duration} min` },
                { icon: "map-pin", label: "Distance", value: "8.2 km" },
                { icon: "credit-card", label: "Payment", value: paymentMethod },
              ].map(({ icon, label, value }) => (
                <View key={label} style={[styles.receiptRow, { borderColor: colors.border }]}>
                  <View style={styles.receiptLabelRow}>
                    <Feather name={icon as any} size={13} color={colors.mutedForeground} />
                    <Text style={[styles.receiptLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  </View>
                  <Text style={[styles.receiptValue, { color: colors.foreground }]}>{value}</Text>
                </View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(700).springify()} style={styles.ratingContainer}>
              <Text style={[styles.ratingTitle, { color: colors.foreground }]}>Rate your driver</Text>
              <StarRating />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(900).springify()} style={{ width: "100%" }}>
              <PrimaryButton label="Back to Home" onPress={handleHome} />
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.springify()} style={styles.payContainer}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>Payment</Text>

            <GlassCard style={styles.amountCard} padding={24}>
              <Text style={[styles.amountLabel, { color: colors.mutedForeground }]}>Total Fare</Text>
              <Text style={[styles.amount, { color: colors.primary }]}>₹{price}</Text>
              <View style={[styles.amountDivider, { backgroundColor: colors.border }]} />
              <View style={styles.amountDetails}>
                {[
                  { icon: "tag", label: "Base Fare", value: Math.round(price * 0.7) },
                  { icon: "map-pin", label: "Distance", value: Math.round(price * 0.25) },
                  { icon: "percent", label: "Convenience Fee", value: Math.round(price * 0.05) },
                ].map(({ icon, label, value }) => (
                  <View key={label} style={styles.amountRow}>
                    <View style={styles.amountLabelRow}>
                      <Feather name={icon as any} size={12} color={colors.mutedForeground} />
                      <Text style={[styles.amountDetailLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    </View>
                    <Text style={[styles.amountDetailValue, { color: colors.foreground }]}>₹{value}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            <View style={styles.methodSection}>
              <Text style={[styles.methodTitle, { color: colors.mutedForeground }]}>PAYMENT METHOD</Text>
              <GlassCard style={styles.methodCard} padding={16}>
                <View style={styles.methodRow}>
                  <View style={[styles.methodIcon, { backgroundColor: colors.primary + "22" }]}>
                    <Feather name="credit-card" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={[styles.methodName, { color: colors.foreground }]}>{paymentMethod}</Text>
                    <Text style={[styles.methodSub, { color: colors.mutedForeground }]}>
                      {paymentMethod === "UPI" ? "Linked account" : paymentMethod === "Cash" ? "Pay to driver" : "Saved card"}
                    </Text>
                  </View>
                  <Feather name="check-circle" size={20} color={colors.primary} />
                </View>
              </GlassCard>
            </View>

            <PrimaryButton
              label={isProcessing ? "Processing..." : `Pay ₹${price}`}
              onPress={handlePay}
              loading={isProcessing}
            />

            <Pressable onPress={() => setScreen("live_tracking")}>
              <Text style={[styles.back, { color: colors.mutedForeground }]}>Back</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: 20,
    alignItems: "center",
    gap: 20,
  },
  payContainer: {
    width: "100%",
    gap: 20,
  },
  pageTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  amountCard: {
    width: "100%",
    borderRadius: 24,
    alignItems: "center",
  },
  amountLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  amount: {
    fontFamily: "Inter_700Bold",
    fontSize: 52,
    marginVertical: 4,
  },
  amountDivider: {
    width: "100%",
    height: 1,
    marginVertical: 12,
  },
  amountDetails: {
    width: "100%",
    gap: 8,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  amountDetailLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  amountDetailValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  methodSection: {
    width: "100%",
    gap: 8,
  },
  methodTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  methodCard: {
    width: "100%",
    borderRadius: 16,
  },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  methodInfo: { flex: 1 },
  methodName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  methodSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
  },
  back: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textDecorationLine: "underline",
    marginTop: 4,
  },
  successContainer: {
    width: "100%",
    alignItems: "center",
    gap: 20,
    paddingTop: 20,
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  checkText: {
    fontSize: 52,
    color: "#FFFFFF",
    fontWeight: "bold",
    lineHeight: 60,
    textAlign: "center",
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    textAlign: "center",
  },
  successSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    textAlign: "center",
  },
  receiptCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  receiptLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  receiptLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  receiptValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  ratingContainer: {
    alignItems: "center",
    gap: 12,
  },
  ratingTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
  },
  stars: {
    flexDirection: "row",
    gap: 4,
  },
  starText: {
    fontSize: 36,
  },
});
