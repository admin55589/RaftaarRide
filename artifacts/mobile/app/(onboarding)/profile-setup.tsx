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
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const GENDERS = ["Male", "Female", "Other"];

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState(false);
  const [hasReferral, setHasReferral] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!name.trim()) {
      setError("Apna naam daalo");
      return;
    }
    setError("");
    router.push("/(onboarding)/location");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient colors={["#0A0A0F", "#12121A", "#0A0A0F"]} style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.inner,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, styles.stepActive]} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
            </View>
            <Text style={styles.stepLabel}>Step 1 of 3</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.iconWrap}>
            <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.bigIcon}>
              <Text style={styles.bigIconText}>🎉</Text>
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={styles.heading}>Ek aakhri step!</Text>
            <Text style={styles.subheading}>
              Aapki profile complete karein — raftaar shuru hogi!
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
                  key={g}
                  style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
                    {g}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />

            <Pressable style={styles.checkRow} onPress={() => setWhatsapp(!whatsapp)}>
              <View style={styles.checkLeft}>
                <Text style={styles.checkIcon}>💬</Text>
                <Text style={styles.checkLabel}>WhatsApp pe updates lein</Text>
              </View>
              <View style={[styles.checkbox, whatsapp && styles.checkboxActive]}>
                {whatsapp && <Text style={{ fontSize: 13, color: "#0A0A0F", lineHeight: 16 }}>✓</Text>}
              </View>
            </Pressable>

            <Pressable style={styles.checkRow} onPress={() => setHasReferral(!hasReferral)}>
              <View style={styles.checkLeft}>
                <Text style={styles.checkIcon}>🎁</Text>
                <Text style={styles.checkLabel}>Referral code hai?</Text>
              </View>
              <View style={[styles.checkbox, hasReferral && styles.checkboxActive]}>
                {hasReferral && <Text style={{ fontSize: 13, color: "#0A0A0F", lineHeight: 16 }}>✓</Text>}
              </View>
            </Pressable>

            {hasReferral && (
              <Animated.View entering={FadeInDown.springify()} style={[styles.inputWrap, { marginTop: 12 }]}>
                <Text style={{ fontSize: 18, lineHeight: 22, marginRight: 10, color: "#8A8A9A" }}>🎁</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Referral code daalo"
                  placeholderTextColor="#8A8A9A"
                  value={referralCode}
                  onChangeText={setReferralCode}
                  autoCapitalize="characters"
                />
              </Animated.View>
            )}

            <Pressable style={styles.primaryBtn} onPress={handleNext}>
              <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.primaryGrad}>
                <Text style={styles.primaryText}>Aage Badho →</Text>
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
  header: { marginBottom: 32 },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  stepDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#2A2A38",
  },
  stepActive: { backgroundColor: "#F5A623", width: 24, borderRadius: 6 },
  stepLine: { flex: 1, height: 2, backgroundColor: "#2A2A38", marginHorizontal: 4 },
  stepLabel: { color: "#8A8A9A", fontSize: 13 },
  iconWrap: { alignItems: "flex-start", marginBottom: 24 },
  bigIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
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
  genderRow: { flexDirection: "row", gap: 12 },
  genderBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: "#16161E", borderWidth: 1.5, borderColor: "#2A2A38",
    alignItems: "center",
  },
  genderBtnActive: { borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.1)" },
  genderText: { color: "#8A8A9A", fontWeight: "600", fontSize: 14 },
  genderTextActive: { color: "#F5A623" },
  divider: { height: 1, backgroundColor: "#1E1E28", marginVertical: 24 },
  checkRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: "#16161E", borderRadius: 14,
    borderWidth: 1, borderColor: "#2A2A38", marginBottom: 12,
  },
  checkLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  checkIcon: { fontSize: 22 },
  checkLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "500", flex: 1 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: "#2A2A38",
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive: { backgroundColor: "#F5A623", borderColor: "#F5A623" },
  primaryBtn: { marginTop: 32, borderRadius: 16, overflow: "hidden" },
  primaryGrad: { paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#0A0A0F", fontWeight: "800", fontSize: 16 },
});
