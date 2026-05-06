import React, { useState, useCallback, useEffect } from "react";
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { useLanguage } from "@/context/LanguageContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BASE_URL } from "@/lib/api";

const GENDER_OPTIONS = ["Male", "Female", "Other"];

export function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, logout, updateUser } = useAuth();
  const { setScreen } = useApp();
  const { lang, toggleLanguage } = useLanguage();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [gender, setGender] = useState(user?.gender ?? "");
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}auth/referral`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setReferralCode(d.referralCode ?? null); })
      .catch(() => {});
  }, [token]);

  const handleCancelEdit = () => {
    setEditing(false);
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setGender(user?.gender ?? "");
  };

  const handleSave = useCallback(async () => {
    if (!token) return;
    if (!name.trim()) { Alert.alert("Naam khali nahi ho sakta"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || null, gender: gender || null }),
      });
      const data = await res.json();
      if (res.ok) {
        updateUser({ ...user!, name: name.trim(), email: email.trim() || null, gender: gender || null });
        setEditing(false);
        Alert.alert("✅ Profile Updated", "Aapki profile save ho gayi!");
      } else {
        Alert.alert("Error", data.error ?? "Save nahi ho payi");
      }
    } catch {
      Alert.alert("Error", "Network error — dobara koshish karein");
    } finally {
      setSaving(false);
    }
  }, [token, name, email, gender, user, updateUser]);

  const handleLogout = () => {
    Alert.alert("Logout", "Kya aap logout karna chahte hain?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: async () => { await logout(); } },
    ]);
  };

  const handleLangSwitch = async (l: "en" | "hi") => {
    if (lang === l) return;
    toggleLanguage();
    if (token) {
      fetch(`${BASE_URL}wallet/language`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: l }),
      }).catch(() => {});
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setScreen("home")}
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

        <Text style={[styles.title, { color: colors.foreground }]}>My Profile</Text>

        <Pressable
          onPress={editing ? handleCancelEdit : () => setEditing(true)}
          style={[
            styles.editChip,
            {
              borderColor: editing ? colors.border : colors.primary,
              backgroundColor: editing ? "transparent" : colors.primary + "18",
            },
          ]}
        >
          <Text style={{ color: editing ? colors.mutedForeground : colors.primary, fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" }}>
            {editing ? "✕ Cancel" : "✏️ Edit"}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {/* Avatar row */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + "25", borderColor: colors.primary + "55", borderWidth: 2 }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                {(user?.name ?? "U").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: colors.foreground }]}>{user?.name ?? "RaftaarRide User"}</Text>
              <Text style={[styles.userPhone, { color: colors.mutedForeground }]}>{user?.phone ?? ""}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Details card */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <GlassCard style={{ padding: 16, marginTop: 20, gap: 16 }}>
            <ProfileField label="Full Name" value={name} onChange={setName} editing={editing} colors={colors} />
            <ProfileField label="Email" value={email ?? ""} onChange={setEmail} editing={editing} colors={colors} keyboardType="email-address" />
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Gender</Text>
              {editing ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {GENDER_OPTIONS.map(g => (
                    <Pressable key={g} onPress={() => setGender(g)}
                      style={[styles.chip, {
                        borderColor: gender === g ? colors.primary : colors.border,
                        backgroundColor: gender === g ? colors.primary + "20" : "transparent",
                      }]}>
                      <Text style={{ color: gender === g ? colors.primary : colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={[styles.fieldValue, { color: colors.foreground }]}>{gender || "Not set"}</Text>
              )}
            </View>
          </GlassCard>
        </Animated.View>

        {editing && (
          <Animated.View entering={FadeInDown.delay(120).duration(300)} style={{ marginTop: 12 }}>
            <PrimaryButton label={saving ? "Saving..." : "Save Changes"} onPress={handleSave} disabled={saving} />
          </Animated.View>
        )}

        {/* Language */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <GlassCard style={{ padding: 16, marginTop: 16 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Language / भाषा</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              {(["en", "hi"] as const).map(l => (
                <Pressable key={l} onPress={() => handleLangSwitch(l)}
                  style={[styles.langBtn, {
                    borderColor: lang === l ? colors.primary : colors.border,
                    backgroundColor: lang === l ? colors.primary + "15" : "transparent",
                  }]}>
                  <Text style={{ color: lang === l ? colors.primary : colors.foreground, fontFamily: "Inter_700Bold", fontWeight: "700", fontSize: 14 }}>
                    {l === "en" ? "🇬🇧 English" : "🇮🇳 हिंदी"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Referral */}
        {referralCode && (
          <Animated.View entering={FadeInDown.delay(250).duration(400)}>
            <GlassCard style={{ padding: 16, marginTop: 16 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🎁 Your Referral Code</Text>
              <Text style={[styles.referralCode, { color: colors.primary, borderColor: colors.primary + "50", backgroundColor: colors.primary + "12" }]}>
                {referralCode}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>
                Dost ko invite karein — dono ko ₹50 RaftaarWallet mein milenge
              </Text>
            </GlassCard>
          </Animated.View>
        )}

        {/* Report Issue row */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <Pressable
            onPress={() => setScreen("dispute_report")}
            style={({ pressed }) => [
              styles.listRow,
              {
                borderColor: colors.border,
                backgroundColor: pressed ? colors.secondary : "transparent",
                marginTop: 16,
              },
            ]}
          >
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <Text style={[styles.listRowText, { color: colors.foreground }]}>Report an Issue</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 20 }}>›</Text>
          </Pressable>
        </Animated.View>

        {/* Logout */}
        <Animated.View entering={FadeInDown.delay(350).duration(400)} style={{ marginTop: 12, marginBottom: 8 }}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              {
                backgroundColor: pressed ? "#ef444433" : "#ef444420",
                borderColor: "#ef4444",
              },
            ]}
          >
            <Text style={styles.logoutIcon}>🚪</Text>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function ProfileField({ label, value, onChange, editing, colors, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  editing: boolean; colors: any; keyboardType?: any;
}) {
  return (
    <View>
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 0.5, color: colors.mutedForeground }}>
        {label}
      </Text>
      {editing ? (
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType ?? "default"}
          placeholderTextColor={colors.mutedForeground}
          style={{
            borderWidth: 1, borderRadius: 10, paddingHorizontal: 14,
            paddingVertical: 10, fontSize: 15, borderColor: colors.border,
            backgroundColor: colors.card, color: colors.foreground,
          }}
        />
      ) : (
        <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", fontWeight: "500", paddingVertical: 4, color: colors.foreground }}>
          {value || "Not set"}
        </Text>
      )}
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
    gap: 10,
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
    fontSize: 19,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  editChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 28, fontFamily: "Inter_700Bold", fontWeight: "800" },
  userName: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  userPhone: { fontSize: 14, marginTop: 2, fontFamily: "Inter_400Regular" },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { fontSize: 15, fontFamily: "Inter_500Medium", fontWeight: "500", paddingVertical: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
  sectionTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  langBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: "center" },
  referralCode: {
    fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "800",
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
    letterSpacing: 2, textAlign: "center", marginTop: 12,
  },
  listRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderRadius: 14, borderWidth: 1,
  },
  listRowText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutIcon: { fontSize: 20 },
  logoutText: {
    color: "#ef4444",
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
