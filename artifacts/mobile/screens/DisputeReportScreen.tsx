import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Animated as RNAnimated, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BASE_URL } from "@/lib/api";

const ISSUE_TYPES = [
  { key: "overcharge",       label: "💸 Overcharged / Extra paise liye" },
  { key: "driver_behavior",  label: "😤 Driver ka behavior sahi nahi tha" },
  { key: "route_issue",      label: "🗺️ Galat route liya" },
  { key: "payment",          label: "💳 Payment issue / deduction galat" },
  { key: "safety",           label: "🚨 Safety concern" },
  { key: "other",            label: "📝 Kuch aur" },
];

interface RecentRide {
  id: number;
  destination: string;
  pickup: string;
  createdAt: string;
  price: string;
}

export function DisputeReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { setScreen, currentRideId } = useApp();

  const [issue, setIssue] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recentRides, setRecentRides] = useState<RecentRide[]>([]);
  const [selectedRideId, setSelectedRideId] = useState<number | null>(currentRideId);
  const [loadingRides, setLoadingRides] = useState(true);

  /* ── Custom Toast ── */
  const [toast, setToast] = useState<{ message: string; sub?: string; type: "success" | "error" | "info" } | null>(null);
  const toastAnim = useRef(new RNAnimated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, sub?: string, type: "success" | "error" | "info" = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, sub, type });
    RNAnimated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    toastTimer.current = setTimeout(() => {
      RNAnimated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToast(null));
    }, 3500);
  }, [toastAnim]);

  useEffect(() => {
    if (!token) return;
    setLoadingRides(true);
    fetch(`${BASE_URL}rides/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const completed = (d.rides ?? []).filter((r: any) => r.status === "completed").slice(0, 5);
          setRecentRides(completed);
          if (!selectedRideId && completed.length > 0) setSelectedRideId(completed[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRides(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!issue) {
      showToast("Issue type select karein", "List mein se ek issue choose karein", "error");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      showToast("Thodi zyada detail chahiye", "Minimum 10 characters likhein", "error");
      return;
    }
    if (!selectedRideId) {
      showToast("Ride select karein", "Jis ride ke baare mein complaint hai usse choose karein", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}disputes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rideId: selectedRideId, issue, description: description.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Report submit ho gayi!", "Support team 24 ghante mein review karegi ✓", "success");
        setTimeout(() => setScreen("home"), 2500);
      } else {
        showToast("Submit nahi hua", data.error ?? "Dobara koshish karein", "error");
      }
    } catch {
      showToast("Network error", "Internet check karein aur dobara try karein", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  /* Toast colors */
  const toastBg     = toast?.type === "success" ? "#1a2e1a" : toast?.type === "error" ? "#2e1a1a" : "#1a1e2e";
  const toastBorder = toast?.type === "success" ? "#22c55e" : toast?.type === "error" ? "#ef4444" : "#6366f1";
  const toastIcon   = toast?.type === "success" ? "✅" : toast?.type === "error" ? "❌" : "ℹ️";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Custom Toast Overlay ── */}
      {toast && (
        <RNAnimated.View
          style={[
            styles.toastContainer,
            {
              top: topPad + 10,
              backgroundColor: toastBg,
              borderColor: toastBorder,
              transform: [{
                translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }),
              }],
              opacity: toastAnim,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.toastIcon}>{toastIcon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toastTitle, { color: toastBorder }]}>{toast.message}</Text>
            {toast.sub ? <Text style={styles.toastSub}>{toast.sub}</Text> : null}
          </View>
        </RNAnimated.View>
      )}

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setScreen("profile")}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: pressed ? colors.primary : colors.primary + "22",
              borderColor: colors.primary,
            },
          ]}
          hitSlop={10}
        >
          <Text style={[styles.backChevron, { color: colors.primary }]}>‹</Text>
          <Text style={[styles.backLabel, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Report an Issue</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

        {/* Select Ride */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)}>
          <GlassCard style={{ padding: 16, marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>🚖 Ride Select Karein</Text>
            {loadingRides ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>Loading rides...</Text>
            ) : recentRides.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>
                Koi completed ride nahi mili abhi tak
              </Text>
            ) : (
              <View style={{ gap: 8, marginTop: 10 }}>
                {recentRides.map(ride => (
                  <Pressable
                    key={ride.id}
                    onPress={() => setSelectedRideId(ride.id)}
                    style={[
                      styles.rideOption,
                      {
                        borderColor: selectedRideId === ride.id ? colors.primary : colors.border,
                        backgroundColor: selectedRideId === ride.id ? colors.primary + "15" : "transparent",
                      },
                    ]}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                      {ride.pickup} → {ride.destination}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                      ₹{ride.price} • {new Date(ride.createdAt).toLocaleDateString("en-IN")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {/* Issue Type */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <GlassCard style={{ padding: 16, marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>⚠️ Issue Type</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {ISSUE_TYPES.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setIssue(opt.key)}
                  style={[
                    styles.issueOption,
                    {
                      borderColor: issue === opt.key ? colors.primary : colors.border,
                      backgroundColor: issue === opt.key ? colors.primary + "15" : "transparent",
                    },
                  ]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_500Medium" }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Description */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <GlassCard style={{ padding: 16, marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>📝 Detail Likhein</Text>
            <TextInput
              style={[styles.textarea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Kya hua? Jitna detail mein bata sakein utna achcha hai..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />
            <Text style={{ color: description.length < 10 ? "#ef4444" : colors.mutedForeground, fontSize: 11, marginTop: 6, fontFamily: "Inter_400Regular" }}>
              {description.length} characters{description.length < 10 ? ` (${10 - description.length} aur chahiye)` : " ✓"}
            </Text>
          </GlassCard>
        </Animated.View>

        {/* Submit */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <PrimaryButton
            label={submitting ? "Submitting..." : "Submit Report"}
            onPress={handleSubmit}
            disabled={submitting}
          />
          <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 18, fontFamily: "Inter_400Regular" }}>
            Support team 24 ghante ke andar aapki complaint review karegi.{"\n"}
            Urgent cases mein +91 9999-RAFTAAR pe call karein.
          </Text>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  backChevron: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    lineHeight: 24,
    marginTop: -2,
  },
  backLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  sectionLabel: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  rideOption:  { padding: 12, borderRadius: 10, borderWidth: 1 },
  issueOption: { padding: 12, borderRadius: 10, borderWidth: 1 },
  textarea: {
    borderWidth: 1, borderRadius: 10, padding: 12,
    fontSize: 14, marginTop: 8, minHeight: 120, textAlignVertical: "top",
    fontFamily: "Inter_400Regular",
  },

  /* Toast */
  toastContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  toastIcon:  { fontSize: 22 },
  toastTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  toastSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
