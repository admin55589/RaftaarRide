import React, { useState, useEffect } from "react";
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform,
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
  { key: "overcharge", label: "💸 Overcharged / Extra paise liye" },
  { key: "driver_behavior", label: "😤 Driver ka behavior sahi nahi tha" },
  { key: "route_issue", label: "🗺️ Galat route liya" },
  { key: "payment", label: "💳 Payment issue / deduction galat" },
  { key: "safety", label: "🚨 Safety concern" },
  { key: "other", label: "📝 Kuch aur" },
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
    if (!issue) { Alert.alert("Issue Type", "Koi ek issue type select karein"); return; }
    if (!description.trim() || description.trim().length < 10) {
      Alert.alert("Description", "Thodi zyada detail dijiye (minimum 10 characters)"); return;
    }
    if (!selectedRideId) { Alert.alert("Ride", "Jis ride ke baare mein complaint hai usse select karein"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}disputes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rideId: selectedRideId, issue, description: description.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert("✅ Report Submitted", "Hamari support team 24 ghante mein review karegi aur aapko update karengi.", [
          { text: "OK", onPress: () => setScreen("home") },
        ]);
      } else {
        Alert.alert("Error", data.error ?? "Submit nahi ho payi — dobara koshish karein");
      }
    } catch {
      Alert.alert("Network Error", "Internet check karein aur dobara koshish karein");
    } finally {
      setSubmitting(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setScreen("profile")}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: pressed ? colors.primary + "22" : colors.secondary,
              borderColor: colors.border,
            },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.backArrow, { color: colors.foreground }]}>←</Text>
          <Text style={[styles.backLabel, { color: colors.mutedForeground }]}>Back</Text>
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
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>Koi completed ride nahi mili</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 10 }}>
                {recentRides.map(r => (
                  <Pressable key={r.id} onPress={() => setSelectedRideId(r.id)}
                    style={[styles.rideOption, {
                      borderColor: selectedRideId === r.id ? colors.primary : colors.border,
                      backgroundColor: selectedRideId === r.id ? colors.primary + "12" : "transparent",
                    }]}>
                    <Text style={{ color: selectedRideId === r.id ? colors.primary : colors.foreground, fontFamily: "Inter_600SemiBold", fontWeight: "600", fontSize: 13 }}>
                      Ride #{r.id} — {r.destination}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
                      ₹{r.price} • {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {/* Issue type */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <GlassCard style={{ padding: 16, marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>⚠️ Issue Type</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {ISSUE_TYPES.map(it => (
                <Pressable key={it.key} onPress={() => setIssue(it.key)}
                  style={[styles.issueOption, {
                    borderColor: issue === it.key ? colors.primary : colors.border,
                    backgroundColor: issue === it.key ? colors.primary + "12" : "transparent",
                  }]}>
                  <Text style={{ color: issue === it.key ? colors.primary : colors.foreground, fontSize: 14 }}>{it.label}</Text>
                </Pressable>
              ))}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Description */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <GlassCard style={{ padding: 16, marginBottom: 20 }}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>📝 Details / Vivran</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Kya hua tha? Jitni detail denge, utni jaldi resolve hogi..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={5}
              style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            />
            <Text style={{ color: description.length >= 10 ? colors.primary : colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
              {description.length} characters {description.length < 10 ? `(${10 - description.length} aur chahiye)` : "✓"}
            </Text>
          </GlassCard>
        </Animated.View>

        <PrimaryButton
          label={submitting ? "Submitting..." : "Submit Report"}
          onPress={handleSubmit}
          disabled={submitting}
        />

        <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18 }}>
          Support team 24 ghante ke andar aapki complaint review karegi.{"\n"}
          Urgent cases mein +91 9999-RAFTAAR pe call karein.
        </Text>
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
    borderWidth: 1,
  },
  backArrow: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    lineHeight: 20,
  },
  backLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  sectionLabel: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  rideOption: { padding: 12, borderRadius: 10, borderWidth: 1 },
  issueOption: { padding: 12, borderRadius: 10, borderWidth: 1 },
  textarea: {
    borderWidth: 1, borderRadius: 10, padding: 12,
    fontSize: 14, marginTop: 8, minHeight: 120, textAlignVertical: "top",
    fontFamily: "Inter_400Regular",
  },
});
