import React, { useState, useEffect } from "react";
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
import { useNotification } from "@/context/NotificationContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BASE_URL } from "@/lib/api";

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];
const METHODS = [
  { id: "upi", label: "UPI", icon: "📲" },
  { id: "paytm", label: "Paytm", icon: "💙" },
  { id: "card", label: "Card", icon: "💳" },
  { id: "netbanking", label: "Net Banking", icon: "🏦" },
];

interface Transaction {
  id: number;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

export function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const { showNotification } = useNotification();

  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("upi");
  const [topping, setTopping] = useState(false);
  const [showTopup, setShowTopup] = useState(false);

  const balanceScale = useSharedValue(1);
  const balanceStyle = useAnimatedStyle(() => ({ transform: [{ scale: balanceScale.value }] }));

  const fetchWallet = async () => {
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
  };

  useEffect(() => { fetchWallet(); }, [token]);

  const handleTopup = async () => {
    const amt = Number(topupAmount);
    if (!amt || amt < 10 || amt > 50000) {
      showNotification({ title: "Invalid Amount", body: "₹10 se ₹50,000 ke beech amount daalen", type: "error", icon: "❌" });
      return;
    }
    setTopping(true);
    try {
      const res = await fetch(`${BASE_URL}wallet/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, method: selectedMethod }),
      });
      const data = await res.json();
      if (data.success) {
        balanceScale.value = withSpring(1.2, {}, () => { balanceScale.value = withSpring(1); });
        setBalance(data.newBalance);
        setTopupAmount("");
        setShowTopup(false);
        await fetchWallet();
        showNotification({ title: "₹" + amt + " Add Ho Gaye! 🎉", body: "Aapka wallet top-up successful!", type: "success", icon: "💰" });
      } else {
        showNotification({ title: "Top-up Failed", body: data.error ?? "Kuch galat hua", type: "error", icon: "❌" });
      }
    } catch {
      showNotification({ title: "Network Error", body: "Dobara try karein", type: "error", icon: "📵" });
    } finally { setTopping(false); }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: topPad },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontFamily: "Inter_400Regular" },
    balanceCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 20, padding: 28, alignItems: "center", overflow: "hidden" },
    balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 8, fontFamily: "Inter_400Regular" },
    balanceAmount: { fontSize: 48, fontWeight: "800", color: "#fff", fontFamily: "Inter_700Bold" },
    balanceSub: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 6, fontFamily: "Inter_400Regular" },
    actionRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 20 },
    actionBtn: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
    actionBtnText: { fontSize: 13, fontWeight: "600", marginTop: 4, fontFamily: "Inter_600SemiBold" },
    topupBox: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 14, fontFamily: "Inter_700Bold" },
    quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    quickChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
    quickChipText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    input: { borderRadius: 12, padding: 14, fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 14, borderWidth: 1, fontFamily: "Inter_700Bold" },
    methodRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    methodChip: { flex: 1, alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1 },
    methodIcon: { fontSize: 20, marginBottom: 4 },
    methodLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
    txnCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    txnLeft: { flex: 1 },
    txnDesc: { fontSize: 13, color: colors.text, fontFamily: "Inter_500Medium" },
    txnDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },
    txnAmt: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
    emptyText: { textAlign: "center", color: colors.textSecondary, fontSize: 14, marginTop: 20, fontFamily: "Inter_400Regular" },
  });

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(50)} style={styles.header}>
          <Text style={styles.title}>💰 {t("wallet")}</Text>
          <Text style={styles.subtitle}>{lang === "hi" ? "Aapka RaftaarRide Wallet" : "Your RaftaarRide Wallet"}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
          <Animated.View style={balanceStyle}>
            <Text style={styles.balanceLabel}>{t("wallet_balance")}</Text>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
            )}
            <Text style={styles.balanceSub}>{lang === "hi" ? "Kisi bhi ride mein use karein" : "Use for any ride"}</Text>
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150)} style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: showTopup ? colors.primary + "33" : "rgba(255,255,255,0.06)" }]}
            onPress={() => setShowTopup(!showTopup)}
          >
            <Text style={{ fontSize: 22 }}>➕</Text>
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t("add_money")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "rgba(255,255,255,0.06)" }]}
            onPress={() => showNotification({ title: "Ride Karo", body: "Wallet se payment ride mein auto-deduct hoti hai", type: "info", icon: "ℹ️" })}
          >
            <Text style={{ fontSize: 22 }}>🚗</Text>
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>{lang === "hi" ? "Ride pe Use Karo" : "Use on Ride"}</Text>
          </TouchableOpacity>
        </Animated.View>

        {showTopup && (
          <Animated.View entering={FadeInUp.duration(300)}>
            <GlassCard style={styles.topupBox}>
              <Text style={styles.sectionTitle}>{lang === "hi" ? "Wallet Recharge Karein" : "Recharge Wallet"}</Text>

              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8, fontFamily: "Inter_400Regular" }}>
                {lang === "hi" ? "Quick amount select karein:" : "Select quick amount:"}
              </Text>
              <View style={styles.quickRow}>
                {QUICK_AMOUNTS.map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[styles.quickChip, {
                      backgroundColor: topupAmount === String(a) ? colors.primary + "33" : "rgba(255,255,255,0.06)",
                      borderColor: topupAmount === String(a) ? colors.primary : "rgba(255,255,255,0.12)",
                    }]}
                    onPress={() => setTopupAmount(String(a))}
                  >
                    <Text style={[styles.quickChipText, { color: topupAmount === String(a) ? colors.primary : colors.text }]}>
                      ₹{a}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.input, { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" }]}
                placeholder={lang === "hi" ? "Ya custom amount daalen..." : "Or enter custom amount..."}
                placeholderTextColor={colors.textSecondary}
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="numeric"
              />

              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8, fontFamily: "Inter_400Regular" }}>
                {lang === "hi" ? "Payment method:" : "Payment method:"}
              </Text>
              <View style={styles.methodRow}>
                {METHODS.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.methodChip, {
                      backgroundColor: selectedMethod === m.id ? colors.primary + "22" : "rgba(255,255,255,0.04)",
                      borderColor: selectedMethod === m.id ? colors.primary : "rgba(255,255,255,0.10)",
                    }]}
                    onPress={() => setSelectedMethod(m.id)}
                  >
                    <Text style={styles.methodIcon}>{m.icon}</Text>
                    <Text style={[styles.methodLabel, { color: selectedMethod === m.id ? colors.primary : colors.textSecondary }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <PrimaryButton
                title={topping ? (lang === "hi" ? "Process ho raha hai..." : "Processing...") : `${t("add_money")} ₹${topupAmount || "0"}`}
                onPress={handleTopup}
                disabled={topping || !topupAmount}
              />
            </GlassCard>
          </Animated.View>
        )}

        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>{lang === "hi" ? "💳 Transaction History" : "💳 Transaction History"}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : transactions.length === 0 ? (
          <Text style={styles.emptyText}>{lang === "hi" ? "Koi transaction nahi abhi tak" : "No transactions yet"}</Text>
        ) : (
          transactions.map((txn, i) => (
            <Animated.View key={txn.id} entering={FadeInDown.delay(i * 40)}>
              <GlassCard style={styles.txnCard}>
                <View style={styles.txnLeft}>
                  <Text style={styles.txnDesc}>{txn.description}</Text>
                  <Text style={styles.txnDate}>{formatDate(txn.createdAt)}</Text>
                </View>
                <Text style={[styles.txnAmt, { color: Number(txn.amount) >= 0 ? "#4ADE80" : "#F87171" }]}>
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
