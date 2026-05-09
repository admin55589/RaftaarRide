import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { RazorpayWebView } from "@/components/RazorpayWebView";
import type { RazorpayOrder } from "@/lib/paymentApi";
import { BASE_URL } from "@/lib/api";

const BENEFITS = [
  {
    icon: "🚫",
    title: "5 Free Cancellations / Month",
    desc: "Cancel bina fee ke — ₹30–50 per cancel bachao",
    highlight: true,
  },
  {
    icon: "⚡",
    title: "Priority Booking — Peak Hours",
    desc: "Rush hour mein bhi pehle driver mile, zyada wait nahi",
    highlight: false,
  },
  {
    icon: "⏱️",
    title: "Extended Grace Period",
    desc: "Cancel karo 5 min tak — bina penalty (normal: 2 min)",
    highlight: false,
  },
  {
    icon: "🏆",
    title: "Pass Member Badge",
    desc: "Profile mein exclusive 'Pass Member' badge dikhe",
    highlight: false,
  },
  {
    icon: "💰",
    title: "Savings Every Month",
    desc: "Sirf 5 free cancels = ₹150–250 bachta hai easily",
    highlight: false,
  },
];

function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default function RaftaarPassScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { token, user } = useAuth();
  const { setScreen, passStatus, refreshPassStatus } = useApp();

  const [loading, setLoading] = useState(false);
  const [razorpayOrder, setRazorpayOrder] = useState<RazorpayOrder | null>(null);
  const [showWebView, setShowWebView] = useState(false);

  const isActive = passStatus?.active;

  const handleSubscribe = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/pass/create-order`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json() as { success: boolean; orderId?: string; amount?: number; keyId?: string; currency?: string; error?: string };
      if (!res.ok || !data.orderId) {
        Alert.alert("Oops!", data.error ?? "Order banana mein dikkat.");
        return;
      }
      setRazorpayOrder({
        orderId: data.orderId,
        amount: data.amount!,
        currency: data.currency ?? "INR",
        keyId: data.keyId!,
      });
      setShowWebView(true);
    } catch {
      Alert.alert("Connection Error", "Internet check karein aur dobara try karein.");
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    setShowWebView(false);
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/pass/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: paymentData.razorpay_order_id,
          paymentId: paymentData.razorpay_payment_id,
          signature: paymentData.razorpay_signature,
        }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        await refreshPassStatus(token);
        Alert.alert(
          "🎉 RaftaarPass Active!",
          "30 din ke liye aapka pass activate ho gaya.\n\n✅ 5 free cancellations\n⚡ Priority booking\n⏱️ 5-min grace period",
          [{ text: "Done", style: "default" }]
        );
      } else {
        Alert.alert("Payment Issue", data.error ?? "Pass activate nahi hua. Support se contact karein.");
      }
    } catch {
      Alert.alert("Error", "Pass verify nahi ho paya. Support se contact karein.");
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingTop: insets.top + 12,
      paddingBottom: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: colors.card,
      alignItems: "center", justifyContent: "center",
    },
    backText: { fontSize: 18, color: colors.text },
    headerTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
    scroll: { flex: 1 },
    heroCard: {
      marginHorizontal: 16,
      marginTop: 4,
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      backgroundColor: "#F5A623",
      overflow: "hidden",
    },
    heroEmoji: { fontSize: 48, marginBottom: 8 },
    heroTitle: { fontSize: 28, fontWeight: "900", color: "#000", letterSpacing: -0.5 },
    heroSubtitle: { fontSize: 15, color: "#333", marginTop: 4, textAlign: "center" },
    priceRow: {
      flexDirection: "row", alignItems: "flex-end", marginTop: 14,
    },
    currency: { fontSize: 18, fontWeight: "700", color: "#000", marginBottom: 4 },
    price: { fontSize: 52, fontWeight: "900", color: "#000", lineHeight: 56 },
    period: { fontSize: 16, color: "#333", marginBottom: 8 },
    activeCard: {
      marginHorizontal: 16,
      marginTop: 4,
      borderRadius: 20,
      padding: 20,
      backgroundColor: "#1a2a1a",
      borderWidth: 1.5,
      borderColor: "#4CAF50",
    },
    activeTitle: { fontSize: 16, fontWeight: "700", color: "#4CAF50", marginBottom: 12 },
    activeRow: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      marginBottom: 8,
    },
    activeLabel: { fontSize: 14, color: colors.mutedForeground },
    activeValue: { fontSize: 14, fontWeight: "600", color: colors.text },
    cancelBar: {
      marginTop: 12,
      height: 8,
      backgroundColor: colors.muted,
      borderRadius: 4,
      overflow: "hidden",
    },
    cancelFill: {
      height: "100%",
      backgroundColor: "#F5A623",
      borderRadius: 4,
    },
    cancelLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 4,
    },
    section: { marginTop: 24, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
    benefitCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: "transparent",
    },
    benefitCardHighlight: {
      borderColor: "#F5A623",
      backgroundColor: "rgba(245,166,35,0.07)",
    },
    benefitEmoji: { fontSize: 24, width: 32, textAlign: "center" },
    benefitContent: { flex: 1 },
    benefitTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
    benefitDesc: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    faqSection: { marginTop: 8, paddingHorizontal: 16, marginBottom: 8 },
    faqItem: { marginBottom: 12 },
    faqQ: { fontSize: 13, fontWeight: "600", color: colors.text },
    faqA: { fontSize: 12, color: colors.mutedForeground, marginTop: 3, lineHeight: 18 },
    bottomBar: {
      paddingHorizontal: 16,
      paddingBottom: insets.bottom + 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    subscribeBtn: {
      backgroundColor: "#F5A623",
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
    },
    subscribeBtnText: { fontSize: 17, fontWeight: "800", color: "#000" },
    subscribeBtnSub: { fontSize: 12, color: "#333", marginTop: 2 },
    alreadyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginTop: 8 },
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen("home")}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RaftaarPass</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero / Pricing Card */}
        {!isActive && (
          <View style={styles.heroCard}>
            <Text style={styles.heroEmoji}>🛡️</Text>
            <Text style={styles.heroTitle}>RaftaarPass</Text>
            <Text style={styles.heroSubtitle}>Raftaar se chalo, tension chhodo</Text>
            <View style={styles.priceRow}>
              <Text style={styles.currency}>₹</Text>
              <Text style={styles.price}>149</Text>
              <Text style={styles.period}>/month</Text>
            </View>
          </View>
        )}

        {/* Active Pass Card */}
        {isActive && passStatus && (
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>✅ RaftaarPass Active</Text>
            <View style={styles.activeRow}>
              <Text style={styles.activeLabel}>Valid Till</Text>
              <Text style={styles.activeValue}>
                {passStatus.expiresAt
                  ? `${new Date(passStatus.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} (${daysLeft(passStatus.expiresAt)} days)`
                  : "—"}
              </Text>
            </View>
            <View style={styles.activeRow}>
              <Text style={styles.activeLabel}>Free Cancels</Text>
              <Text style={styles.activeValue}>
                {passStatus.freeCancelsRemaining ?? 0} / {passStatus.freeCancelsLimit ?? 5} remaining
              </Text>
            </View>
            <View style={styles.cancelBar}>
              <View
                style={[
                  styles.cancelFill,
                  {
                    width: `${(((passStatus.freeCancelsRemaining ?? 0) / (passStatus.freeCancelsLimit ?? 5)) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.cancelLabel}>
              {passStatus.freeCancelsUsed ?? 0} cancels used this month
            </Text>
          </View>
        )}

        {/* Benefits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isActive ? "Aapke Benefits" : "Pass ke saath milta hai"}
          </Text>
          {BENEFITS.map((b, i) => (
            <View
              key={i}
              style={[styles.benefitCard, b.highlight && styles.benefitCardHighlight]}
            >
              <Text style={styles.benefitEmoji}>{b.icon}</Text>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* FAQ */}
        {!isActive && (
          <View style={styles.faqSection}>
            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Common Questions</Text>
            {[
              {
                q: "Kya auto-renew hota hai?",
                a: "Nahi! Ek baar pay karo, 30 din chalega. Renew karna aapki marzi.",
              },
              {
                q: "5 free cancels poore ho gaye toh?",
                a: "Normal cancel fee lagegi (₹30–50), jaisi bina pass ke lagti hai.",
              },
              {
                q: "Cancel karna chahte ho?",
                a: "Pass expire ho jaayega automatically 30 din mein. Refund policy apply nahi hoti active pass pe.",
              },
              {
                q: "Priority booking kaise kaam karta hai?",
                a: "Rush hours mein aapki ride request pehle drivers ko dikhti hai — jaldi driver milta hai.",
              },
            ].map((faq, i) => (
              <View key={i} style={styles.faqItem}>
                <Text style={styles.faqQ}>Q: {faq.q}</Text>
                <Text style={styles.faqA}>{faq.a}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Bottom CTA */}
      {!isActive && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.subscribeBtn}
            onPress={handleSubscribe}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.subscribeBtnText}>Get RaftaarPass — ₹149/mo</Text>
                <Text style={styles.subscribeBtnSub}>Secure payment via Razorpay</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.alreadyText}>Cancel karo jab chaaho • No auto-renew</Text>
        </View>
      )}

      {isActive && (
        <View style={styles.bottomBar}>
          <View style={[styles.subscribeBtn, { backgroundColor: "#4CAF50" }]}>
            <Text style={styles.subscribeBtnText}>🛡️ Pass Active — Enjoy!</Text>
            <Text style={[styles.subscribeBtnSub, { color: "#000" }]}>
              Ride karo bina tension ke
            </Text>
          </View>
        </View>
      )}

      {/* Razorpay WebView */}
      {razorpayOrder && (
        <RazorpayWebView
          visible={showWebView}
          order={razorpayOrder}
          userInfo={{
            name: user?.name ?? "RaftaarRide User",
            email: user?.email ?? undefined,
            phone: user?.phone,
          }}
          onSuccess={handlePaymentSuccess}
          onDismiss={() => setShowWebView(false)}
        />
      )}
    </View>
  );
}
