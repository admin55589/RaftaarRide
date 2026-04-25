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
import { useLanguage } from "@/context/LanguageContext";
import { firebaseDriverRegister } from "@/lib/authApi";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:8080";

async function driverRegister(data: {
  name: string;
  phone: string;
  email: string;
  password: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber: string;
}) {
  const res = await fetch(`${BASE_URL}/api/driver-auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Registration failed");
  return json;
}

const VEHICLE_OPTIONS = [
  { id: "bike", label: "Bike", icon: "🏍️", desc: "2-wheeler, fastest" },
  { id: "auto", label: "Auto", icon: "🛺", desc: "3-wheeler, affordable" },
  { id: "prime", label: "Prime Car", icon: "🚗", desc: "AC Sedan, comfortable" },
  { id: "suv", label: "SUV", icon: "🚙", desc: "AC SUV, spacious" },
];

export default function DriverRegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lang, toggleLanguage, t } = useLanguage();
  const { driverLogin: saveDriverLogin } = useDriverAuth();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleStep1 = () => {
    setError("");
    if (!name.trim() || name.trim().length < 2) {
      setError("Apna naam daalo (2+ characters)");
      return;
    }
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setError("Valid phone number daalo (10 digits)");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Valid email daalo");
      return;
    }
    if (password.length < 6) {
      setError("Password kam se kam 6 characters ka hona chahiye");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords match nahi kar rahe");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    setError("");
    if (!vehicleType) {
      setError("Vehicle type select karo");
      return;
    }
    if (!vehicleNumber.trim()) {
      setError("Vehicle number daalo (e.g. DL 4C AB 1234)");
      return;
    }
    setLoading(true);
    try {
      const formatted = phone.trim().startsWith("+91")
        ? phone.trim()
        : `+91${phone.trim()}`;
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      const cleanVehicleNumber = vehicleNumber.trim().toUpperCase();

      // Step 1: Firebase Authentication account + Firestore "drivers" mein save
      try {
        await firebaseDriverRegister({
          name: cleanName,
          email: cleanEmail,
          password,
          phone: formatted,
          vehicleType,
          vehicleNumber: cleanVehicleNumber,
          licenseNumber: licenseNumber.trim(),
        });
      } catch (fbErr: any) {
        // Firebase email already in use
        if (fbErr?.code === "auth/email-already-in-use") {
          throw new Error("Yeh email already registered hai");
        }
        // Firebase config issue — continue without Firebase
        console.warn("[Firebase] Driver auth skipped:", fbErr?.code);
      }

      // Step 2: Backend PostgreSQL mein bhi save karo
      const res = await driverRegister({
        name: cleanName,
        phone: formatted,
        email: cleanEmail,
        password,
        vehicleType,
        vehicleNumber: cleanVehicleNumber,
        licenseNumber: licenseNumber.trim(),
      });
      await saveDriverLogin(res.token, res.driver);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Registration failed");
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
            <Text style={styles.title}>{t("driver_reg_title")}</Text>
            <Text style={styles.subtitle}>
              Step {step}/2 — {step === 1 ? "Personal Details" : "Vehicle Details"}
            </Text>
            <View style={styles.stepBar}>
              <View style={[styles.stepDot, { backgroundColor: "#22c55e" }]} />
              <View style={[styles.stepLine, { backgroundColor: step === 2 ? "#22c55e" : "rgba(255,255,255,0.15)" }]} />
              <View style={[styles.stepDot, { backgroundColor: step === 2 ? "#22c55e" : "rgba(255,255,255,0.2)" }]} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.card}>
            {step === 1 ? (
              <>
                <Field label="Poora Naam" placeholder="Raj Kumar" value={name} onChangeText={setName} />
                <Field
                  label="Phone Number"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  prefix="+91"
                />
                <Field
                  label="Email"
                  placeholder="driver@email.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
                <Field
                  label="Password"
                  placeholder="6+ characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  rightElement={
                    <Pressable onPress={() => setShowPassword(!showPassword)}>
                      <Text style={{ fontSize: 18 }}>{showPassword ? "🙈" : "👁️"}</Text>
                    </Pressable>
                  }
                />
                <Field
                  label="Confirm Password"
                  placeholder="Password dobara daalo"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />

                {error ? <ErrorBox message={error} /> : null}

                <Pressable onPress={handleStep1} style={styles.btn}>
                  <LinearGradient colors={["#22c55e", "#16a34a"]} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={styles.btnText}>Aage Jao →</Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Vehicle Type</Text>
                <View style={styles.vehicleGrid}>
                  {VEHICLE_OPTIONS.map((v) => (
                    <Pressable
                      key={v.id}
                      onPress={() => setVehicleType(v.id)}
                      style={[
                        styles.vehicleCard,
                        vehicleType === v.id && styles.vehicleCardActive,
                      ]}
                    >
                      <Text style={{ fontSize: 28, marginBottom: 4 }}>{v.icon}</Text>
                      <Text style={[styles.vehicleLabel, vehicleType === v.id && { color: "#22c55e" }]}>{v.label}</Text>
                      <Text style={styles.vehicleDesc}>{v.desc}</Text>
                    </Pressable>
                  ))}
                </View>

                <Field
                  label="Vehicle Number"
                  placeholder="DL 4C AB 1234"
                  value={vehicleNumber}
                  onChangeText={setVehicleNumber}
                />
                <Field
                  label="Driving License Number (Optional)"
                  placeholder="DL-1234567890123"
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                />

                {error ? <ErrorBox message={error} /> : null}

                <Pressable onPress={handleSubmit} disabled={loading} style={styles.btn}>
                  <LinearGradient colors={["#22c55e", "#16a34a"]} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnText}>Register Karo ✓</Text>
                    )}
                  </LinearGradient>
                </Pressable>

                <Pressable onPress={() => setStep(1)} style={{ marginTop: 12, alignItems: "center" }}>
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>← Peeche Jao</Text>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() => router.push("/driver-auth/login")}
              style={styles.loginLink}
            >
              <Text style={styles.loginLinkText}>
                Already registered?{" "}
                <Text style={{ color: "#22c55e", fontWeight: "600" }}>Login karo</Text>
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

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  maxLength,
  secureTextEntry,
  prefix,
  rightElement,
}: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input]}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType || "default"}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
        />
        {rightElement}
      </View>
    </View>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>⚠️ {message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24 },
  header: { alignItems: "center", marginBottom: 28 },
  emoji: { fontSize: 48, marginBottom: 10 },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 16 },
  stepBar: { flexDirection: "row", alignItems: "center", width: 100 },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepLine: { flex: 1, height: 2, marginHorizontal: 4 },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  label: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 8, fontWeight: "500" },
  sectionLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 12, fontWeight: "500" },
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
  vehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  vehicleCard: {
    width: "47%",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  vehicleCardActive: {
    borderColor: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  vehicleLabel: { fontSize: 14, fontWeight: "600", color: "#fff", marginBottom: 2 },
  vehicleDesc: { fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  errorText: { color: "#f87171", fontSize: 13 },
  btn: { marginTop: 8, borderRadius: 14, overflow: "hidden" },
  btnGrad: { height: 52, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  loginLink: { marginTop: 16, alignItems: "center" },
  loginLinkText: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  backLink: { marginTop: 28, alignItems: "center" },
  backLinkText: { color: "rgba(255,255,255,0.35)", fontSize: 13 },
});
