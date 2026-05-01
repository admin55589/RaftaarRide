import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";

const GENDERS = [
  { value: "male", label: "👨 Male" },
  { value: "female", label: "👩 Female" },
  { value: "other", label: "🧑 Other" },
];

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "https://workspaceapi-server-production-2e22.up.railway.app/api";
})();

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, updateUser } = useAuth();

  const [name, setName] = useState(user?.name === "User" ? "" : (user?.name ?? ""));
  const [gender, setGender] = useState<string | null>(user?.gender ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleDone = async () => {
    if (!name.trim()) { setError("Apna naam daalo"); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), gender: gender ?? undefined }),
      });
      const data = await res.json();
      if (data.success) {
        updateUser({ ...user!, name: data.user.name, gender: data.user.gender });
      }
    } catch {}
    finally { setSaving(false); }
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={["#0A0A0F", "#12121A", "#0A0A0F"]} style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.iconWrap}>
            <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.bigIcon}>
              <Text style={styles.bigIconText}>🎉</Text>
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={styles.heading}>Welcome to RaftaarRide!</Text>
            <Text style={styles.subheading}>
              Apna naam aur gender batao — ek baar, bas!
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.form}>
            <Text style={styles.label}>Aapka Naam *</Text>
            <View style={[styles.inputWrap, error ? styles.inputError : null]}>
              <Text style={{ fontSize: 18, lineHeight: 22, marginRight: 10, color: "#8A8A9A" }}>👤</Text>
              <TextInput
                style={styles.input}
                placeholder="Apna poora naam likhein"
                placeholderTextColor="#8A8A9A"
                value={name}
                onChangeText={(v) => { setName(v); setError(""); }}
                autoCapitalize="words"
                autoFocus
              />
            </View>
            {error ? (
              <Animated.View entering={FadeInUp.springify()} style={styles.errorBox}>
                <Text style={{ fontSize: 14, lineHeight: 18 }}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Text style={[styles.label, { marginTop: 24 }]}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g.value}
                  style={[styles.genderBtn, gender === g.value && styles.genderBtnActive]}
                  onPress={() => setGender(g.value)}
                >
                  <Text style={[styles.genderText, gender === g.value && styles.genderTextActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.primaryBtn, saving && styles.disabled]}
              onPress={handleDone}
              disabled={saving}
            >
              <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.primaryGrad}>
                {saving ? (
                  <ActivityIndicator color="#0A0A0F" />
                ) : (
                  <Text style={styles.primaryText}>Raftaar Shuru Karo 🚀</Text>
                )}
              </LinearGradient>
            </Pressable>

          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { paddingHorizontal: 24 },
  iconWrap: { alignItems: "flex-start", marginBottom: 24 },
  bigIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  bigIconText: { fontSize: 36 },
  heading: { fontSize: 28, fontWeight: "800", color: "#FFFFFF", marginBottom: 8 },
  subheading: { fontSize: 15, color: "#8A8A9A", lineHeight: 22, marginBottom: 28 },
  form: {},
  label: { color: "#FFFFFF", fontWeight: "600", fontSize: 13, marginBottom: 12 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#16161E", borderRadius: 14,
    borderWidth: 1, borderColor: "#2A2A38", paddingHorizontal: 14,
  },
  inputError: { borderColor: "#FF4D4D" },
  input: { flex: 1, paddingVertical: 14, color: "#FFFFFF", fontSize: 15 },
  errorBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,77,77,0.1)", borderRadius: 10, padding: 12, gap: 8, marginTop: 8,
  },
  errorText: { color: "#FF4D4D", fontSize: 13, flex: 1 },
  genderRow: { flexDirection: "row", gap: 10 },
  genderBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: "#16161E", borderWidth: 1.5, borderColor: "#2A2A38",
    alignItems: "center",
  },
  genderBtnActive: { borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.1)" },
  genderText: { color: "#8A8A9A", fontWeight: "600", fontSize: 13 },
  genderTextActive: { color: "#F5A623" },
  primaryBtn: { marginTop: 32, borderRadius: 16, overflow: "hidden" },
  disabled: { opacity: 0.6 },
  primaryGrad: { paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#0A0A0F", fontWeight: "800", fontSize: 16 },
});
