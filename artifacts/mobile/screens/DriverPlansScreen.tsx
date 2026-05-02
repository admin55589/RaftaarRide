import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import Animated, { FadeInDown, FadeInUp, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { GlassCard } from "@/components/GlassCard";
import { DRIVER_PLANS, type DriverPlan } from "@/lib/pricing";

const COMPETITOR_DATA = [
  { name: "RaftaarRide ✅", commission: "0%", passMonthly: "₹99–₹399", surge: "Max 1.2x", highlight: true },
  { name: "Rapido", commission: "0%", passMonthly: "₹149–₹500", surge: "2x+", highlight: false },
  { name: "Ola", commission: "0%", passMonthly: "₹67/day", surge: "2x+", highlight: false },
  { name: "Uber", commission: "20–30%", passMonthly: "N/A", surge: "3x+", highlight: false },
];

function PlanCard({ plan, isSelected, onSelect }: { plan: DriverPlan; isSelected: boolean; onSelect: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.85}>
      <Animated.View entering={FadeInDown.springify()} style={[
        styles.planCard,
        {
          borderColor: isSelected ? plan.color : colors.border,
          backgroundColor: isSelected ? plan.color + "12" : colors.card,
          borderWidth: isSelected ? 2 : 1,
        },
      ]}>
        <View style={styles.planHeader}>
          <View style={styles.planTitleRow}>
            <Text style={{ fontSize: 28 }}>{plan.emoji}</Text>
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.planLabel, { color: colors.foreground }]}>{plan.label}</Text>
              {plan.firstMonthFree && (
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

        <View style={styles.priceRow}>
          <View style={[styles.priceChip, { backgroundColor: plan.color + "18" }]}>
            <Text style={[styles.priceAmount, { color: plan.color }]}>₹{plan.dailyPrice}</Text>
            <Text style={[styles.pricePer, { color: plan.color + "CC" }]}>/din</Text>
          </View>
          <View style={[styles.orBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.orText, { color: colors.mutedForeground }]}>ya</Text>
          </View>
          <View style={[styles.priceChip, { backgroundColor: plan.color + "18" }]}>
            <Text style={[styles.priceAmount, { color: plan.color }]}>₹{plan.monthlyPrice}</Text>
            <Text style={[styles.pricePer, { color: plan.color + "CC" }]}>/month</Text>
          </View>
        </View>

        <View style={styles.perksList}>
          {plan.perks.map((perk, i) => (
            <View key={i} style={styles.perkRow}>
              <Text style={{ fontSize: 13, color: plan.color }}>✓</Text>
              <Text style={[styles.perkText, { color: colors.foreground }]}>{perk}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function DriverPlansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { driver } = useDriverAuth();
  const { lang } = useLanguage();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const driverVehicle = driver?.vehicleType ?? "cab";
  const matchedPlan = DRIVER_PLANS.find(
    (p) => p.vehicleType === driverVehicle || (driverVehicle === "prime" && p.vehicleType === "cab")
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        <Animated.View entering={FadeInDown.delay(50)} style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>📋 Driver Plans</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            0% commission — jo graaahak dega, woh poora aapka
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)}>
          <GlassCard style={styles.heroBanner} padding={0}>
            <View style={[styles.heroBannerInner, { backgroundColor: "#F5A623" }]}>
              <Text style={styles.heroIcon}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>India ka Sabse Sasta Platform</Text>
                <Text style={styles.heroSubtitle}>
                  Aap chalao, aap kamao — RaftaarRide sirf aapke liye bana hai
                </Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(130)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Apna Plan Chunein</Text>
        </Animated.View>

        {DRIVER_PLANS.map((plan) => (
          <View key={plan.vehicleType} style={styles.planWrap}>
            <PlanCard
              plan={plan}
              isSelected={selectedPlan === plan.vehicleType}
              onSelect={() => setSelectedPlan(plan.vehicleType)}
            />
            {matchedPlan?.vehicleType === plan.vehicleType && (
              <View style={[styles.recommendBadge, { backgroundColor: plan.color }]}>
                <Text style={styles.recommendText}>Aapke liye Recommended</Text>
              </View>
            )}
          </View>
        ))}

        <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Competitor Comparison</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220)}>
          <GlassCard style={styles.tableCard} padding={0}>
            <View style={[styles.tableHeader, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground, flex: 1.2 }]}>App</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground }]}>Commission</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground }]}>Monthly</Text>
              <Text style={[styles.tableHeaderCell, { color: colors.mutedForeground }]}>Surge</Text>
            </View>
            {COMPETITOR_DATA.map((row, i) => (
              <View
                key={row.name}
                style={[
                  styles.tableRow,
                  {
                    backgroundColor: row.highlight ? "rgba(245,166,35,0.08)" : "transparent",
                    borderBottomColor: colors.border,
                    borderBottomWidth: i < COMPETITOR_DATA.length - 1 ? 0.5 : 0,
                  },
                ]}
              >
                <View style={{ flex: 1.2, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {row.highlight && <Text style={{ fontSize: 10 }}>⭐</Text>}
                  <Text style={[styles.tableCell, { color: row.highlight ? "#F5A623" : colors.foreground, fontWeight: row.highlight ? "700" : "400" }]}>
                    {row.name}
                  </Text>
                </View>
                <Text style={[styles.tableCell, { color: row.commission === "0%" ? "#22c55e" : "#ef4444" }]}>
                  {row.commission}
                </Text>
                <Text style={[styles.tableCell, { color: colors.foreground }]}>{row.passMonthly}</Text>
                <Text style={[styles.tableCell, { color: row.surge.startsWith("Max") ? "#22c55e" : "#ef4444" }]}>
                  {row.surge}
                </Text>
              </View>
            ))}
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Platform Fee (Customer se)</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            Yeh chhoti si fee customer se li jaati hai — driver se kuch nahi
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(270)}>
          <GlassCard style={styles.feeCard} padding={16}>
            {[
              { emoji: "🏍️", label: "Bike", fee: "₹3–₹5/ride" },
              { emoji: "🛺", label: "Auto", fee: "₹5–₹7/ride" },
              { emoji: "🚗", label: "Cab/SUV", fee: "₹10–₹15/ride" },
            ].map((item, i) => (
              <View
                key={item.label}
                style={[
                  styles.feeRow,
                  i < 2 && { borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingBottom: 12, marginBottom: 12 },
                ]}
              >
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

        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <GlassCard style={styles.ctaCard} padding={20}>
            <Text style={[styles.ctaTitle, { color: colors.foreground }]}>Pehle 30 Din Bilkul FREE 🎁</Text>
            <Text style={[styles.ctaSubtitle, { color: colors.mutedForeground }]}>
              Koi subscription nahi, koi commitment nahi. Pehle mahina free mein try karo.
            </Text>
            <View style={[styles.ctaHighlight, { backgroundColor: "#F5A62318", borderColor: "#F5A62344" }]}>
              <Text style={{ fontSize: 24 }}>🚀</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#F5A623", fontSize: 14, fontWeight: "700" }}>
                  "Jo customer dega, woh poora driver ka"
                </Text>
                <Text style={{ color: "#F5A623AA", fontSize: 12, marginTop: 2 }}>
                  — RaftaarRide ka promise
                </Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular", lineHeight: 20 },
  heroBanner: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16, overflow: "hidden" },
  heroBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderRadius: 16,
  },
  heroIcon: { fontSize: 32 },
  heroTitle: { fontSize: 15, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  heroSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, fontFamily: "Inter_400Regular" },
  section: { paddingHorizontal: 20, marginTop: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  sectionSubtitle: { fontSize: 12, marginTop: 3, fontFamily: "Inter_400Regular" },
  planWrap: { marginHorizontal: 20, marginBottom: 14 },
  planCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  planTitleRow: { flexDirection: "row", alignItems: "center" },
  planLabel: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  freeBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  freeBadgeText: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  priceChip: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 2,
  },
  priceAmount: { fontSize: 22, fontWeight: "800", fontFamily: "Inter_700Bold" },
  pricePer: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  orBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  orText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  perksList: { gap: 6 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  perkText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  recommendBadge: {
    position: "absolute",
    top: -10,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
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
  feeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  ctaCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16 },
  ctaTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 6 },
  ctaSubtitle: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular", marginBottom: 14 },
  ctaHighlight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
});
