import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Alert,
} from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { GlassCard } from "@/components/GlassCard";
import { DRIVER_PLANS, type DriverPlan } from "@/lib/pricing";
import { planApi, type DriverPlanStatus } from "@/lib/planApi";
import { RazorpayWebView } from "@/components/RazorpayWebView";
import type { RazorpayOrder } from "@/lib/paymentApi";

const COMPETITOR_DATA = [
  { name: "RaftaarRide ✅", commission: "0%", passMonthly: "₹150–₹570", surge: "Max 1.2x", highlight: true },
  { name: "Rapido", commission: "0%", passMonthly: "₹199–₹999", surge: "2x+", highlight: false },
  { name: "Ola", commission: "15–20%", passMonthly: "₹199+/day", surge: "2x+", highlight: false },
  { name: "Uber", commission: "20–30%", passMonthly: "N/A", surge: "3x+", highlight: false },
];

function PlanStatusBanner({ plan, colors }: { plan: DriverPlanStatus; colors: any }) {
  if (!plan.planType) {
    return (
      <Animated.View entering={FadeInDown.delay(60)} style={[styles.statusBanner, { backgroundColor: "#64748b22", borderColor: "#64748b44" }]}>
        <Text style={{ fontSize: 20 }}>📋</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusTitle, { color: colors.foreground }]}>Koi plan active nahi</Text>
          <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>Neeche se plan chuno</Text>
        </View>
      </Animated.View>
    );
  }
  const color = plan.isTrial ? "#F5A623" : plan.isActive ? "#22c55e" : "#ef4444";
  const icon = plan.isTrial ? "🎁" : plan.isActive ? "✅" : "⚠️";
  const label = plan.isTrial
    ? `Free Trial — ${plan.daysLeft} din bache hain`
    : plan.isActive
    ? `${plan.planType?.toUpperCase()} Plan — ${plan.daysLeft} din bache`
    : "Plan expire ho gaya — renew karo";
  const sub = plan.planEndAt
    ? `Expire: ${new Date(plan.planEndAt).toLocaleDateString("hi-IN", { day: "numeric", month: "short", year: "numeric" })}`
    : "";
  return (
    <Animated.View entering={FadeInDown.delay(60)} style={[styles.statusBanner, { backgroundColor: color + "18", borderColor: color + "44" }]}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusTitle, { color }]}>{label}</Text>
        {!!sub && <Text style={[styles.statusSub, { color: color + "AA" }]}>{sub}</Text>}
      </View>
    </Animated.View>
  );
}

function PlanCard({
  plan, isSelected, onSelectDaily, onSelectMonthly, loadingKey, trialUsed, onStartTrial, trialLoading,
}: {
  plan: DriverPlan; isSelected: boolean;
  onSelectDaily: () => void; onSelectMonthly: () => void;
  loadingKey: string | null; trialUsed: boolean;
  onStartTrial: () => void; trialLoading: boolean;
}) {
  const colors = useColors();
  return (
    <Animated.View entering={FadeInDown.springify()} style={[styles.planCard, {
      borderColor: isSelected ? plan.color : colors.border,
      backgroundColor: isSelected ? plan.color + "12" : colors.card,
      borderWidth: isSelected ? 2 : 1,
    }]}>
      <View style={styles.planHeader}>
        <View style={styles.planTitleRow}>
          <Text style={{ fontSize: 28 }}>{plan.emoji}</Text>
          <View style={{ marginLeft: 10 }}>
            <Text style={[styles.planLabel, { color: colors.foreground }]}>{plan.label}</Text>
            {plan.firstMonthFree && !trialUsed && (
              <View style={[styles.freeBadge, { backgroundColor: plan.color + "22", borderColor: plan.color + "44" }]}>
                <Text style={[styles.freeBadgeText, { color: plan.color }]}>🎁 Pehle 30 din FREE</Text>
              </View>
            )}
          </View>
        </View>
        {isSelected && (
          <Animated.View entering={ZoomIn.duration(200)} style={[styles.checkCircle, { backgroundColor: plan.color }]}>
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>✓</Text>
          </Animated.View>
        )}
      </View>

      <View style={styles.perksListSmall}>
        {plan.perks.map((perk, i) => (
          <View key={i} style={styles.perkRow}>
            <Text style={{ fontSize: 12, color: plan.color }}>✓</Text>
            <Text style={[styles.perkText, { color: colors.foreground }]}>{perk}</Text>
          </View>
        ))}
      </View>

      {plan.firstMonthFree && !trialUsed && (
        <TouchableOpacity
          onPress={onStartTrial}
          disabled={trialLoading}
          style={[styles.trialBtn, { backgroundColor: plan.color }]}
          activeOpacity={0.82}
        >
          {trialLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.trialBtnText}>🎁 30 Din FREE Shuru Karo</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.payRow}>
        <TouchableOpacity
          onPress={onSelectDaily}
          disabled={loadingKey === `${plan.vehicleType}_daily`}
          style={[styles.payBtn, { borderColor: plan.color, flex: 1 }]}
          activeOpacity={0.82}
        >
          {loadingKey === `${plan.vehicleType}_daily` ? (
            <ActivityIndicator color={plan.color} size="small" />
          ) : (
            <>
              <Text style={[styles.payBtnPrice, { color: plan.color }]}>₹{plan.dailyPrice}</Text>
              <Text style={[styles.payBtnLabel, { color: plan.color + "BB" }]}>/din</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSelectMonthly}
          disabled={loadingKey === `${plan.vehicleType}_monthly`}
          style={[styles.payBtn, { borderColor: plan.color, backgroundColor: plan.color + "18", flex: 1 }]}
          activeOpacity={0.82}
        >
          {loadingKey === `${plan.vehicleType}_monthly` ? (
            <ActivityIndicator color={plan.color} size="small" />
          ) : (
            <>
              <Text style={[styles.payBtnPrice, { color: plan.color }]}>₹{plan.monthlyPrice}</Text>
              <Text style={[styles.payBtnLabel, { color: plan.color + "BB" }]}>/month</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export function DriverPlansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { driver, driverToken } = useDriverAuth();
  const [plan, setPlan] = useState<DriverPlanStatus | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [trialLoading, setTrialLoading] = useState(false);
  const [payLoadingKey, setPayLoadingKey] = useState<string | null>(null);
  const [razorpayOrder, setRazorpayOrder] = useState<(RazorpayOrder & { vehicleType: string; billing: "daily" | "monthly" }) | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const fetchPlan = useCallback(async () => {
    if (!driverToken) return;
    try {
      const p = await planApi.getPlan(driverToken);
      setPlan(p);
    } catch {}
    finally { setPlanLoading(false); }
  }, [driverToken]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const handleStartTrial = async () => {
    if (!driverToken) return;
    setTrialLoading(true);
    try {
      const res = await planApi.startTrial(driverToken);
      setPlan(res.plan);
      Alert.alert("🎉 Free Trial Shuru!", "Aapka 30-din ka free trial shuru ho gaya hai. Ab aap online ho sakte hain!", [{ text: "Dhanyavaad!" }]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Trial shuru nahi hua");
    } finally { setTrialLoading(false); }
  };

  const handleSubscribe = async (vehicleType: string, billing: "daily" | "monthly") => {
    if (!driverToken) return;
    const key = `${vehicleType}_${billing}`;
    setPayLoadingKey(key);
    try {
      const order = await planApi.subscribe(driverToken, vehicleType, billing);
      setRazorpayOrder({ ...order, orderId: order.orderId, vehicleType, billing });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Order create nahi hua");
    } finally { setPayLoadingKey(null); }
  };

  const handlePaymentSuccess = async (data: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
    if (!razorpayOrder || !driverToken) return;
    setRazorpayOrder(null);
    try {
      const res = await planApi.activate(driverToken, {
        ...data,
        vehicleType: razorpayOrder.vehicleType,
        billing: razorpayOrder.billing,
      });
      setPlan(res.plan);
      const billing = razorpayOrder.billing === "daily" ? "1-din ka" : "30-din ka";
      Alert.alert("✅ Plan Active!", `Aapka ${billing} plan successfully activate ho gaya! Ab aap online ho sakte hain.`, [{ text: "Chaliye!" }]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Plan activate nahi hua. Support se contact karein.");
    }
  };

  const driverVehicle = driver?.vehicleType ?? "cab";
  const matchedPlanType = driverVehicle === "prime" ? "cab" : driverVehicle;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        <Animated.View entering={FadeInDown.delay(30)} style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>📋 Driver Plans</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>0% commission — jo graaahak dega, woh poora aapka</Text>
        </Animated.View>

        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          {planLoading ? (
            <View style={[styles.statusBanner, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.mutedForeground} />
              <Text style={[styles.statusSub, { color: colors.mutedForeground, marginLeft: 10 }]}>Plan status load ho raha hai...</Text>
            </View>
          ) : plan ? (
            <PlanStatusBanner plan={plan} colors={colors} />
          ) : null}
        </View>

        <Animated.View entering={FadeInDown.delay(80)}>
          <GlassCard style={styles.heroBanner} padding={0}>
            <View style={[styles.heroBannerInner, { backgroundColor: "#F5A623" }]}>
              <Text style={styles.heroIcon}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>India ka Sabse Sasta Platform</Text>
                <Text style={styles.heroSubtitle}>Aapke seva mein — RaftaarRide sirf aapke liye bana hai</Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(110)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Apna Plan Chunein</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            Daily ya monthly — jo pasand aaye wo lo
          </Text>
        </Animated.View>

        {DRIVER_PLANS.map((p) => (
          <View key={p.vehicleType} style={styles.planWrap}>
            {matchedPlanType === p.vehicleType && (
              <View style={[styles.recommendBadge, { backgroundColor: p.color }]}>
                <Text style={styles.recommendText}>⭐ Aapke liye Recommended</Text>
              </View>
            )}
            <PlanCard
              plan={p}
              isSelected={plan?.planType === (p.vehicleType === "prime" ? "cab" : p.vehicleType) && !!plan?.isActive}
              onSelectDaily={() => handleSubscribe(p.vehicleType, "daily")}
              onSelectMonthly={() => handleSubscribe(p.vehicleType, "monthly")}
              loadingKey={payLoadingKey}
              trialUsed={plan?.trialUsed ?? false}
              onStartTrial={handleStartTrial}
              trialLoading={trialLoading}
            />
          </View>
        ))}

        <Animated.View entering={FadeInDown.delay(180)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Competitor Comparison</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200)}>
          <GlassCard style={styles.tableCard} padding={0}>
            <View style={[styles.tableHeader, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              {["App", "Commission", "Monthly", "Surge"].map((h) => (
                <Text key={h} style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: h === "App" ? 1.2 : 1 }]}>{h}</Text>
              ))}
            </View>
            {COMPETITOR_DATA.map((row, i) => (
              <View key={row.name} style={[styles.tableRow, {
                backgroundColor: row.highlight ? "rgba(245,166,35,0.08)" : "transparent",
                borderBottomColor: colors.border, borderBottomWidth: i < COMPETITOR_DATA.length - 1 ? 0.5 : 0,
              }]}>
                <View style={{ flex: 1.2, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {row.highlight && <Text style={{ fontSize: 10 }}>⭐</Text>}
                  <Text style={[styles.tableCell, { color: row.highlight ? "#F5A623" : colors.foreground, fontWeight: row.highlight ? "700" : "400" }]}>{row.name}</Text>
                </View>
                <Text style={[styles.tableCell, { color: row.commission === "0%" ? "#22c55e" : "#ef4444" }]}>{row.commission}</Text>
                <Text style={[styles.tableCell, { color: colors.foreground }]}>{row.passMonthly}</Text>
                <Text style={[styles.tableCell, { color: row.surge.startsWith("Max") ? "#22c55e" : "#ef4444" }]}>{row.surge}</Text>
              </View>
            ))}
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(230)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Convenience Fee (Customer se)</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Yeh chhoti si fee customer se li jaati hai — driver se kuch nahi</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250)}>
          <GlassCard style={styles.feeCard} padding={16}>
            {[
              { emoji: "🏍️", label: "Bike", fee: "₹4/ride" },
              { emoji: "🛺", label: "Auto", fee: "₹6/ride" },
              { emoji: "🚗", label: "Cab/SUV", fee: "₹12–₹15/ride" },
            ].map((item, i) => (
              <View key={item.label} style={[styles.feeRow, i < 2 && { borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingBottom: 12, marginBottom: 12 }]}>
                <View style={styles.feeLeft}>
                  <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                  <Text style={[styles.feeLabel, { color: colors.foreground }]}>{item.label}</Text>
                </View>
                <View style={[styles.feeBadge, { backgroundColor: "#22c55e22", borderColor: "#22c55e44" }]}>
                  <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: "600" }}>{item.fee}</Text>
                </View>
              </View>
            ))}
            <View style={[styles.noteBox, { backgroundColor: colors.secondary }]}>
              <Text style={{ fontSize: 14 }}>💡</Text>
              <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
                Driver ko poora ride fare milta hai. Platform fee alag add hoti hai customer ke bill mein.
              </Text>
            </View>
          </GlassCard>
        </Animated.View>

      </ScrollView>

      {razorpayOrder && driver && (
        <RazorpayWebView
          visible
          order={razorpayOrder}
          userInfo={{ name: driver.name, email: driver.email, phone: driver.phone }}
          onSuccess={handlePaymentSuccess}
          onDismiss={() => setRazorpayOrder(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular", lineHeight: 20 },
  statusBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  statusTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statusSub: { fontSize: 12, marginTop: 2, fontFamily: "Inter_400Regular" },
  heroBanner: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16, overflow: "hidden" },
  heroBannerInner: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderRadius: 16 },
  heroIcon: { fontSize: 32 },
  heroTitle: { fontSize: 15, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  heroSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, fontFamily: "Inter_400Regular" },
  section: { paddingHorizontal: 20, marginTop: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  sectionSubtitle: { fontSize: 12, marginTop: 3, fontFamily: "Inter_400Regular" },
  planWrap: { marginHorizontal: 20, marginBottom: 16 },
  planCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  planTitleRow: { flexDirection: "row", alignItems: "center" },
  planLabel: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  freeBadge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: "flex-start" },
  freeBadgeText: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  checkCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  perksListSmall: { gap: 5, marginBottom: 14 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  perkText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
  trialBtn: { borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  trialBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  payRow: { flexDirection: "row", gap: 10 },
  payBtn: {
    borderWidth: 1.5, borderRadius: 12, padding: 12,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 2,
  },
  payBtnPrice: { fontSize: 20, fontWeight: "800", fontFamily: "Inter_700Bold" },
  payBtnLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  recommendBadge: { alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 4 },
  recommendText: { fontSize: 10, color: "#fff", fontWeight: "700", fontFamily: "Inter_700Bold" },
  tableCard: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16, overflow: "hidden" },
  tableHeader: { flexDirection: "row", padding: 10, borderBottomWidth: 1 },
  tableHeaderCell: { flex: 1, fontSize: 10, fontWeight: "600", fontFamily: "Inter_600SemiBold", textAlign: "center" },
  tableRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 12, alignItems: "center" },
  tableCell: { flex: 1, fontSize: 11, textAlign: "center", fontFamily: "Inter_400Regular" },
  feeCard: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  feeLabel: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  feeBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, marginTop: 12 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
});
