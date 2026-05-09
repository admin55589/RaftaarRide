import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Alert, Animated as RNAnimated, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform, ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
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
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [redeemableRupees, setRedeemableRupees] = useState(0);
  const [pointsToNext, setPointsToNext] = useState(100);

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(user?.photoUrl ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  /* ── Custom Toast ── */
  const [toast, setToast] = useState<{ message: string; sub?: string; type: "success" | "error" | "info" } | null>(null);
  const toastAnim = useRef(new RNAnimated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, sub?: string, type: "success" | "error" | "info" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, sub, type });
    RNAnimated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    toastTimer.current = setTimeout(() => {
      RNAnimated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToast(null));
    }, 3000);
  }, [toastAnim]);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}users/loyalty`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLoyaltyPoints(d.points);
          setRedeemableRupees(d.redeemableRupees);
          setPointsToNext(d.pointsToNext);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}auth/referral`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setReferralCode(d.referralCode ?? null); })
      .catch(() => {});
  }, [token]);

  /* ── Profile Photo Upload ── */
  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast("Permission chahiye", "Gallery access allow karo", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.45,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const localUri = asset.uri;
    const b64 = asset.base64;
    if (!b64) { showToast("Photo read nahi ho saki", undefined, "error"); return; }

    const MAX_B64 = 400000;
    if (b64.length > MAX_B64) {
      showToast("Photo bahut badi hai", "Chhoti image choose karein (max ~300KB)", "error");
      return;
    }

    setPhotoUri(localUri);
    if (!token) return;

    setUploadingPhoto(true);
    try {
      const ext = localUri.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      const dataUri = `data:${mimeType};base64,${b64}`;

      const res = await fetch(`${BASE_URL}users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: user?.name ?? name, photoUrl: dataUri }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        updateUser({ ...user!, photoUrl: dataUri });
        showToast("Photo update ho gayi!", "Profile photo save ho gayi ✓", "success");
      } else {
        setPhotoUri(user?.photoUrl ?? null);
        showToast("Upload nahi hua", data.error ?? "Dobara koshish karein", "error");
      }
    } catch {
      setPhotoUri(user?.photoUrl ?? null);
      showToast("Network error", "Photo upload nahi ho saka", "error");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setGender(user?.gender ?? "");
  };

  const handleSave = useCallback(async () => {
    if (!token) return;
    if (!name.trim()) { showToast("Naam khali nahi ho sakta", undefined, "error"); return; }
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
        showToast("Profile update ho gayi!", "Aapki details save ho gayi ✓", "success");
      } else {
        showToast("Save nahi hua", data.error ?? "Dobara koshish karein", "error");
      }
    } catch {
      showToast("Network error", "Internet check karo aur dobara try karo", "error");
    } finally {
      setSaving(false);
    }
  }, [token, name, email, gender, user, updateUser, showToast]);

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
  const initials = (user?.name ?? "U").charAt(0).toUpperCase();

  /* Toast colors */
  const toastBg = toast?.type === "success" ? "#1a2e1a" : toast?.type === "error" ? "#2e1a1a" : "#1a1a2e";
  const toastBorder = toast?.type === "success" ? "#22c55e" : toast?.type === "error" ? "#ef4444" : "#6366f1";
  const toastIcon = toast?.type === "success" ? "✅" : toast?.type === "error" ? "❌" : "ℹ️";

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
        {/* Back Button — solid golden pill */}
        <Pressable
          onPress={() => setScreen("home")}
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

        {/* ── Avatar with Upload ── */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)}>
          <View style={styles.avatarSection}>
            <Pressable onPress={handlePickPhoto} style={styles.avatarWrapper} disabled={uploadingPhoto}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + "25", borderColor: colors.primary + "55" }]}>
                  <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initials}</Text>
                </View>
              )}

              {/* Camera overlay */}
              <View style={[styles.cameraOverlay, { backgroundColor: colors.primary }]}>
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={styles.cameraIcon}>📷</Text>
                }
              </View>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: colors.foreground }]}>{user?.name ?? "RaftaarRide User"}</Text>
              <Text style={[styles.userPhone, { color: colors.mutedForeground }]}>{user?.phone ?? ""}</Text>
              <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto}>
                <Text style={[styles.uploadHint, { color: colors.primary }]}>
                  {uploadingPhoto ? "Uploading..." : "📷 Photo change karein"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ── Details Card ── */}
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

        {/* ── RaftaarPoints Loyalty Card ── */}
        <Animated.View entering={FadeInDown.delay(160).duration(400)}>
          <GlassCard style={{ padding: 16, marginTop: 16, borderWidth: 1, borderColor: colors.primary + "30", backgroundColor: colors.primary + "08" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground }}>🏆 RaftaarPoints</Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>Har ₹10 ki ride pe 1 point · 150 pts = ₹10</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 26, fontWeight: "800", color: colors.primary, fontFamily: "Inter_700Bold" }}>{loyaltyPoints}</Text>
                <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>points</Text>
              </View>
            </View>
            <View style={{ height: 5, backgroundColor: colors.border, borderRadius: 3, marginBottom: 8 }}>
              <View style={{ width: `${Math.min(100, ((150 - pointsToNext) / 150) * 100)}%`, height: "100%", backgroundColor: colors.primary, borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {redeemableRupees > 0
                ? `✅ ₹${redeemableRupees} redeem available — Wallet screen mein jao`
                : loyaltyPoints === 0
                  ? "Pehli ride book karo — points milenge!"
                  : `${pointsToNext} aur points → ₹10 wallet credit`}
            </Text>
          </GlassCard>
        </Animated.View>

        {/* ── Language ── */}
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

        {/* ── Referral ── */}
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

        {/* ── Help & Support ── */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <Pressable
            onPress={() => setScreen("support")}
            style={({ pressed }) => [
              styles.listRow,
              { borderColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent", marginTop: 16 },
            ]}
          >
            <Text style={{ fontSize: 18 }}>🆘</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.listRowText, { color: colors.foreground }]}>Help & Support</Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>FAQ · Live chat with support</Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 20 }}>›</Text>
          </Pressable>
        </Animated.View>

        {/* ── Report Issue ── */}
        <Animated.View entering={FadeInDown.delay(330).duration(400)}>
          <Pressable
            onPress={() => setScreen("dispute_report")}
            style={({ pressed }) => [
              styles.listRow,
              { borderColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent", marginTop: 8 },
            ]}
          >
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <Text style={[styles.listRowText, { color: colors.foreground }]}>Report an Issue</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 20 }}>›</Text>
          </Pressable>
        </Animated.View>

        {/* ── Logout — solid red ── */}
        <Animated.View entering={FadeInDown.delay(350).duration(400)} style={{ marginTop: 12, marginBottom: 8 }}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              { backgroundColor: pressed ? "#c53030" : "#ef4444" },
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

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },

  /* Back button — compact golden pill */
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  backChevron: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    lineHeight: 18,
    marginTop: -1,
  },
  backLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    letterSpacing: 0.1,
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

  /* Avatar */
  avatarSection: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 },
  avatarWrapper: { position: "relative", width: 76, height: 76 },
  avatarImage: { width: 76, height: 76, borderRadius: 38, borderWidth: 2.5, borderColor: "rgba(245,166,35,0.6)" },
  avatarPlaceholder: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2.5, alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { fontSize: 32, fontFamily: "Inter_700Bold", fontWeight: "800" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0, right: 0,
    width: 26, height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  cameraIcon: { fontSize: 13, lineHeight: 16 },
  uploadHint: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 6 },

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

  /* Logout — solid red button */
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
    borderRadius: 14,
  },
  logoutIcon: { fontSize: 20 },
  logoutText: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
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
  toastIcon: { fontSize: 22 },
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
