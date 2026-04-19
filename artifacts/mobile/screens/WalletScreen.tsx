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
  Modal,
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
  const { isDark } = useTheme();
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

  const [upiId, setUpiId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");

  const [showPayModal, setShowPayModal] = useState(false);
  const [payStep, setPayStep] = useState<"idle" | "processing" | "done">("idle");

  const balanceScale = useSharedValue(1);
  const balanceStyle = useAnimatedStyle(() => ({ transform: [{ scale: balanceScale.value }] }));

  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";

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

  const validatePaymentDetails = () => {
    if (selectedMethod === "upi" || selectedMethod === "paytm") {
      if (!upiId.includes("@")) {
        showNotification({ title: lang === "hi" ? "UPI ID galat hai" : "Invalid UPI ID", body: "example@upi format mein daalen", type: "error", icon: "❌" });
        return false;
      }
    }
    if (selectedMethod === "card") {
      if (cardNumber.replace(/\s/g, "").length < 16) {
        showNotification({ title: lang === "hi" ? "Card number galat" : "Invalid card number", body: "16-digit card number daalen", type: "error", icon: "❌" });
        return false;
      }
      if (!cardExpiry.includes("/")) {
        showNotification({ title: lang === "hi" ? "Expiry galat" : "Invalid expiry", body: "MM/YY format mein daalen", type: "error", icon: "❌" });
        return false;
      }
      if (cardCvv.length < 3) {
        showNotification({ title: lang === "hi" ? "CVV galat" : "Invalid CVV", body: "3-digit CVV daalen", type: "error", icon: "❌" });
        return false;
      }
    }
    if (selectedMethod === "netbanking") {
      if (bankAccount.length < 8) {
        showNotification({ title: lang === "hi" ? "Account number galat" : "Invalid account number", body: "Account number daalen", type: "error", icon: "❌" });
        return false;
      }
      if (bankIfsc.length < 11) {
        showNotification({ title: lang === "hi" ? "IFSC code galat" : "Invalid IFSC", body: "11-character IFSC daalen", type: "error", icon: "❌" });
        return false;
      }
    }
    return true;
  };

  const handlePayNow = async () => {
    const amt = Number(topupAmount);
    if (!amt || amt < 10 || amt > 50000) {
      showNotification({ title: "Invalid Amount", body: "₹10 se ₹50,000 ke beech amount daalen", type: "error", icon: "❌" });
      return;
    }
    if (!validatePaymentDetails()) return;

    setShowPayModal(true);
    setPayStep("processing");

    await new Promise((r) => setTimeout(r, 2200));

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
        setPayStep("done");
        await fetchWallet();

        setTimeout(() => {
          setShowPayModal(false);
          setPayStep("idle");
          setShowTopup(false);
          setUpiId(""); setCardNumber(""); setCardExpiry(""); setCardCvv(""); setBankAccount(""); setBankIfsc("");
        }, 1800);

        showNotification({ title: "₹" + amt + " Add Ho Gaye! 🎉", body: lang === "hi" ? "Aapka wallet top-up successful!" : "Wallet top-up successful!", type: "success", icon: "💰" });
      } else {
        setPayStep("idle");
        setShowPayModal(false);
        showNotification({ title: "Top-up Failed", body: data.error ?? "Kuch galat hua", type: "error", icon: "❌" });
      }
    } catch {
      setPayStep("idle");
      setShowPayModal(false);
      showNotification({ title: "Network Error", body: "Dobara try karein", type: "error", icon: "📵" });
    } finally { setTopping(false); }
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
    input: { borderRadius: 12, padding: 14, fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 12, borderWidth: 1, fontFamily: "Inter_400Regular" },
    inputSmall: { borderRadius: 12, padding: 12, fontSize: 14, color: colors.text, borderWidth: 1, fontFamily: "Inter_400Regular" },
    methodRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    methodChip: { flex: 1, alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1 },
    methodIcon: { fontSize: 18, marginBottom: 3 },
    methodLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
    txnCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    txnLeft: { flex: 1 },
    txnDesc: { fontSize: 13, color: colors.text, fontFamily: "Inter_500Medium" },
    txnDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },
    txnAmt: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
    emptyText: { textAlign: "center", color: colors.textSecondary, fontSize: 14, marginTop: 20, fontFamily: "Inter_400Regular" },
    label: { fontSize: 12, color: colors.textSecondary, marginBottom: 6, fontFamily: "Inter_500Medium" },
    row2: { flexDirection: "row", gap: 10, marginBottom: 12 },
  });

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const renderPaymentDetails = () => {
    if (selectedMethod === "upi" || selectedMethod === "paytm") {
      return (
        <>
          <Text style={s.label}>{lang === "hi" ? "UPI ID daalen:" : "Enter UPI ID:"}</Text>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
            placeholder={selectedMethod === "paytm" ? "9876543210@paytm" : "name@upi"}
            placeholderTextColor={colors.textSecondary}
            value={upiId}
            onChangeText={setUpiId}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </>
      );
    }
    if (selectedMethod === "card") {
      return (
        <>
          <Text style={s.label}>{lang === "hi" ? "Card Number:" : "Card Number:"}</Text>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
            placeholder="4111 1111 1111 1111"
            placeholderTextColor={colors.textSecondary}
            value={cardNumber}
            onChangeText={(t) => setCardNumber(t.replace(/[^0-9]/g, "").replace(/(.{4})/g, "$1 ").trim())}
            keyboardType="numeric"
            maxLength={19}
          />
          <View style={s.row2}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{lang === "hi" ? "Expiry (MM/YY):" : "Expiry (MM/YY):"}</Text>
              <TextInput
                style={[s.inputSmall, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder="12/27"
                placeholderTextColor={colors.textSecondary}
                value={cardExpiry}
                onChangeText={(t) => {
                  const clean = t.replace(/[^0-9]/g, "");
                  setCardExpiry(clean.length > 2 ? `${clean.slice(0, 2)}/${clean.slice(2, 4)}` : clean);
                }}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>CVV:</Text>
              <TextInput
                style={[s.inputSmall, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder="***"
                placeholderTextColor={colors.textSecondary}
                value={cardCvv}
                onChangeText={setCardCvv}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>
          </View>
        </>
      );
    }
    if (selectedMethod === "netbanking") {
      return (
        <>
          <Text style={s.label}>{lang === "hi" ? "Account Number:" : "Account Number:"}</Text>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
            placeholder="00112345678901"
            placeholderTextColor={colors.textSecondary}
            value={bankAccount}
            onChangeText={setBankAccount}
            keyboardType="numeric"
          />
          <Text style={s.label}>IFSC Code:</Text>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
            placeholder="SBIN0001234"
            placeholderTextColor={colors.textSecondary}
            value={bankIfsc}
            onChangeText={(t) => setBankIfsc(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={11}
          />
        </>
      );
    }
    return null;
  };

  return (
    <View style={s.container}>
      <Modal visible={showPayModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center" }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 36, alignItems: "center", width: 300 }}>
            {payStep === "processing" ? (
              <>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 20, fontFamily: "Inter_700Bold" }}>
                  {lang === "hi" ? "Payment Process ho rahi hai..." : "Processing Payment..."}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8, textAlign: "center", fontFamily: "Inter_400Regular" }}>
                  {METHODS.find(m => m.id === selectedMethod)?.icon} {lang === "hi" ? "Kripya wait karein" : "Please wait"}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 56 }}>✅</Text>
                <Text style={{ color: colors.success, fontSize: 20, fontWeight: "700", marginTop: 12, fontFamily: "Inter_700Bold" }}>
                  {lang === "hi" ? "Payment Successful!" : "Payment Successful!"}
                </Text>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 8, fontFamily: "Inter_700Bold" }}>
                  ₹{topupAmount}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6, fontFamily: "Inter_400Regular" }}>
                  {lang === "hi" ? "Wallet mein add ho gaya" : "Added to wallet"}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(50)} style={s.header}>
          <Text style={s.title}>💰 {t("wallet")}</Text>
          <Text style={s.subtitle}>{lang === "hi" ? "Aapka RaftaarRide Wallet" : "Your RaftaarRide Wallet"}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={[s.balanceCard, { backgroundColor: colors.primary }]}>
          <Animated.View style={balanceStyle}>
            <Text style={s.balanceLabel}>{t("wallet_balance")}</Text>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={s.balanceAmount}>₹{balance.toFixed(2)}</Text>
            )}
            <Text style={s.balanceSub}>{lang === "hi" ? "Kisi bhi ride mein use karein" : "Use for any ride"}</Text>
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
            onPress={() => showNotification({ title: lang === "hi" ? "Ride Karo" : "Go Ride", body: lang === "hi" ? "Wallet se payment ride mein auto-deduct hoti hai" : "Wallet balance is auto-deducted during rides", type: "info", icon: "ℹ️" })}
          >
            <Text style={{ fontSize: 22 }}>🚗</Text>
            <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>{lang === "hi" ? "Ride pe Use Karo" : "Use on Ride"}</Text>
          </TouchableOpacity>
        </Animated.View>

        {showTopup && (
          <Animated.View entering={FadeInUp.duration(300)}>
            <GlassCard style={s.topupBox}>
              <Text style={s.sectionTitle}>{lang === "hi" ? "💳 Wallet Recharge Karein" : "💳 Recharge Wallet"}</Text>

              <Text style={s.label}>{lang === "hi" ? "Quick amount select karein:" : "Select quick amount:"}</Text>
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

              <Text style={s.label}>{lang === "hi" ? "Ya custom amount daalen (₹10 – ₹50,000):" : "Or enter custom amount (₹10 – ₹50,000):"}</Text>
              <TextInput
                style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder="e.g. 350"
                placeholderTextColor={colors.textSecondary}
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="numeric"
              />

              <Text style={s.label}>{lang === "hi" ? "Payment Method chunein:" : "Choose Payment Method:"}</Text>
              <View style={s.methodRow}>
                {METHODS.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[s.methodChip, {
                      backgroundColor: selectedMethod === m.id ? colors.primary + "22" : inputBg,
                      borderColor: selectedMethod === m.id ? colors.primary : inputBorder,
                    }]}
                    onPress={() => setSelectedMethod(m.id)}
                  >
                    <Text style={s.methodIcon}>{m.icon}</Text>
                    <Text style={[s.methodLabel, { color: selectedMethod === m.id ? colors.primary : colors.textSecondary }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {renderPaymentDetails()}

              <PrimaryButton
                title={topping ? (lang === "hi" ? "Process ho raha hai..." : "Processing...") : (lang === "hi" ? `₹${topupAmount || "0"} Pay Karein` : `Pay ₹${topupAmount || "0"}`)}
                onPress={handlePayNow}
                disabled={topping || !topupAmount}
              />
            </GlassCard>
          </Animated.View>
        )}

        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={s.sectionTitle}>💳 {lang === "hi" ? "Transaction History" : "Transaction History"}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : transactions.length === 0 ? (
          <Text style={s.emptyText}>{lang === "hi" ? "Koi transaction nahi abhi tak" : "No transactions yet"}</Text>
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
