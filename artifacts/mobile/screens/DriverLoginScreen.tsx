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
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "https://workspaceapi-server-production-2e22.up.railway.app";

async function driverLogin(phone: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/driver-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Login failed");
  return data;
}

export default function DriverLoginScreen() {
  const insets = useSafeAreaInsets();
  const { lang, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const { driverLogin: saveDriverLogin } = useDriverAuth();
  const colors = useColors();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setError("Valid phone number daalo (10 digits)");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password kam se kam 6 characters ka hona chahiye");
      return;
    }
    setLoading(true);
    try {
      const formatted = cleanPhone.startsWith("+91") ? cleanPhone : `+91${cleanPhone}`;
      const res = await driverLogin(formatted, password);
      await saveDriverLogin(res.token, res.driver);
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient
        colors={["#0A0A0F", "#12121A", "#0A0A0F"]}
        style={[styles.container, { paddingTop: insets.top + 20 }]}
      >
        <Pressable
          onPress={toggleLanguage}
          hitSlop={8}
          style={{ position: "absolute", top: insets.top + 12, right: 16, zIndex: 100, width: 40, height: 40, borderRadius: 20, borderWidth: 1, backgroundColor: "rgba(245,166,35,0.15)", borderColor: "rgba(245,166,35,0.4)", alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: "#F5A623", fontSize: 12, fontWeight: "700" }}>{lang === "hi" ? "हिं" : "EN"}</Text>
        </Pressable>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(500)} style={styles.header}>
            <Text style={styles.emoji}>🚗</Text>
            <Text style={styles.title}>{t("driver_login_title")}</Text>
            <Text style={styles.subtitle}>{t("driver_login_sub")}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.card}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputRow}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                style={styles.input}
                placeholder="10-digit number"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={10}
              />
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.3)"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Text style={{ fontSize: 18 }}>{showPassword ? "🙈" : "👁️"}</Text>
              </Pressable>
            </View>

            {error ? (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </Animated.View>
            ) : null}

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [styles.loginBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <LinearGradient
                colors={["#22c55e", "#16a34a"]}
                style={styles.loginBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.loginBtnText}>{t("driver_login_btn")}</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={() => router.push("/driver-auth/register")}
              style={styles.registerLink}
            >
              <Text style={styles.registerLinkText}>
                Naya driver?{" "}
                <Text style={{ color: "#22c55e", fontWeight: "600" }}>Register karo</Text>
              </Text>
            </Pressable>
          </Animated.View>

          <Pressable
            onPress={() => router.replace("/auth/login")}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>← Passenger login pe wapas jao</Text>
          </Pressable>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24 },
  header: { alignItems: "center", marginBottom: 32 },
  emoji: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 6 },
  subtitle: { fontSize: 15, color: "rgba(255,255,255,0.5)" },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  label: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 8, fontWeight: "500" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    height: 52,
  },
  prefix: { color: "rgba(255,255,255,0.7)", fontSize: 15, marginRight: 8, fontWeight: "600" },
  input: { flex: 1, color: "#fff", fontSize: 15 },
  eyeBtn: { padding: 4 },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  errorText: { color: "#f87171", fontSize: 13 },
  loginBtn: { marginTop: 20, borderRadius: 14, overflow: "hidden" },
  loginBtnGrad: { height: 52, alignItems: "center", justifyContent: "center" },
  loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  registerLink: { marginTop: 16, alignItems: "center" },
  registerLinkText: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  backLink: { marginTop: 28, alignItems: "center" },
  backLinkText: { color: "rgba(255,255,255,0.35)", fontSize: 13 },
});
