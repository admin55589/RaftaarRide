import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/lib/authApi";
import { useVoiceAI } from "@/hooks/useVoiceAI";
import { useLanguage } from "@/context/LanguageContext";

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { lang, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const { login } = useAuth();
  const { announceWelcome } = useVoiceAI();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const GENDERS = [
    { value: "male", label: "👨 Male" },
    { value: "female", label: "👩 Female" },
    { value: "other", label: "🧑 Other" },
  ];

  const handleSignup = async () => {
    setError("");
    if (!name.trim()) { setError("Apna naam daalo"); return; }
    if (!phone.trim() || phone.length < 10) { setError("Valid phone number daalo"); return; }
    if (!password || password.length < 6) { setError("Password kam se kam 6 characters ka hona chahiye"); return; }
    if (password !== confirmPassword) { setError("Password match nahi kar raha"); return; }

    setLoading(true);
    try {
      const formatted = phone.startsWith("+91") ? phone : `+91${phone}`;
      const res = await authApi.register({
        name: name.trim(),
        phone: formatted,
        email: email.trim() || undefined,
        password,
        gender: gender ?? undefined,
      });
      await login(res.token, res.user);
      announceWelcome(res.user.name);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient colors={["#0A0A0F", "#12121A", "#0A0A0F"]} style={styles.container}>
        <Pressable
          onPress={toggleLanguage}
          hitSlop={8}
          android_ripple={null}
          style={({ pressed }) => [{ position: "absolute", top: insets.top + 12, right: 16, zIndex: 100, width: 40, height: 40, borderRadius: 20, borderWidth: 1, backgroundColor: pressed ? "rgba(245,166,35,0.25)" : "rgba(245,166,35,0.15)", borderColor: "rgba(245,166,35,0.4)", alignItems: "center", justifyContent: "center" }]}
        >
          <Text style={{ color: "#F5A623", fontSize: 12, fontWeight: "700" }}>{lang === "hi" ? "हिं" : "EN"}</Text>
        </Pressable>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            <Pressable onPress={() => router.back()} android_ripple={null} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: "#1F1F2E" }]}>
              <Text style={{ fontSize: 20, color: "#FFFFFF", lineHeight: 24 }}>←</Text>
            </Pressable>
            <View style={styles.logoRow}>
              <Image
                source={require("../assets/images/app-logo.jpg")}
                style={styles.logoIcon}
                resizeMode="cover"
              />
              <Text style={styles.appName}>RaftaarRide</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={styles.heading}>{t("signup_title")}</Text>
            <Text style={styles.subheading}>{t("signup_subtitle")}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Poora Naam *</Text>
              <View style={styles.inputWrap}>
                <Text style={[styles.icon, { fontSize: 18, lineHeight: 22 }]}>👤</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Aapka naam"
                  placeholderTextColor="#8A8A9A"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone Number *</Text>
              <View style={styles.inputRow}>
                <View style={styles.flag}>
                  <Text style={styles.flagText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="10-digit number"
                  placeholderTextColor="#8A8A9A"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.genderRow}>
                {GENDERS.map((g) => (
                  <Pressable
                    key={g.value}
                    style={({ pressed }) => [styles.genderBtn, gender === g.value && styles.genderBtnActive, pressed && !gender && { backgroundColor: "rgba(245,166,35,0.12)" }]}
                    android_ripple={null}
                    onPress={() => setGender(g.value)}
                  >
                    <Text style={[styles.genderText, gender === g.value && styles.genderTextActive]}>
                      {g.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email (optional)</Text>
              <View style={styles.inputWrap}>
                <Text style={[styles.icon, { fontSize: 18, lineHeight: 22 }]}>✉️</Text>
                <TextInput
                  style={styles.input}
                  placeholder="aapka@email.com"
                  placeholderTextColor="#8A8A9A"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password *</Text>
              <View style={styles.inputWrap}>
                <Text style={[styles.icon, { fontSize: 18, lineHeight: 22 }]}>🔒</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min. 6 characters"
                  placeholderTextColor="#8A8A9A"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={{ fontSize: 17, lineHeight: 22, color: "#8A8A9A" }}>{showPassword ? "🙈" : "👁"}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password Confirm Karo *</Text>
              <View style={styles.inputWrap}>
                <Text style={[styles.icon, { fontSize: 18, lineHeight: 22 }]}>🔒</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Password dobara daalo"
                  placeholderTextColor="#8A8A9A"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
              </View>
            </View>

            {error ? (
              <Animated.View entering={FadeInUp.springify()} style={styles.errorBox}>
                <Text style={{ fontSize: 14, lineHeight: 18 }}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, loading && styles.disabled]}
              onPress={handleSignup}
              android_ripple={null}
              disabled={loading}
            >
              <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.primaryGrad}>
                {loading ? (
                  <ActivityIndicator color="#0A0A0F" />
                ) : (
                  <Text style={styles.primaryText}>Account Banao →</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.loginLink, pressed && styles.loginLinkPressed]}
              android_ripple={null}
              onPress={() => router.replace("/auth/login")}
            >
              <Text style={styles.loginLinkText}>
                Already account hai? <Text style={{ color: "#F5A623" }}>Login karo</Text>
              </Text>
            </Pressable>

            <View style={styles.termsRow}>
              <Text style={styles.termsText}>Account banake aap humare </Text>
              <Pressable onPress={() => router.push("/terms")} android_ripple={null}>
                <Text style={styles.termsLink}>Terms & Privacy Policy</Text>
              </Pressable>
              <Text style={styles.termsText}> se agree karte hain</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 36, gap: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#16161E", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#2A2A38",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon: {
    width: 40, height: 40, borderRadius: 10, overflow: "hidden",
  },
  logoEmoji: { fontSize: 20 },
  appName: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  heading: { fontSize: 28, fontWeight: "800", color: "#FFFFFF", marginBottom: 6 },
  subheading: { fontSize: 14, color: "#8A8A9A", marginBottom: 28 },
  form: {},
  field: { marginBottom: 16 },
  label: { color: "#FFFFFF", fontWeight: "600", fontSize: 13, marginBottom: 8 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#16161E", borderRadius: 14,
    borderWidth: 1, borderColor: "#2A2A38", paddingHorizontal: 14,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, color: "#FFFFFF", fontSize: 15 },
  eyeBtn: { padding: 4 },
  inputRow: {
    flexDirection: "row", backgroundColor: "#16161E",
    borderRadius: 14, borderWidth: 1, borderColor: "#2A2A38", overflow: "hidden",
  },
  flag: {
    paddingHorizontal: 14, paddingVertical: 14,
    borderRightWidth: 1, borderRightColor: "#2A2A38", justifyContent: "center",
  },
  flagText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  phoneInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, color: "#FFFFFF", fontSize: 15 },
  errorBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,77,77,0.1)", borderRadius: 10, padding: 12, gap: 8, marginBottom: 8,
  },
  errorText: { color: "#FF4D4D", fontSize: 13, flex: 1 },
  primaryBtn: { marginTop: 8, borderRadius: 16, overflow: "hidden" },
  disabled: { opacity: 0.6 },
  primaryGrad: { paddingVertical: 16, alignItems: "center", borderRadius: 16 },
  primaryText: { color: "#0A0A0F", fontWeight: "800", fontSize: 16 },
  loginLink: { marginTop: 20, alignItems: "center", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
  loginLinkPressed: { backgroundColor: "rgba(245,166,35,0.1)" },
  loginLinkText: { color: "#8A8A9A", fontSize: 14 },
  termsRow: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center" },
  termsText: { color: "#8A8A9A", fontSize: 11 },
  termsLink: { color: "#F5A623", fontSize: 11, textDecorationLine: "underline", fontFamily: "Inter_600SemiBold" },
  genderRow: { flexDirection: "row", gap: 8 },
  genderBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: "#16161E", borderWidth: 1.5, borderColor: "#2A2A38",
    alignItems: "center",
  },
  genderBtnActive: { borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.1)" },
  genderText: { color: "#8A8A9A", fontWeight: "600", fontSize: 12 },
  genderTextActive: { color: "#F5A623" },
});
