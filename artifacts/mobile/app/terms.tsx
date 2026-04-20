import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

const EFFECTIVE_DATE = "20 April 2025";
const CONTACT_EMAIL = "admin.raftaarride@gmail.com";

const TERMS_SECTIONS = [
  {
    num: "1",
    title: "Service Overview",
    body: "RaftaarRide is a platform that connects riders (customers) with independent drivers for transportation services such as bike, auto, and cab rides.",
  },
  {
    num: "2",
    title: "User Eligibility",
    body: "• You must be at least 18 years old.\n• You must provide accurate personal information.\n• You are responsible for maintaining account security.",
  },
  {
    num: "3",
    title: "Booking & Payments",
    body: "• Ride fares are calculated based on distance, time, and demand.\n• Payments can be made via cash or online modes.\n• Cancellation charges may apply.",
  },
  {
    num: "4",
    title: "Driver Responsibility",
    body: "Drivers are independent partners, not employees. RaftaarRide is not responsible for driver behavior but will take strict action on complaints.",
  },
  {
    num: "5",
    title: "User Conduct",
    body: "You agree NOT to:\n• Misuse the app\n• Provide false bookings\n• Harass drivers or customers",
  },
  {
    num: "6",
    title: "Cancellations & Refunds",
    body: "• Cancellation charges may apply after booking confirmation.\n• Refunds (if applicable) will be processed within 5–7 working days.",
  },
  {
    num: "7",
    title: "Limitation of Liability",
    body: "RaftaarRide is a technology platform and is not liable for:\n• Delays in rides\n• Accidents or damages\n• Driver misconduct (though complaints are handled seriously)",
  },
  {
    num: "8",
    title: "Account Suspension",
    body: "We reserve the right to suspend or terminate accounts for:\n• Fraudulent activity\n• Misconduct\n• Violation of terms",
  },
  {
    num: "9",
    title: "Changes to Terms",
    body: "RaftaarRide may update these terms anytime. Continued use means acceptance of changes.",
  },
  {
    num: "10",
    title: "Contact Us",
    body: `Email: ${CONTACT_EMAIL}`,
  },
];

const PRIVACY_SECTIONS = [
  {
    num: "1",
    title: "Information We Collect",
    body: "We may collect:\n• Name, phone number, email\n• Location data (GPS for rides)\n• Payment details\n• Device information",
  },
  {
    num: "2",
    title: "How We Use Data",
    body: "• To provide ride services\n• To improve app performance\n• For safety and fraud prevention\n• Customer support",
  },
  {
    num: "3",
    title: "Location Data",
    body: "We collect real-time location to:\n• Match riders with drivers\n• Track rides\n• Ensure safety",
  },
  {
    num: "4",
    title: "Sharing of Information",
    body: "We may share data with:\n• Drivers (for ride completion)\n• Payment gateways\n• Legal authorities if required",
  },
  {
    num: "5",
    title: "Data Security",
    body: "We use industry-standard security measures to protect your data.",
  },
  {
    num: "6",
    title: "Cookies & Tracking",
    body: "We may use cookies and analytics tools to improve user experience.",
  },
  {
    num: "7",
    title: "User Rights",
    body: "You can:\n• Access your data\n• Request correction\n• Request account deletion",
  },
  {
    num: "8",
    title: "Data Retention",
    body: "We keep your data as long as necessary for service and legal compliance.",
  },
  {
    num: "9",
    title: "Children's Privacy",
    body: "Our app is not intended for users under 18 years.",
  },
  {
    num: "10",
    title: "Changes to Policy",
    body: "We may update this Privacy Policy periodically.",
  },
  {
    num: "11",
    title: "Contact Us",
    body: `Email: ${CONTACT_EMAIL}`,
  },
];

function Section({ num, title, body, colors }: { num: string; title: string; body: string; colors: ReturnType<typeof useColors> }) {
  return (
    <Animated.View entering={FadeInDown.delay(parseInt(num) * 40).springify()} style={[styles.section, { borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.numBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
          <Text style={[styles.numText, { color: colors.primary }]}>{num}</Text>
        </View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>{body}</Text>
    </Animated.View>
  );
}

export default function TermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">("terms");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 50) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 20) : insets.bottom;

  const sections = activeTab === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const heading = activeTab === "terms" ? "Terms & Conditions" : "Privacy Policy";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Legal</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>RaftaarRide</Text>
        </View>
      </View>

      {/* Tab Switcher */}
      <View style={[styles.tabRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
        {(["terms", "privacy"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tab,
              activeTab === tab && { backgroundColor: colors.primary, borderRadius: 10 },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? "#0A0A0F" : colors.mutedForeground }]}>
              {tab === "terms" ? "📋 Terms" : "🔒 Privacy"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 24 }]}
      >
        {/* Heading */}
        <View style={styles.heroBlock}>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>{heading}</Text>
          <Text style={[styles.heroDate, { color: colors.mutedForeground }]}>Effective Date: {EFFECTIVE_DATE}</Text>
          <Text style={[styles.heroDesc, { color: colors.mutedForeground }]}>
            {activeTab === "terms"
              ? "Welcome to RaftaarRide. By using our mobile application, you agree to the following terms."
              : "Your privacy is important to us. This policy explains how we collect, use, and protect your data."}
          </Text>
        </View>

        {/* Sections */}
        {sections.map((s) => (
          <Section key={s.num} {...s} colors={colors} />
        ))}

        {/* Footer */}
        <View style={[styles.footerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 24, marginBottom: 6 }}>🏍️</Text>
          <Text style={[styles.footerBrand, { color: colors.foreground }]}>RaftaarRide</Text>
          <Text style={[styles.footerTagline, { color: colors.mutedForeground }]}>Raftaar se, Surakshit se</Text>
          <Text style={[styles.footerEmail, { color: colors.primary }]}>{CONTACT_EMAIL}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  tabRow: {
    flexDirection: "row",
    margin: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  heroBlock: { marginBottom: 8, gap: 6 },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  heroDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  heroDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  numBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  sectionBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  footerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginTop: 8,
    gap: 4,
  },
  footerBrand: { fontSize: 16, fontFamily: "Inter_700Bold" },
  footerTagline: { fontSize: 12, fontFamily: "Inter_400Regular" },
  footerEmail: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 4 },
});
