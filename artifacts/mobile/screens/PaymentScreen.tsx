import React, { useEffect, useState } from "react";
import {
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
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useVoiceAI } from "@/hooks/useVoiceAI";

function SuccessTick() {
  const outerScale = useSharedValue(0);
  const outerOpacity = useSharedValue(0);
  const middleScale = useSharedValue(0);
  const innerScale = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    outerOpacity.value = withTiming(1, { duration: 200 });
    outerScale.value = withSpring(1, { damping: 12, stiffness: 180 });

    middleScale.value = withDelay(120, withSpring(1, { damping: 14, stiffness: 200 }));
    innerScale.value = withDelay(220, withSpring(1, { damping: 12, stiffness: 220 }));

    checkScale.value = withDelay(350, withSpring(1, { damping: 8, stiffness: 260 }));
    checkOpacity.value = withDelay(350, withTiming(1, { duration: 250 }));

    pulseScale.value = withDelay(
      500,
      withRepeat(
        withSequence(
          withTiming(1.15, { duration: 900, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      )
    );
    pulseOpacity.value = withDelay(
      500,
      withRepeat(
        withSequence(
          withTiming(0.15, { duration: 900 }),
          withTiming(0.45, { duration: 900 })
        ),
        -1,
        false
      )
    );
  }, []);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerScale.value }],
    opacity: outerOpacity.value,
  }));
  const middleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: middleScale.value }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: innerScale.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkOpacity.value,
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <View style={styles.tickWrapper}>
      <Animated.View style={[styles.pulseRing, pulseStyle]} />
      <Animated.View style={[styles.outerRing, outerStyle]}>
        <Animated.View style={[styles.middleRing, middleStyle]}>
          <Animated.View style={[styles.innerCircle, innerStyle]}>
            <Animated.View style={checkStyle}>
              <Feather name="check" size={42} color="#0A0A0F" strokeWidth={3} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function PaymentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setScreen, selectedVehicle, rideMode, estimatedPrice, estimatedTime, paymentMethod, assignedDriver, destination, pickup, addRideToHistory } = useApp();
  const [paid, setPaid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const { announcePaymentSuccess } = useVoiceAI();

  const vehicleMultiplier = selectedVehicle === "bike" ? 0.6 : selectedVehicle === "auto" ? 0.85 : 1;
  const rideModeMultiplier = rideMode === "economy" ? 1 : rideMode === "fast" ? 1.3 : 1.7;
  const price = Math.round(estimatedPrice * vehicleMultiplier * rideModeMultiplier);
  const duration = Math.round(estimatedTime * (selectedVehicle === "bike" ? 0.7 : 1));

  const handlePay = () => {
    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => {
      setPaid(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      announcePaymentSuccess(price);
      const driver = assignedDriver ?? { name: "Raj Kumar", rating: 4.8, vehicle: "Swift Dzire", vehicleNumber: "DL 4C AB 1234", vehicleType: selectedVehicle, eta: 5, photo: "RK", id: "1" };
      addRideToHistory({
        id: Date.now().toString(),
        pickup,
        destination,
        vehicleType: selectedVehicle,
        rideMode,
        price,
        duration,
        distance: "8.2 km",
        date: new Date().toISOString(),
        driver,
      });
    }, 1500);
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
                ["Amount Paid", `₹${price}`],
                ["Duration", `${duration} min`],
                ["Distance", "8.2 km"],
                ["Payment", paymentMethod],
              ].map(([label, value]) => (
                <View key={label} style={[styles.receiptRow, { borderColor: colors.border }]}>
                  <Text style={[styles.receiptLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <Text style={[styles.receiptValue, { color: colors.foreground }]}>{value}</Text>
                </View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(700).springify()} style={styles.ratingContainer}>
              <Text style={[styles.ratingTitle, { color: colors.foreground }]}>Rate your driver</Text>
              <View style={styles.stars}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Pressable key={i}>
                    <MaterialCommunityIcons name="star" size={36} color={colors.primary} />
                  </Pressable>
                ))}
              </View>
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
                <View style={styles.amountRow}>
                  <Text style={[styles.amountDetailLabel, { color: colors.mutedForeground }]}>Base Fare</Text>
                  <Text style={[styles.amountDetailValue, { color: colors.foreground }]}>₹{Math.round(price * 0.7)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={[styles.amountDetailLabel, { color: colors.mutedForeground }]}>Distance</Text>
                  <Text style={[styles.amountDetailValue, { color: colors.foreground }]}>₹{Math.round(price * 0.25)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={[styles.amountDetailLabel, { color: colors.mutedForeground }]}>Convenience Fee</Text>
                  <Text style={[styles.amountDetailValue, { color: colors.foreground }]}>₹{Math.round(price * 0.05)}</Text>
                </View>
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
  tickWrapper: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#22C55E",
  },
  outerRing: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 2,
    borderColor: "rgba(34,197,94,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  middleRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(34,197,94,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(34,197,94,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  innerCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 16,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
    gap: 8,
  },
});
