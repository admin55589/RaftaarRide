import React, { useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useNotification } from "@/context/NotificationContext";
import { GlassCard } from "@/components/GlassCard";
import { LiveCalendarIcon } from "@/components/LiveCalendarIcon";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BASE_URL } from "@/lib/api";

const WITHDRAWAL_METHODS = [
  { id: "upi", label: "UPI", icon: "📲", placeholder_hi: "yourname@upi", placeholder_en: "yourname@upi" },
  { id: "paytm", label: "Paytm", icon: "💙", placeholder_hi: "9876543210", placeholder_en: "9876543210" },
  { id: "phonepe", label: "PhonePe", icon: "💜", placeholder_hi: "9876543210@ybl", placeholder_en: "9876543210@ybl" },
  { id: "bank", label: "Bank Account", icon: "🏦", placeholder_hi: "खाता: 1234567890, IFSC: SBIN0001234", placeholder_en: "AC: 1234567890, IFSC: SBIN0001234" },
];

interface WithdrawalReq {
  id: number;
  amount: string;
  method: string;
  status: string;
  accountDetails: string;
  transactionRef?: string;
  rejectionReason?: string;
  createdAt: string;
  processedAt?: string;
}

interface TxnItem {
  id: number;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

interface RecentRating {
  rideId: number;
  userRating: number | null;
  pickupAddress: string | null;
  dropAddress: string | null;
  createdAt: string | null;
  price: string | null;
}

interface RatingsData {
  rating: number | null;
  ratingCount: number;
  distribution: { star: number | null; count: number }[];
  recentRatings: RecentRating[];
}

type ActiveTab = "earnings" | "ratings" | "performance";

interface WeekStat {
  label: string;
  weekStart: string;
  assigned: number;
  completed: number;
  cancelledByDriver: number;
  completionRate: number;
  cancelRate: number;
  earnings: number;
}

interface PerfData {
  rating: number | null;
  thisWeek: WeekStat;
  weeks: WeekStat[];
}

export function DriverEarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { driverToken } = useDriverAuth();
  const { t, lang } = useLanguage();
  const { showNotification } = useNotification();

  const [activeTab, setActiveTab] = useState<ActiveTab>("earnings");

  const [balance, setBalance] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [transactions, setTransactions] = useState<TxnItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverRating, setDriverRating] = useState<number | null>(null);
  const [totalRides, setTotalRides] = useState(0);

  const [ratingsData, setRatingsData] = useState<RatingsData | null>(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  const [perfData, setPerfData] = useState<PerfData | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const [dailyGoal, setDailyGoal] = useState(500);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("500");

  useEffect(() => {
    AsyncStorage.getItem("driver_daily_goal").then(v => {
      if (v) { setDailyGoal(Number(v)); setGoalInput(v); }
    }).catch(() => {});
  }, []);

  const saveDailyGoal = async () => {
    const g = Number(goalInput);
    if (!g || g < 100) return;
    setDailyGoal(g);
    setEditingGoal(false);
    await AsyncStorage.setItem("driver_daily_goal", String(g));
  };

  const todayEarnings = useMemo(() => {
    const today = new Date().toDateString();
    return transactions
      .filter(t => t.type === "earning" && new Date(t.createdAt).toDateString() === today)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  }, [transactions]);

  const goalProgress = Math.min(100, Math.round((todayEarnings / dailyGoal) * 100));

  const achievementBadge = useMemo(() => {
    const rating = driverRating;
    if (totalRides >= 500 && rating && rating >= 4.5) return { icon: "💎", label: "Elite Driver", color: "#818CF8" };
    if (totalRides >= 200) return { icon: "🏆", label: "Veteran Driver", color: "#F59E0B" };
    if (totalRides >= 50) return { icon: "⭐", label: "Experienced Driver", color: "#F5A623" };
    return { icon: "🌟", label: "Rising Star", color: "#4ADE80" };
  }, [totalRides, driverRating]);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("upi");
  const [accountDetails, setAccountDetails] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchWallet = useCallback(async () => {
    if (!driverToken) return;
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}driver/wallet`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setBalance(data.balance);
        setTotalEarnings(data.totalEarnings);
        setTransactions(data.transactions ?? []);
        setWithdrawals(data.withdrawals ?? []);
      }
    } catch { }
    finally { setLoading(false); }
  }, [driverToken]);

  const fetchProfile = useCallback(async () => {
    if (!driverToken) return;
    try {
      const res = await fetch(`${BASE_URL}driver-auth/me`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      const data = await res.json();
      if (data.success && data.driver) {
        setDriverRating(data.driver.rating ? Number(data.driver.rating) : null);
        setTotalRides(data.driver.totalRides ?? 0);
      }
    } catch { }
  }, [driverToken]);

  const fetchRatings = useCallback(async () => {
    if (!driverToken) return;
    try {
      setRatingsLoading(true);
      const res = await fetch(`${BASE_URL}driver-auth/ratings`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setRatingsData(data);
        if (data.rating) setDriverRating(data.rating);
      }
    } catch { }
    finally { setRatingsLoading(false); }
  }, [driverToken]);

  const fetchPerformance = useCallback(async () => {
    if (!driverToken) return;
    try {
      setPerfLoading(true);
      const res = await fetch(`${BASE_URL}driver-auth/performance`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      const data = await res.json();
      if (data.success) setPerfData(data);
    } catch { }
    finally { setPerfLoading(false); }
  }, [driverToken]);

  useEffect(() => {
    fetchWallet();
    fetchProfile();
    const interval = setInterval(fetchWallet, 30000);
    return () => clearInterval(interval);
  }, [driverToken]);

  useEffect(() => {
    if (activeTab === "ratings") fetchRatings();
    if (activeTab === "performance") fetchPerformance();
  }, [activeTab]);

  const handleWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt < 50) {
      showNotification({ title: "Invalid Amount", body: t("min_amount"), type: "error", icon: "❌" });
      return;
    }
    if (amt > balance) {
      showNotification({ title: "Insufficient Balance", body: `₹${balance.toFixed(2)} available`, type: "error", icon: "❌" });
      return;
    }
    if (!accountDetails.trim() || accountDetails.trim().length < 5) {
      showNotification({ title: t("account_number_label"), body: "Account details fill karein", type: "error", icon: "⚠️" });
      return;
    }

    setWithdrawing(true);
    try {
      const res = await fetch(`${BASE_URL}driver/wallet/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${driverToken}` },
        body: JSON.stringify({ amount: amt, method: selectedMethod, accountDetails }),
      });
      const data = await res.json();
      if (data.success) {
        setBalance(data.newBalance);
        setShowWithdraw(false);
        setWithdrawAmount("");
        setAccountDetails("");
        await fetchWallet();
        showNotification({
          title: "Withdrawal Request Submit! 💸",
          body: `₹${amt} — ${t("process_time")}`,
          type: "success",
          icon: "💸",
          duration: 5000,
        });
      } else {
        showNotification({ title: "Error", body: data.error ?? "Kuch galat hua", type: "error", icon: "❌" });
      }
    } catch {
      showNotification({ title: "Network Error", body: "Dobara try karein", type: "error", icon: "📵" });
    } finally { setWithdrawing(false); }
  };

  const statusColors: Record<string, string> = {
    pending: "#F59E0B",
    approved: "#4ADE80",
    rejected: "#F87171",
  };

  const selectedMethodData = WITHDRAWAL_METHODS.find((m) => m.id === selectedMethod);
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: topPad },
    header: { paddingHorizontal: 20, paddingBottom: 12 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontFamily: "Inter_400Regular" },
    tabRow: { flexDirection: "row", marginHorizontal: 20, marginBottom: 20, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
    tabBtnActive: { backgroundColor: "#F5A623" },
    tabBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.45)" },
    tabBtnTextActive: { color: "#0A0A0F" },
    statsRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 20 },
    statCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: "center" },
    statValue: { fontSize: 22, fontWeight: "800", color: colors.text, fontFamily: "Inter_700Bold" },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 4, textAlign: "center", fontFamily: "Inter_400Regular" },
    balanceCard: { marginHorizontal: 20, borderRadius: 20, padding: 24, marginBottom: 20, overflow: "hidden" },
    balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 8, fontFamily: "Inter_400Regular" },
    balanceAmount: { fontSize: 44, fontWeight: "800", color: "#fff", fontFamily: "Inter_700Bold" },
    commissionNote: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 8, fontFamily: "Inter_400Regular" },
    withdrawBtn: { marginTop: 16, borderRadius: 12, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 12, fontFamily: "Inter_700Bold" },
    methodRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    methodChip: { flex: 1, alignItems: "center", padding: 10, borderRadius: 12, borderWidth: 1 },
    input: { borderRadius: 12, padding: 14, fontSize: 14, color: colors.text, marginBottom: 14, borderWidth: 1, fontFamily: "Inter_400Regular" },
    wCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, padding: 14 },
    wRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    wMethod: { fontSize: 13, color: colors.text, fontFamily: "Inter_600SemiBold" },
    wAmt: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    badgeText: { fontSize: 11, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" },
    wDate: { fontSize: 11, color: colors.textSecondary, fontFamily: "Inter_400Regular" },
    wRef: { fontSize: 11, color: "#4ADE80", marginTop: 4, fontFamily: "Inter_400Regular" },
    emptyText: { textAlign: "center", color: colors.textSecondary, fontSize: 13, marginVertical: 20, fontFamily: "Inter_400Regular" },
    formCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20 },
    amtRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
    amtChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
    fieldLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 8, fontFamily: "Inter_400Regular" },
  });

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const formatTime = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  const QUICK_AMTS = [200, 500, 1000, 2000];

  const starLabel = (n: number) => "⭐".repeat(n);

  const renderEarningsTab = () => (
    <>
      {/* Achievement Badge + Stats */}
      <Animated.View entering={FadeInDown.delay(95)} style={{ marginHorizontal: 20, marginBottom: 14, flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ flex: 1, borderRadius: 14, padding: 14, backgroundColor: achievementBadge.color + "15", borderWidth: 1, borderColor: achievementBadge.color + "40", flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 24 }}>{achievementBadge.icon}</Text>
          <View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: achievementBadge.color, fontFamily: "Inter_700Bold" }}>{achievementBadge.label}</Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "Inter_400Regular" }}>{totalRides} rides complete</Text>
          </View>
        </View>
        <GlassCard style={{ flex: 1, padding: 14, alignItems: "center" }}>
          <Text style={[styles.statValue, { color: "#22c55e", fontSize: 18 }]}>0%</Text>
          <Text style={styles.statLabel}>{t("commission_label")}</Text>
        </GlassCard>
      </Animated.View>

      {/* Daily Goal Progress */}
      <Animated.View entering={FadeInDown.delay(105)} style={{ marginHorizontal: 20, marginBottom: 14, borderRadius: 16, padding: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, fontFamily: "Inter_700Bold" }}>🎯 Aaj Ka Goal</Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "Inter_400Regular" }}>₹{todayEarnings.toFixed(0)} / ₹{dailyGoal} earned today</Text>
          </View>
          <TouchableOpacity onPress={() => setEditingGoal(!editingGoal)}>
            <Text style={{ fontSize: 11, color: "#F5A623", fontFamily: "Inter_600SemiBold" }}>{editingGoal ? "Cancel" : "✏️ Edit"}</Text>
          </TouchableOpacity>
        </View>

        {editingGoal ? (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <TextInput
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="numeric"
              placeholder="e.g. 800"
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15, fontFamily: "Inter_600SemiBold", backgroundColor: "rgba(255,255,255,0.05)" }}
            />
            <TouchableOpacity onPress={saveDailyGoal} style={{ backgroundColor: "#F5A623", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#0A0A0F", fontFamily: "Inter_700Bold" }}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={{ height: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, marginBottom: 6 }}>
              <View style={{ width: `${goalProgress}%`, height: "100%", borderRadius: 4, backgroundColor: goalProgress >= 100 ? "#4ADE80" : goalProgress >= 60 ? "#F5A623" : "#F87171" }} />
            </View>
            <Text style={{ fontSize: 11, color: goalProgress >= 100 ? "#4ADE80" : colors.textSecondary, fontFamily: "Inter_400Regular" }}>
              {goalProgress >= 100 ? "🎉 Goal pura ho gaya! Aaj ka din zabardast raha" : goalProgress >= 60 ? `${goalProgress}% — thoda aur mehnat! ₹${(dailyGoal - todayEarnings).toFixed(0)} baaki` : `${goalProgress}% — chalo niklo, peak hours mein kamaai zyada hoti hai 💪`}
            </Text>
          </>
        )}
      </Animated.View>

      {driverRating && driverRating < 4.0 && (
        <Animated.View entering={FadeInDown.delay(115)} style={{
          marginHorizontal: 20, marginBottom: 12, padding: 14, borderRadius: 12,
          backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)",
          flexDirection: "row", alignItems: "center", gap: 10,
        }}>
          <Text style={{ fontSize: 20 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#EF4444" }}>Rating Improve Karo</Text>
            <Text style={{ fontSize: 12, color: "#EF4444", opacity: 0.8, marginTop: 2 }}>
              4.0 se neeche rating account suspend ka risk badh sakta hai.
            </Text>
          </View>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(120)} style={[styles.balanceCard, { backgroundColor: "#16A34A" }]}>
        <Text style={styles.balanceLabel}>{t("withdrawable_balance")}</Text>
        {loading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
        )}
        <Text style={styles.commissionNote}>{t("commission_note")}</Text>

        <TouchableOpacity
          style={[styles.withdrawBtn, { backgroundColor: showWithdraw ? "rgba(255,255,255,0.12)" : "#fff" }]}
          onPress={() => setShowWithdraw(!showWithdraw)}
          disabled={balance <= 0}
        >
          <Text style={{ fontSize: 18 }}>{showWithdraw ? "✕" : "💸"}</Text>
          <Text style={{ color: showWithdraw ? "#fff" : "#16A34A", fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" }}>
            {showWithdraw ? t("close") : t("request_withdrawal")}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {showWithdraw && (
        <Animated.View entering={FadeInUp.duration(300)}>
          <GlassCard style={styles.formCard}>
            <Text style={styles.sectionTitle}>{t("withdrawal_details")}</Text>

            <Text style={styles.fieldLabel}>{t("choose_amount")}</Text>
            <View style={styles.amtRow}>
              {QUICK_AMTS.filter((a) => a <= balance).map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.amtChip, {
                    backgroundColor: withdrawAmount === String(a) ? "#16A34A22" : "rgba(255,255,255,0.06)",
                    borderColor: withdrawAmount === String(a) ? "#16A34A" : "rgba(255,255,255,0.12)",
                  }]}
                  onPress={() => setWithdrawAmount(String(a))}
                >
                  <Text style={{ color: withdrawAmount === String(a) ? "#16A34A" : colors.text, fontWeight: "600", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                    ₹{a}
                  </Text>
                </TouchableOpacity>
              ))}
              {balance >= 100 && (
                <TouchableOpacity
                  style={[styles.amtChip, {
                    backgroundColor: withdrawAmount === balance.toFixed(0) ? "#16A34A22" : "rgba(255,255,255,0.06)",
                    borderColor: withdrawAmount === balance.toFixed(0) ? "#16A34A" : "rgba(255,255,255,0.12)",
                  }]}
                  onPress={() => setWithdrawAmount(balance.toFixed(0))}
                >
                  <Text style={{ color: "#16A34A", fontWeight: "600", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                    {t("all")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)", fontSize: 20, fontWeight: "700" }]}
              placeholder={t("custom_amount_ph")}
              placeholderTextColor={colors.textSecondary}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>{t("withdrawal_method")}:</Text>
            <View style={styles.methodRow}>
              {WITHDRAWAL_METHODS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.methodChip, {
                    backgroundColor: selectedMethod === m.id ? "#16A34A22" : "rgba(255,255,255,0.04)",
                    borderColor: selectedMethod === m.id ? "#16A34A" : "rgba(255,255,255,0.10)",
                  }]}
                  onPress={() => { setSelectedMethod(m.id); setAccountDetails(""); }}
                >
                  <Text style={{ fontSize: 18, marginBottom: 2 }}>{m.icon}</Text>
                  <Text style={{ fontSize: 10, color: selectedMethod === m.id ? "#16A34A" : colors.textSecondary, fontFamily: "Inter_500Medium" }}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" }]}
              placeholder={selectedMethodData?.[lang === "hi" ? "placeholder_hi" : "placeholder_en"] ?? "Account details..."}
              placeholderTextColor={colors.textSecondary}
              value={accountDetails}
              onChangeText={setAccountDetails}
              multiline={selectedMethod === "bank"}
            />

            {withdrawAmount && Number(withdrawAmount) > 0 && (
              <View style={{ backgroundColor: "rgba(22,163,74,0.12)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <Text style={{ color: "#4ADE80", fontSize: 13, fontFamily: "Inter_500Medium" }}>
                  ✅ {t("you_receive")} ₹{Number(withdrawAmount).toFixed(2)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                  {t("process_time")}
                </Text>
              </View>
            )}

            <PrimaryButton
              title={withdrawing ? t("submitting") : t("withdrawal_submit")}
              onPress={handleWithdraw}
              disabled={withdrawing}
            />
          </GlassCard>
        </Animated.View>
      )}

      {/* 7-Day Earnings Bar Chart */}
      {transactions.length > 0 && (() => {
        const days: { label: string; total: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const label = d.toLocaleDateString("en-IN", { weekday: "short" });
          const total = transactions
            .filter((tx) => {
              const isEarning = tx.type !== "commission_debit" && tx.type !== "withdrawal";
              return isEarning && tx.createdAt.slice(0, 10) === key;
            })
            .reduce((s, tx) => s + Math.abs(parseFloat(String(tx.amount))), 0);
          days.push({ label, total });
        }
        const maxVal = Math.max(...days.map((d) => d.total), 1);
        return (
          <Animated.View entering={FadeInDown.delay(130)} style={{ marginHorizontal: 20, marginBottom: 20 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>📊 7 Din Ki Kamaai</Text>
            <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80 }}>
                {days.map((d, i) => {
                  const barH = d.total > 0 ? Math.max(6, (d.total / maxVal) * 72) : 4;
                  const isToday = i === 6;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                      {d.total > 0 && (
                        <Text style={{ fontSize: 9, color: isToday ? "#F5A623" : "#4ADE80", fontFamily: "Inter_600SemiBold" }}>
                          ₹{d.total >= 1000 ? `${(d.total / 1000).toFixed(1)}k` : d.total.toFixed(0)}
                        </Text>
                      )}
                      <View style={{
                        height: barH, width: "100%", borderRadius: 4,
                        backgroundColor: d.total > 0 ? (isToday ? "#F5A623" : "#4ADE80") : "rgba(255,255,255,0.08)",
                      }} />
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                {days.map((d, i) => (
                  <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: i === 6 ? "#F5A623" : "rgba(255,255,255,0.4)", fontFamily: "Inter_500Medium" }}>
                    {d.label}
                  </Text>
                ))}
              </View>
            </View>
          </Animated.View>
        );
      })()}

      {/* Recent Wallet Transactions */}
      {transactions.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>💳 Recent Transactions</Text>
          </View>
          {transactions.slice(0, 10).map((txn, i) => {
            const isDebit = txn.type === "commission_debit" || txn.type === "withdrawal";
            const isCashCommission = txn.type === "commission_debit";
            const amt = parseFloat(String(txn.amount));
            return (
              <Animated.View key={txn.id} entering={FadeInDown.delay(i * 40)}>
                <GlassCard style={[styles.wCard, { marginBottom: 8 }]}>
                  <View style={styles.wRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <Text style={{ fontSize: 20 }}>
                        {isCashCommission ? "💵" : txn.type === "withdrawal" ? "📤" : txn.type === "credit" ? "🎁" : "💰"}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.wMethod, { fontSize: 12, flexShrink: 1 }]} numberOfLines={2}>
                          {isCashCommission
                            ? "Platform Fee (Cash Ride)"
                            : txn.type === "withdrawal" ? "Withdrawal"
                            : txn.type === "credit" ? "Admin Credit"
                            : "Ride Earning"}
                        </Text>
                        <Text style={[styles.wDate, { marginTop: 2 }]} numberOfLines={1}>{formatDate(txn.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.wAmt, { color: isDebit ? "#F87171" : "#4ADE80", fontSize: 15 }]}>
                        {isDebit ? "-" : "+"}₹{Math.abs(amt).toFixed(2)}
                      </Text>
                      {isCashCommission && (
                        <View style={{ backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 }}>
                          <Text style={{ color: "#22c55e", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>0% Commission</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })}
        </View>
      )}

      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>{t("withdrawal_history")}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ margin: 20 }} />
      ) : withdrawals.length === 0 ? (
        <Text style={styles.emptyText}>{t("no_withdrawals")}</Text>
      ) : (
        withdrawals.map((w, i) => (
          <Animated.View key={w.id} entering={FadeInDown.delay(i * 50)}>
            <GlassCard style={styles.wCard}>
              <View style={styles.wRow}>
                <Text style={styles.wMethod}>
                  {WITHDRAWAL_METHODS.find((m) => m.id === w.method)?.icon ?? "💰"}{" "}
                  {WITHDRAWAL_METHODS.find((m) => m.id === w.method)?.label ?? w.method}
                </Text>
                <View style={[styles.badge, { backgroundColor: statusColors[w.status] ?? "#6B7280" }]}>
                  <Text style={styles.badgeText}>{w.status.charAt(0).toUpperCase() + w.status.slice(1)}</Text>
                </View>
              </View>
              <View style={styles.wRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <LiveCalendarIcon size="sm" primaryColor="#F5A623" bgColor="#fff" />
                  <Text style={styles.wDate}>{formatTime(w.createdAt)}</Text>
                </View>
                <Text style={[styles.wAmt, { color: "#4ADE80" }]}>₹{Number(w.amount).toFixed(2)}</Text>
              </View>
              <Text style={[styles.wDate, { marginTop: 4 }]} numberOfLines={1}>{w.accountDetails}</Text>
              {w.transactionRef && <Text style={styles.wRef}>🔗 Ref: {w.transactionRef}</Text>}
              {w.rejectionReason && (
                <Text style={[styles.wDate, { color: "#F87171", marginTop: 4 }]}>❌ {w.rejectionReason}</Text>
              )}
            </GlassCard>
          </Animated.View>
        ))
      )}
    </>
  );

  const renderRatingsTab = () => {
    if (ratingsLoading) {
      return (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <ActivityIndicator color="#F5A623" size="large" />
          <Text style={{ color: colors.textSecondary, marginTop: 16, fontFamily: "Inter_400Regular" }}>
            Ratings load ho rahi hain…
          </Text>
        </View>
      );
    }

    if (!ratingsData) {
      return (
        <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 40 }}>⭐</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 16, textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 14 }}>
            Abhi tak koi rating nahi mili. Zyada rides complete karo!
          </Text>
        </View>
      );
    }

    const { rating, ratingCount, distribution, recentRatings } = ratingsData;
    const maxCount = Math.max(...distribution.map((d) => d.count), 1);

    const ratingColor = !rating ? "#6B7280"
      : rating >= 4.5 ? "#4ADE80"
      : rating >= 4.0 ? "#86EFAC"
      : rating >= 3.5 ? "#F5A623"
      : "#F87171";

    return (
      <Animated.View entering={FadeInDown.delay(50)}>
        {/* Overall Rating Card */}
        <View style={{
          marginHorizontal: 20, marginBottom: 20, borderRadius: 20, padding: 24,
          backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
          alignItems: "center",
        }}>
          <Text style={{ fontSize: 64, fontFamily: "Inter_700Bold", color: ratingColor, lineHeight: 72 }}>
            {rating ? rating.toFixed(1) : "—"}
          </Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 6, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((s) => {
              const filled = rating ? s <= Math.round(rating) : false;
              return (
                <Text key={s} style={{ fontSize: 22, opacity: filled ? 1 : 0.2 }}>⭐</Text>
              );
            })}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular" }}>
            {ratingCount} {ratingCount === 1 ? "rating" : "ratings"} mili hain
          </Text>
          {rating && rating >= 4.5 && (
            <View style={{ marginTop: 12, backgroundColor: "rgba(74,222,128,0.12)", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(74,222,128,0.3)" }}>
              <Text style={{ color: "#4ADE80", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>🏆 Top-Rated Driver</Text>
            </View>
          )}
          {rating && rating < 4.0 && (
            <View style={{ marginTop: 12, backgroundColor: "rgba(239,68,68,0.12)", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}>
              <Text style={{ color: "#F87171", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>⚠️ Rating improve karo</Text>
            </View>
          )}
        </View>

        {/* Star Distribution */}
        {distribution.length > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>⭐ Rating Distribution</Text>
            {[5, 4, 3, 2, 1].map((star) => {
              const entry = distribution.find((d) => d.star === star);
              const cnt = entry?.count ?? 0;
              const barW = cnt > 0 ? Math.max(8, (cnt / maxCount) * 100) : 0;
              const barColor = star >= 4 ? "#4ADE80" : star === 3 ? "#F5A623" : "#F87171";
              return (
                <View key={star} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "Inter_500Medium", width: 20, textAlign: "right" }}>{star}</Text>
                  <Text style={{ fontSize: 13 }}>⭐</Text>
                  <View style={{ flex: 1, height: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                    <View style={{ width: `${barW}%`, height: "100%", backgroundColor: barColor, borderRadius: 4 }} />
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "Inter_500Medium", width: 24, textAlign: "right" }}>{cnt}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Recent Ratings List */}
        {recentRatings.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>🕐 Recent Ratings</Text>
            </View>
            {recentRatings.map((r, i) => {
              const stars = r.userRating ?? 0;
              const starColor = stars >= 4 ? "#4ADE80" : stars === 3 ? "#F5A623" : "#F87171";
              return (
                <Animated.View key={r.rideId} entering={FadeInDown.delay(i * 40)}>
                  <GlassCard style={[styles.wCard, { marginBottom: 10 }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F5A623" }} />
                          <Text style={{ fontSize: 12, color: colors.text, fontFamily: "Inter_500Medium", flex: 1 }} numberOfLines={1}>
                            {r.pickupAddress ?? "Pickup"}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" }} />
                          <Text style={{ fontSize: 12, color: colors.text, fontFamily: "Inter_500Medium", flex: 1 }} numberOfLines={1}>
                            {r.dropAddress ?? "Drop"}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={{ fontSize: 22, color: starColor, fontFamily: "Inter_700Bold" }}>
                          {stars}★
                        </Text>
                        <Text style={{ fontSize: 10 }}>{starLabel(stars)}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
                      <Text style={styles.wDate}>
                        {r.createdAt ? formatDate(r.createdAt) : ""}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#4ADE80", fontFamily: "Inter_600SemiBold" }}>
                        {r.price ? `₹${parseFloat(r.price).toFixed(0)}` : ""}
                      </Text>
                    </View>
                  </GlassCard>
                </Animated.View>
              );
            })}
          </View>
        )}

        {recentRatings.length === 0 && !ratingsLoading && (
          <Text style={styles.emptyText}>Abhi koi rated rides nahi hain</Text>
        )}
      </Animated.View>
    );
  };

  const renderPerformanceTab = () => {
    if (perfLoading) return <ActivityIndicator color="#F5A623" size="large" style={{ marginTop: 48 }} />;
    if (!perfData) return <Text style={styles.emptyText}>Performance data load nahi ho saka</Text>;

    const { thisWeek, rating, weeks } = perfData;

    const completionGrade = thisWeek.completionRate >= 80
      ? { label: "Excellent 🏆", color: "#4ADE80" }
      : thisWeek.completionRate >= 60
        ? { label: "Theek Hai 👍", color: "#F5A623" }
        : { label: "Improve Karo ⚠️", color: "#F87171" };

    const cancelGrade = thisWeek.cancelRate <= 5
      ? { label: "Bahut Achha 🏆", color: "#4ADE80" }
      : thisWeek.cancelRate <= 15
        ? { label: "Theek Hai 👍", color: "#F5A623" }
        : { label: "Zyada Hai ⚠️", color: "#F87171" };

    return (
      <Animated.View entering={FadeInDown.delay(50)}>
        {/* This week hero stats */}
        <View style={{ marginHorizontal: 20, marginBottom: 16, borderRadius: 20, padding: 20, backgroundColor: "rgba(245,166,35,0.08)", borderWidth: 1.5, borderColor: "rgba(245,166,35,0.25)" }}>
          <Text style={{ color: "#F5A623", fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4 }}>IS HAFTE (Mon–Aaj)</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 32, fontWeight: "800", color: colors.text, fontFamily: "Inter_700Bold" }}>{thisWeek.assigned}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular", textAlign: "center" }}>Rides Mili</Text>
            </View>
            <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 32, fontWeight: "800", color: "#4ADE80", fontFamily: "Inter_700Bold" }}>{thisWeek.completed}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular", textAlign: "center" }}>Complete</Text>
            </View>
            <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 32, fontWeight: "800", color: "#F87171", fontFamily: "Inter_700Bold" }}>{thisWeek.cancelledByDriver}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular", textAlign: "center" }}>Tune Cancel</Text>
            </View>
          </View>
          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "rgba(74,222,128,0.08)", borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" }}>
            <Text style={{ color: "#4ADE80", fontFamily: "Inter_700Bold", fontSize: 15 }}>
              ₹{thisWeek.earnings.toFixed(0)} is hafte kamaaye
            </Text>
          </View>
        </View>

        {/* Completion Rate Card */}
        <Animated.View entering={FadeInDown.delay(80)} style={{ marginHorizontal: 20, marginBottom: 12, borderRadius: 16, padding: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>✅ Completion Rate</Text>
            <View style={{ backgroundColor: `${completionGrade.color}22`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: `${completionGrade.color}55` }}>
              <Text style={{ fontSize: 11, color: completionGrade.color, fontFamily: "Inter_600SemiBold" }}>{completionGrade.label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 40, fontWeight: "800", color: completionGrade.color, fontFamily: "Inter_700Bold" }}>
              {thisWeek.completionRate}%
            </Text>
            <View style={{ flex: 1 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <View style={{ width: `${thisWeek.completionRate}%`, height: "100%", backgroundColor: completionGrade.color, borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 6, fontFamily: "Inter_400Regular" }}>
                {thisWeek.completed} complete / {thisWeek.assigned} mili
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Cancel Rate Card */}
        <Animated.View entering={FadeInDown.delay(100)} style={{ marginHorizontal: 20, marginBottom: 12, borderRadius: 16, padding: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>❌ Cancel Rate (Tera)</Text>
            <View style={{ backgroundColor: `${cancelGrade.color}22`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: `${cancelGrade.color}55` }}>
              <Text style={{ fontSize: 11, color: cancelGrade.color, fontFamily: "Inter_600SemiBold" }}>{cancelGrade.label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 40, fontWeight: "800", color: cancelGrade.color, fontFamily: "Inter_700Bold" }}>
              {thisWeek.cancelRate}%
            </Text>
            <View style={{ flex: 1 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <View style={{ width: `${Math.min(thisWeek.cancelRate, 100)}%`, height: "100%", backgroundColor: cancelGrade.color, borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 6, fontFamily: "Inter_400Regular" }}>
                {thisWeek.cancelledByDriver} cancel / {thisWeek.assigned} mili
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Rating */}
        {rating !== null && (
          <Animated.View entering={FadeInDown.delay(120)} style={{ marginHorizontal: 20, marginBottom: 16, borderRadius: 16, padding: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>⭐ Overall Rating</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" }}>Passengers ki average</Text>
            </View>
            <Text style={{ fontSize: 32, fontWeight: "800", color: rating >= 4.5 ? "#4ADE80" : rating >= 4.0 ? "#F5A623" : "#F87171", fontFamily: "Inter_700Bold" }}>
              {rating.toFixed(1)}★
            </Text>
          </Animated.View>
        )}

        {/* 4-Week Breakdown Table */}
        <Animated.View entering={FadeInDown.delay(140)} style={{ marginHorizontal: 20, marginBottom: 20, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <View style={{ backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text }}>📅 4 Hafte Ka Record</Text>
          </View>
          {/* Header */}
          <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}>
            <Text style={{ flex: 2, fontSize: 10, color: colors.textSecondary, fontFamily: "Inter_600SemiBold" }}>HAFTE</Text>
            <Text style={{ flex: 1, fontSize: 10, color: colors.textSecondary, textAlign: "center", fontFamily: "Inter_600SemiBold" }}>MILI</Text>
            <Text style={{ flex: 1, fontSize: 10, color: "#4ADE80", textAlign: "center", fontFamily: "Inter_600SemiBold" }}>DONE</Text>
            <Text style={{ flex: 1, fontSize: 10, color: "#F87171", textAlign: "center", fontFamily: "Inter_600SemiBold" }}>CANCEL</Text>
            <Text style={{ flex: 2, fontSize: 10, color: "#F5A623", textAlign: "right", fontFamily: "Inter_600SemiBold" }}>KAMAAI</Text>
          </View>
          {weeks.map((w, i) => (
            <View key={i} style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < weeks.length - 1 ? 1 : 0, borderBottomColor: "rgba(255,255,255,0.04)", backgroundColor: i === 0 ? "rgba(245,166,35,0.04)" : "transparent" }}>
              <View style={{ flex: 2 }}>
                <Text style={{ fontSize: 12, color: i === 0 ? "#F5A623" : colors.text, fontFamily: i === 0 ? "Inter_600SemiBold" : "Inter_400Regular" }}>{w.label}</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 1, fontFamily: "Inter_400Regular" }}>
                  {w.completionRate}% complete
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, color: colors.text, textAlign: "center", fontFamily: "Inter_600SemiBold" }}>{w.assigned}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: "#4ADE80", textAlign: "center", fontFamily: "Inter_600SemiBold" }}>{w.completed}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: w.cancelledByDriver > 0 ? "#F87171" : colors.textSecondary, textAlign: "center", fontFamily: "Inter_600SemiBold" }}>{w.cancelledByDriver}</Text>
              <Text style={{ flex: 2, fontSize: 13, color: "#F5A623", textAlign: "right", fontFamily: "Inter_700Bold" }}>₹{w.earnings.toFixed(0)}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Tips */}
        <Animated.View entering={FadeInDown.delay(160)} style={{ marginHorizontal: 20, marginBottom: 20, borderRadius: 14, padding: 16, backgroundColor: "rgba(99,102,241,0.08)", borderWidth: 1, borderColor: "rgba(99,102,241,0.2)" }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#818CF8", marginBottom: 10 }}>💡 Performance Tips</Text>
          {[
            thisWeek.cancelRate > 15 && "Cancel rate 15% se zyada hai — zyada cancel karne se account suspend ho sakta hai",
            thisWeek.completionRate < 60 && thisWeek.assigned > 3 && "Completion rate improve karo — zyada rides complete karo",
            rating !== null && rating < 4.0 && "Rating 4.0 se kam hai — customers se politely baat karo",
            thisWeek.assigned === 0 && "Is hafte koi ride nahi mili — online raho aur peak hours (7–10am, 5–9pm) mein kaam karo",
            thisWeek.assigned > 0 && thisWeek.cancelRate <= 5 && thisWeek.completionRate >= 80 && "Zabardast performance! Top driver ban ne ke raaste par ho",
          ].filter(Boolean).map((tip, i) => (
            <Text key={i} style={{ fontSize: 12, color: "#A5B4FC", fontFamily: "Inter_400Regular", marginBottom: i < 2 ? 6 : 0, lineHeight: 18 }}>
              • {tip as string}
            </Text>
          ))}
          {[thisWeek.cancelRate > 15, thisWeek.completionRate < 60 && thisWeek.assigned > 3, rating !== null && rating < 4.0, thisWeek.assigned === 0, thisWeek.assigned > 0 && thisWeek.cancelRate <= 5 && thisWeek.completionRate >= 80].every(v => !v) && (
            <Text style={{ fontSize: 12, color: "#A5B4FC", fontFamily: "Inter_400Regular" }}>• Sab theek chal raha hai! Aise hi karte raho 💪</Text>
          )}
        </Animated.View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(50)} style={styles.header}>
          <Text style={styles.title}>
            {activeTab === "earnings" ? `💵 ${t("earnings")}` : activeTab === "ratings" ? "⭐ Meri Ratings" : "📊 Performance"}
          </Text>
          <Text style={styles.subtitle}>
            {activeTab === "earnings" ? t("earnings_subtitle") : activeTab === "ratings" ? "Recent ratings aur average dekho" : "Acceptance rate, cancel rate, weekly data"}
          </Text>
        </Animated.View>

        {/* Tab Bar */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "earnings" && styles.tabBtnActive]}
            onPress={() => setActiveTab("earnings")}
          >
            <Text style={[styles.tabBtnText, activeTab === "earnings" && styles.tabBtnTextActive]}>
              💵 Kamaai
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "ratings" && styles.tabBtnActive]}
            onPress={() => setActiveTab("ratings")}
          >
            <Text style={[styles.tabBtnText, activeTab === "ratings" && styles.tabBtnTextActive]}>
              ⭐ Ratings
              {ratingsData?.ratingCount ? ` (${ratingsData.ratingCount})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "performance" && styles.tabBtnActive]}
            onPress={() => setActiveTab("performance")}
          >
            <Text style={[styles.tabBtnText, activeTab === "performance" && styles.tabBtnTextActive]}>
              📊 Stats
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "earnings" ? renderEarningsTab() : activeTab === "ratings" ? renderRatingsTab() : renderPerformanceTab()}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
