import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/lib/authApi";
import { useVoiceAI } from "@/hooks/useVoiceAI";

export default function OtpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ phone: string; devOtp?: string }>();
  const { login } = useAuth();
  const { announceWelcome } = useVoiceAI();

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(30);
  const [name, setName] = useState("");
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shake = useSharedValue(0);

  const phone = params.phone ?? "";
  const devOtp = params.devOtp;

  useEffect(() => {
    if (devOtp) {
      const digits = devOtp.split("").slice(0, 6);
      setOtp([...digits, ...Array(6 - digits.length).fill("")]);
    }
  }, [devOtp]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const triggerShake = () => {
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  };

  const handleChange = (val: string, idx: number) => {
    const digit = val.replace(/[^0-9]/g, "").slice(-1);
    const updated = [...otp];
    updated[idx] = digit;
    setOtp(updated);
    if (digit && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (updated.every((d) => d !== "") && idx === 5) {
      verifyOtp(updated.join(""));
    }
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const verifyOtp = async (code: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({
        phone,
        otp: code,
        name: name.trim() || undefined,
      });
      await login(res.token, res.user);
      announceWelcome(res.user.name);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "OTP galat hai");
      triggerShake();
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setError("");
    try {
      await authApi.sendOtp(phone);
      setResendTimer(30);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || "Resend failed");
    }
  };

  const handleVerifyPress = () => {
    const code = otp.join("");
    if (code.length < 6) {
      setError("Poora 6-digit OTP daalo");
      triggerShake();
      return;
    }
    verifyOtp(code);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient colors={["#0A0A0F", "#12121A", "#0A0A0F"]} style={styles.container}>
        <View style={[styles.inner, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color="#FFFFFF" />
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.iconWrap}>
            <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.bigIcon}>
              <Text style={styles.bigIconText}>💬</Text>
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <Text style={styles.heading}>OTP Verify Karo</Text>
            <Text style={styles.subheading}>
              6-digit code bheja gaya:{"\n"}
              <Text style={styles.phoneText}>{phone}</Text>
            </Text>
          </Animated.View>

          {devOtp ? (
            <Animated.View entering={FadeInDown.delay(350).springify()} style={styles.devBanner}>
              <Feather name="info" size={14} color="#F5A623" />
              <Text style={styles.devText}>Dev Mode: OTP auto-filled ({devOtp})</Text>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.form}>
            <Text style={styles.label}>OTP Daalo</Text>
            <Animated.View style={[styles.otpRow, shakeStyle]}>
              {otp.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(r) => { inputRefs.current[idx] = r; }}
                  style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                  value={digit}
                  onChangeText={(v) => handleChange(v, idx)}
                  onKeyPress={(e) => handleKeyPress(e, idx)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  textAlign="center"
                />
              ))}
            </Animated.View>

            <Text style={[styles.label, { marginTop: 20 }]}>
              Aapka Naam <Text style={styles.optional}>(optional)</Text>
            </Text>
            <View style={styles.inputWrap}>
              <Feather name="user" size={18} color="#8A8A9A" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                placeholder="Apna naam daalo"
                placeholderTextColor="#8A8A9A"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            {error ? (
              <Animated.View entering={FadeInUp.springify()} style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#FF4D4D" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, loading && styles.disabled]}
              onPress={handleVerifyPress}
              disabled={loading}
            >
              <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.primaryGrad}>
                {loading ? (
                  <ActivityIndicator color="#0A0A0F" />
                ) : (
                  <Text style={styles.primaryText}>Verify Karo ✓</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              style={[styles.resendBtn, resendTimer > 0 && styles.resendDisabled]}
              onPress={handleResend}
              disabled={resendTimer > 0}
            >
              <Text style={styles.resendText}>
                {resendTimer > 0
                  ? `OTP dobara bhejo (${resendTimer}s)`
                  : "OTP Dobara Bhejo"}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#16161E", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#2A2A38",
  },
  iconWrap: { alignItems: "flex-start", marginBottom: 24 },
  bigIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  bigIconText: { fontSize: 36 },
  heading: { fontSize: 28, fontWeight: "800", color: "#FFFFFF", marginBottom: 8 },
  subheading: { fontSize: 15, color: "#8A8A9A", lineHeight: 22, marginBottom: 24 },
  phoneText: { color: "#F5A623", fontWeight: "700" },
  devBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(245,166,35,0.1)", borderRadius: 10, padding: 10, marginBottom: 20,
    borderWidth: 1, borderColor: "rgba(245,166,35,0.3)",
  },
  devText: { color: "#F5A623", fontSize: 12 },
  form: {},
  label: { color: "#FFFFFF", fontWeight: "600", fontSize: 13, marginBottom: 12 },
  optional: { color: "#8A8A9A", fontWeight: "400" },
  otpRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  otpBox: {
    flex: 1, height: 56, borderRadius: 14,
    backgroundColor: "#16161E", borderWidth: 1.5, borderColor: "#2A2A38",
    color: "#FFFFFF", fontSize: 22, fontWeight: "700",
  },
  otpBoxFilled: { borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.08)" },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#16161E", borderRadius: 14,
    borderWidth: 1, borderColor: "#2A2A38", paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, color: "#FFFFFF", fontSize: 15 },
  errorBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,77,77,0.1)", borderRadius: 10, padding: 12, gap: 8, marginTop: 12,
  },
  errorText: { color: "#FF4D4D", fontSize: 13, flex: 1 },
  primaryBtn: { marginTop: 24, borderRadius: 16, overflow: "hidden" },
  disabled: { opacity: 0.6 },
  primaryGrad: { paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#0A0A0F", fontWeight: "800", fontSize: 16 },
  resendBtn: { marginTop: 16, alignItems: "center", paddingVertical: 12 },
  resendDisabled: { opacity: 0.5 },
  resendText: { color: "#F5A623", fontWeight: "600", fontSize: 14 },
});
