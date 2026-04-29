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

const COMMISSION_RATE = 0.067;
const DRIVER_SHARE = 1 - COMMISSION_RATE;

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

export function DriverEarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { driverToken } = useDriverAuth();
  const { t, lang } = useLanguage();
  const { showNotification } = useNotification();

  const [balance, setBalance] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [transactions, setTransactions] = useState<TxnItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalReq[]>([]);
  const [loading, setLoading] = useState(true);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("upi");
  const [accountDetails, setAccountDetails] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchWallet = async () => {
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
  };

  useEffect(() => { fetchWallet(); }, [driverToken]);

  const handleWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt < 100) {
      showNotification({ title: t("account_invalid"), body: t("min_amount"), type: "error", icon: "❌" });
      return;
    }
    if (amt > balance) {
      showNotification({ title: t("account_invalid"), body: `₹${balance.toFixed(2)} available`, type: "error", icon: "❌" });
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
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontFamily: "Inter_400Regular" },
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

  const QUICK_AMTS = [200, 500, 1000, 2000];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(50)} style={styles.header}>
          <Text style={styles.title}>💵 {t("earnings")}</Text>
          <Text style={styles.subtitle}>{t("earnings_subtitle")}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={styles.statsRow}>
          <GlassCard style={styles.statCard}>
            <Text style={styles.statValue}>₹{(totalEarnings * DRIVER_SHARE).toFixed(0)}</Text>
            <Text style={styles.statLabel}>{t("total_earned")}</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={[styles.statValue, { color: "#F87171" }]}>₹{(totalEarnings * COMMISSION_RATE).toFixed(0)}</Text>
            <Text style={styles.statLabel}>{t("commission_label")}</Text>
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120)} style={[styles.balanceCard, { backgroundColor: "#16A34A" }]}>
          <Text style={styles.balanceLabel}>{t("withdrawable_balance")}</Text>
          {loading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
          )}
          <Text style={styles.commissionNote}>{t("commission_note")}</Text>

          <TouchableOpacity
            style={[styles.withdrawBtn, {
              backgroundColor: showWithdraw ? "rgba(255,255,255,0.12)" : "#fff",
            }]}
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
                              ? "Cash Ride Commission"
                              : txn.type === "withdrawal" ? "Withdrawal"
                              : txn.type === "credit" ? "Admin Credit"
                              : "Ride Earning"}
                          </Text>
                          <Text style={[styles.wDate, { marginTop: 2 }]} numberOfLines={1}>{formatDate(txn.createdAt)}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.wAmt, {
                          color: isDebit ? "#F87171" : "#4ADE80",
                          fontSize: 15,
                        }]}>
                          {isDebit ? "-" : "+"}₹{Math.abs(amt).toFixed(2)}
                        </Text>
                        {isCashCommission && (
                          <View style={{ backgroundColor: "rgba(245,166,35,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 }}>
                            <Text style={{ color: "#F5A623", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>6.7% Cash</Text>
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
                    {WITHDRAWAL_METHODS.find((m) => m.id === w.method)?.icon ?? "💰"} {WITHDRAWAL_METHODS.find((m) => m.id === w.method)?.label ?? w.method}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: statusColors[w.status] ?? "#6B7280" }]}>
                    <Text style={styles.badgeText}>{w.status.charAt(0).toUpperCase() + w.status.slice(1)}</Text>
                  </View>
                </View>
                <View style={styles.wRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <LiveCalendarIcon size="sm" primaryColor="#F5A623" bgColor="#fff" />
                    <Text style={styles.wDate}>{formatDate(w.createdAt)}</Text>
                  </View>
                  <Text style={[styles.wAmt, { color: "#4ADE80" }]}>₹{Number(w.amount).toFixed(2)}</Text>
                </View>
                <Text style={[styles.wDate, { marginTop: 4 }]} numberOfLines={1}>{w.accountDetails}</Text>
                {w.transactionRef && (
                  <Text style={styles.wRef}>🔗 Ref: {w.transactionRef}</Text>
                )}
                {w.rejectionReason && (
                  <Text style={[styles.wDate, { color: "#F87171", marginTop: 4 }]}>❌ {w.rejectionReason}</Text>
                )}
              </GlassCard>
            </Animated.View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
