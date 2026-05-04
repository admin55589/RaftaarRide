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
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "https://workspaceapi-server-production-2e22.up.railway.app/api";
})();

type Step = "phone" | "otp" | "password";

export default function DriverForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState<string | undefined>();

  const handleSendOtp = async () => {
    const clean = phone.trim().replace(/\D/g, "").slice(-10);
    if (clean.length < 10) { setError("Valid 10-digit phone number daalo"); return; }
    setError(""); setLoading(true);
    try {
      const formatted = `+91${clean}`;
      const res = await fetch(`${API_BASE}/driver-auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatted }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message ?? "OTP send nahi hua"); return; }
      setDevOtp(data.otp);
      setPhone(formatted);
      setStep("otp");
    } catch { setError("Network error — internet check karo"); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError("6-digit OTP daalo"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/driver-auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, step: "verify" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message ?? "OTP galat hai"); return; }
      setStep("password");
    } catch { setError("Network error — internet check karo"); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) { setError("Password kam se kam 6 characters ka hona chahiye"); return; }
    if (newPassword !== confirmPassword) { setError("Dono password match nahi karte"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/driver-auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, newPassword, step: "reset" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message ?? "Password reset nahi hua"); return; }
      router.replace("/driver-auth/login");
    } catch { setError("Network error — internet check karo"); }
    finally { setLoading(false); }
  };

  const stepTitles: Record<Step, string> = {
    phone: "🔑 Password Bhool Gaye?",
    otp: "📱 OTP Verify Karo",
    password: "🔒 Naya Password Set Karo",
  };
  const stepSubs: Record<Step, string> = {
    phone: "Apna registered phone number daalo",
    otp: `OTP ${phone} pe bheja gaya`,
    password: "Kam se kam 6 characters ka strong password banao",
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0A0A0F" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Wapas</Text>
        </Pressable>

        <Animated.View entering={FadeInDown.springify()} style={styles.card}>
          <Text style={styles.stepIndicator}>Step {step === "phone" ? "1" : step === "otp" ? "2" : "3"} / 3</Text>
          <Text style={styles.title}>{stepTitles[step]}</Text>
          <Text style={styles.sub}>{stepSubs[step]}</Text>

          {step === "phone" && (
            <>
              <Text style={styles.label}>Registered Phone Number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCode}><Text style={styles.countryCodeText}>🇮🇳 +91</Text></View>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phone.replace(/^\+91/, "")}
                  onChangeText={(v) => setPhone(v.replace(/\D/g, ""))}
                  placeholder="10-digit number"
                  placeholderTextColor="#4A4A6A"
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
              {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
              <Pressable onPress={handleSendOtp} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>OTP Bhejo →</Text>}
              </Pressable>
            </>
          )}

          {step === "otp" && (
            <>
              {devOtp ? (
                <View style={styles.devBox}>
                  <Text style={styles.devText}>🧪 Dev OTP: {devOtp}</Text>
                </View>
              ) : null}
              <Text style={styles.label}>6-Digit OTP</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="- - - - - -"
                placeholderTextColor="#4A4A6A"
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
              />
              {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
              <Pressable onPress={handleVerifyOtp} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>OTP Verify Karo →</Text>}
              </Pressable>
              <Pressable onPress={() => setStep("phone")} style={styles.linkBtn}>
                <Text style={styles.linkText}>OTP nahi aaya? Phone number badlo</Text>
              </Pressable>
            </>
          )}

          {step === "password" && (
            <>
              <Text style={styles.label}>Naya Password</Text>
              <View style={styles.pwRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Naya password"
                  placeholderTextColor="#4A4A6A"
                  secureTextEntry={!showPassword}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={{ fontSize: 18 }}>{showPassword ? "🙈" : "👁️"}</Text>
                </Pressable>
              </View>
              <Text style={styles.label}>Password Confirm Karo</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Password dobara daalo"
                placeholderTextColor="#4A4A6A"
                secureTextEntry={!showPassword}
              />
              {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
              <Pressable onPress={handleResetPassword} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>✅ Password Set Karo</Text>}
              </Pressable>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 20 },
  backBtn: { marginBottom: 24 },
  backText: { color: "#F5A623", fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stepIndicator: { color: "#F5A623", fontSize: 12, fontWeight: "700", marginBottom: 8, letterSpacing: 1 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", marginBottom: 6 },
  sub: { color: "#8A8A9A", fontSize: 14, marginBottom: 24, lineHeight: 20 },
  label: { color: "#8A8A9A", fontSize: 13, fontWeight: "600", marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: "#FFF",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  phoneRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 0 },
  countryCode: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  countryCodeText: { color: "#FFF", fontSize: 16 },
  phoneInput: { flex: 1, marginBottom: 16 },
  otpInput: { fontSize: 28, fontWeight: "700", letterSpacing: 8 },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyeBtn: { paddingHorizontal: 4, paddingBottom: 16 },
  error: { color: "#FF4D4D", fontSize: 13, marginBottom: 12 },
  devBox: {
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  devText: { color: "#F5A623", fontSize: 13, fontWeight: "600" },
  btn: {
    backgroundColor: "#F5A623",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnText: { color: "#000", fontSize: 16, fontWeight: "700" },
  linkBtn: { alignItems: "center", marginTop: 16 },
  linkText: { color: "#F5A623", fontSize: 13, fontWeight: "500" },
});
