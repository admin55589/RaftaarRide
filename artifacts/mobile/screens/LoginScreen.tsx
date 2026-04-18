import React, { useState, useRef } from "react";
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
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/lib/authApi";
import { useVoiceAI } from "@/hooks/useVoiceAI";

type Tab = "otp" | "email";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const { announceWelcome } = useVoiceAI();

  const [tab, setTab] = useState<Tab>("otp");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async () => {
    setError("");
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setError("Valid phone number daalo (10 digits)");
      return;
    }
    setLoading(true);
    try {
      const formatted = cleanPhone.startsWith("+91") ? cleanPhone : `+91${cleanPhone}`;
      const res = await authApi.sendOtp(formatted);
      router.push({
        pathname: "/auth/otp",
        params: { phone: formatted, devOtp: res.otp ?? "" },
      });
    } catch (err: any) {
      setError(err.message || "OTP bhejne mein error");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Email aur password daalo");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login({ email: email.trim(), password });
      await login(res.token, res.user);
      announceWelcome(res.user.name);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Login failed");
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
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoText}>⚡</Text>
            </View>
            <Text style={styles.appName}>RaftaarRide</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={styles.heading}>Swagat hai!</Text>
            <Text style={styles.subheading}>Login karke apni ride book karo</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.tabRow}>
            <Pressable
              style={[styles.tabBtn, tab === "otp" && styles.tabBtnActive]}
              onPress={() => { setTab("otp"); setError(""); }}
            >
              <Text style={[styles.tabText, tab === "otp" && styles.tabTextActive]}>
                📱 Phone OTP
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, tab === "email" && styles.tabBtnActive]}
              onPress={() => { setTab("email"); setError(""); }}
            >
              <Text style={[styles.tabText, tab === "email" && styles.tabTextActive]}>
                ✉️ Email
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.form}>
            {tab === "otp" ? (
              <>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.inputRow}>
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="10-digit number"
                    placeholderTextColor="#8A8A9A"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={handleSendOtp}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrap}>
                  <Feather name="mail" size={18} color="#8A8A9A" style={styles.inputIcon} />
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
                <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
                <View style={styles.inputWrap}>
                  <Feather name="lock" size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#8A8A9A"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleEmailLogin}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color="#8A8A9A" />
                  </Pressable>
                </View>
              </>
            )}

            {error ? (
              <Animated.View entering={FadeInUp.springify()} style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#FF4D4D" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={tab === "otp" ? handleSendOtp : handleEmailLogin}
              disabled={loading}
            >
              <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.primaryBtnGrad}>
                {loading ? (
                  <ActivityIndicator color="#0A0A0F" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {tab === "otp" ? "OTP Bhejo →" : "Login Karo →"}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.divider}>
              <Text style={styles.dividerText}>ya</Text>
            </View>

            <Pressable style={styles.secondaryBtn} onPress={() => router.push("/auth/signup")}>
              <Text style={styles.secondaryBtnText}>
                Naya account banao →
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(600).springify()} style={styles.footer}>
            <Text style={styles.footerText}>
              Login karke aap humare Terms & Privacy Policy se agree karte hain
            </Text>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: 40 },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F5A623",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoText: { fontSize: 24 },
  appName: { fontSize: 22, fontWeight: "700", color: "#FFFFFF" },
  heading: { fontSize: 32, fontWeight: "800", color: "#FFFFFF", marginBottom: 8 },
  subheading: { fontSize: 15, color: "#8A8A9A", marginBottom: 32 },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#16161E",
    borderRadius: 14,
    padding: 4,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "#2A2A38",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: "#F5A623" },
  tabText: { color: "#8A8A9A", fontWeight: "600", fontSize: 14 },
  tabTextActive: { color: "#0A0A0F" },
  form: {},
  label: { color: "#FFFFFF", fontWeight: "600", fontSize: 14, marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    backgroundColor: "#16161E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2A38",
    overflow: "hidden",
  },
  countryCode: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    justifyContent: "center",
  },
  countryCodeText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: "#FFFFFF",
    fontSize: 16,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2A38",
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 16,
    color: "#FFFFFF",
    fontSize: 16,
  },
  eyeBtn: { padding: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,77,77,0.1)",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  errorText: { color: "#FF4D4D", fontSize: 13, flex: 1 },
  primaryBtn: { marginTop: 24, borderRadius: 16, overflow: "hidden" },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnGrad: { paddingVertical: 16, alignItems: "center", borderRadius: 16 },
  primaryBtnText: { color: "#0A0A0F", fontWeight: "800", fontSize: 16 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#2A2A38" },
  dividerText: { color: "#8A8A9A", fontSize: 13 },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: "#F5A623",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#F5A623", fontWeight: "700", fontSize: 15 },
  footer: { marginTop: 40, alignItems: "center" },
  footerText: { color: "#8A8A9A", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
