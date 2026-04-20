import React, { useState, useEffect, useCallback } from "react";
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
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotification } from "@/context/NotificationContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RazorpayWebView } from "@/components/RazorpayWebView";
import { paymentApi, type RazorpayOrder } from "@/lib/paymentApi";
import { BASE_URL } from "@/lib/api";

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

interface Transaction {
  id: number;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

export function WalletScreen() {
  const colors = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { t, lang } = useLanguage();
  const { showNotification } = useNotification();

  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState("");
  const [showTopup, setShowTopup] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [razorpayOrder, setRazorpayOrder] = useState<RazorpayOrder | null>(null);
  const [showRazorpay, setShowRazorpay] = useState(false);

  const balanceScale = useSharedValue(1);
  const balanceStyle = useAnimatedStyle(() => ({ transform: [{ scale: balanceScale.value }] }));

  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";

  const fetchWallet = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [balRes, txnRes] = await Promise.all([
        fetch(`${BASE_URL}wallet/balance`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BASE_URL}wallet/transactions`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const balData = await balRes.json();
      const txnData = await txnRes.json();
      if (balData.success) setBalance(balData.balance);
      if (txnData.success) setTransactions(txnData.transactions);
    } catch { }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const handlePayNow = async () => {
    const amt = Number(topupAmount);
    if (!amt || amt < 10 || amt > 50000) {
      showNotification({
        title: "Amount galat hai",
        body: "₹10 se ₹50,000 ke beech amount daalen",
        type: "error",
        icon: "❌",
      });
      return;
    }

    try {
      setCreatingOrder(true);
      const order = await paymentApi.createOrder(amt);
      setRazorpayOrder(order);
      setShowRazorpay(true);
    } catch (err) {
      showNotification({ title: "Order create nahi hua", body: "Dobara try karein", type: "error", icon: "❌" });
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleRazorpaySuccess = async (data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => {
    setShowRazorpay(false);
    const amt = Number(topupAmount);
    try {
      const res = await fetch(`${BASE_URL}wallet/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: amt,
          method: "razorpay",
          paymentId: data.razorpay_payment_id,
          orderId: data.razorpay_order_id,
        }),
      });
      const result = await res.json();
      if (result.success) {
        balanceScale.value = withSpring(1.18, {}, () => { balanceScale.value = withSpring(1); });
        setBalance(result.newBalance);
        setTopupAmount("");
        setShowTopup(false);
        setRazorpayOrder(null);
        await fetchWallet();
        showNotification({ title: `₹${amt} Add Ho Gaye! 🎉`, body: t("topup_success"), type: "success", icon: "💰" });
      } else {
        showNotification({ title: "Top-up failed", body: result.error ?? "Kuch galat hua", type: "error", icon: "❌" });
      }
    } catch {
      showNotification({ title: "Network Error", body: "Dobara try karein", type: "error", icon: "📵" });
    }
  };

  const handleRazorpayDismiss = () => {
    setShowRazorpay(false);
    setRazorpayOrder(null);
    showNotification({ title: "Payment cancel hua", body: "Koi baat nahi, dobara try kar sakte hain", type: "info", icon: "ℹ️" });
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: topPad },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontFamily: "Inter_400Regular" },
    balanceCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 20, padding: 28, alignItems: "center", overflow: "hidden" },
    balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 8, fontFamily: "Inter_400Regular" },
    balanceAmount: { fontSize: 48, fontWeight: "800", color: "#fff", fontFamily: "Inter_700Bold" },
    balanceSub: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 6, fontFamily: "Inter_400Regular" },
    actionRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 20 },
    actionBtn: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border },
    actionBtnText: { fontSize: 13, fontWeight: "600", marginTop: 4, fontFamily: "Inter_600SemiBold" },
    topupBox: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 14, fontFamily: "Inter_700Bold" },
    quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    quickChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
    quickChipText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    input: { borderRadius: 12, padding: 14, fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 16, borderWidth: 1, fontFamily: "Inter_400Regular" },
    txnCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    txnLeft: { flex: 1 },
    txnDesc: { fontSize: 13, color: colors.text, fontFamily: "Inter_500Medium" },
    txnDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },
    txnAmt: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
    emptyText: { textAlign: "center", color: colors.textSecondary, fontSize: 14, marginTop: 20, fontFamily: "Inter_400Regular" },
    label: { fontSize: 12, color: colors.textSecondary, marginBottom: 6, fontFamily: "Inter_500Medium" },
    rzpBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderWidth: 1, borderColor: colors.border },
    rzpBadgeText: { fontSize: 12, color: colors.textSecondary, fontFamily: "Inter_400Regular" },
  });

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <View style={s.container}>
      {razorpayOrder && (
        <RazorpayWebView
          visible={showRazorpay}
          order={razorpayOrder}
          userInfo={{
            name: user?.name ?? "RaftaarRide User",
            email: user?.email ?? undefined,
            phone: user?.phone ?? undefined,
          }}
          onSuccess={handleRazorpaySuccess}
          onDismiss={handleRazorpayDismiss}
        />
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(50)} style={s.header}>
          <Text style={s.title}>💰 {t("wallet")}</Text>
          <Text style={s.subtitle}>{t("your_wallet")}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={[s.balanceCard, { backgroundColor: colors.primary }]}>
          <Animated.View style={balanceStyle}>
            <Text style={s.balanceLabel}>{t("wallet_balance")}</Text>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={s.balanceAmount}>₹{balance.toFixed(2)}</Text>
            )}
            <Text style={s.balanceSub}>{t("use_for_ride")}</Text>
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150)} style={s.actionRow}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: showTopup ? colors.primary + "22" : colors.glassBackground }]}
            onPress={() => setShowTopup(!showTopup)}
          >
            <Text style={{ fontSize: 22 }}>➕</Text>
            <Text style={[s.actionBtnText, { color: colors.primary }]}>{t("add_money")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: colors.glassBackground }]}
            onPress={() => showNotification({ title: t("use_on_ride_title"), body: t("use_on_ride_body"), type: "info", icon: "ℹ️" })}
          >
            <Text style={{ fontSize: 22 }}>🚗</Text>
            <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>{t("use_on_ride_btn")}</Text>
          </TouchableOpacity>
        </Animated.View>

        {showTopup && (
          <Animated.View entering={FadeInUp.duration(300)}>
            <GlassCard style={s.topupBox}>
              <Text style={s.sectionTitle}>{t("recharge_wallet")}</Text>

              <Text style={s.label}>{t("select_quick_amt")}</Text>
              <View style={s.quickRow}>
                {QUICK_AMOUNTS.map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[s.quickChip, {
                      backgroundColor: topupAmount === String(a) ? colors.primary + "33" : inputBg,
                      borderColor: topupAmount === String(a) ? colors.primary : inputBorder,
                    }]}
                    onPress={() => setTopupAmount(String(a))}
                  >
                    <Text style={[s.quickChipText, { color: topupAmount === String(a) ? colors.primary : colors.text }]}>
                      ₹{a}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t("custom_amount")}</Text>
              <TextInput
                style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder="e.g. 350"
                placeholderTextColor={colors.textSecondary}
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="numeric"
              />

              <View style={s.rzpBadge}>
                <Text style={{ fontSize: 14 }}>🔒</Text>
                <Text style={s.rzpBadgeText}>Secured by Razorpay — UPI, Card, Net Banking supported</Text>
              </View>

              <PrimaryButton
                title={creatingOrder ? t("processing") : `⚡ ₹${topupAmount || "0"} ${t("add_money")}`}
                onPress={handlePayNow}
                disabled={creatingOrder || !topupAmount}
              />
            </GlassCard>
          </Animated.View>
        )}

        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={s.sectionTitle}>💳 {t("transaction_history")}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : transactions.length === 0 ? (
          <Text style={s.emptyText}>{t("no_transactions")}</Text>
        ) : (
          transactions.map((txn, i) => (
            <Animated.View key={txn.id} entering={FadeInDown.delay(i * 40)}>
              <GlassCard style={s.txnCard}>
                <View style={s.txnLeft}>
                  <Text style={s.txnDesc}>{txn.description}</Text>
                  <Text style={s.txnDate}>{formatDate(txn.createdAt)}</Text>
                </View>
                <Text style={[s.txnAmt, { color: Number(txn.amount) >= 0 ? "#4ADE80" : "#F87171" }]}>
                  {Number(txn.amount) >= 0 ? "+" : ""}₹{Math.abs(Number(txn.amount)).toFixed(2)}
                </Text>
              </GlassCard>
            </Animated.View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
