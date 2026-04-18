import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useApp } from "@/context/AppContext";

export default function LocationPermissionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setCurrentLocationAddress, setPickup } = useApp();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "denied">("idle");
  const [mode, setMode] = useState<"precise" | "approximate">("precise");

  const fetchAndStoreLocation = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: mode === "precise"
          ? Location.Accuracy.High
          : Location.Accuracy.Balanced,
      });

      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      if (geo) {
        const parts = [
          geo.name,
          geo.street,
          geo.subregion ?? geo.district,
          geo.city,
        ].filter(Boolean);

        const addr = parts.slice(0, 3).join(", ") || "Current Location";
        setCurrentLocationAddress(addr);
        setPickup(addr);
      }
    } catch (_) {}
  };

  const handleAllow = async () => {
    setLoading(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus === "granted") {
        await fetchAndStoreLocation();
        setStatus("success");
      } else {
        setStatus("denied");
      }
    } catch (_) {
      setStatus("denied");
    }
    setLoading(false);
    router.push("/(onboarding)/notifications");
  };

  const handleOnce = async () => {
    setLoading(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus === "granted") {
        await fetchAndStoreLocation();
      }
    } catch (_) {}
    setLoading(false);
    router.push("/(onboarding)/notifications");
  };

  const handleSkip = () => {
    router.push("/(onboarding)/notifications");
  };

  return (
    <LinearGradient colors={["#0A0A0F", "#12121A", "#0A0A0F"]} style={styles.container}>
      <View style={[styles.inner, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}>
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.stepRow}>
          <View style={styles.stepDot} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, styles.stepActive]} />
          <View style={styles.stepLine} />
          <View style={styles.stepDot} />
          <Text style={styles.stepLabel}>  Step 2 of 3</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.iconWrap}>
          <LinearGradient colors={["#4A80F0", "#2560D0"]} style={styles.bigIcon}>
            <Text style={styles.bigIconText}>📍</Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <Text style={styles.heading}>Location Access Chahiye</Text>
          <Text style={styles.subheading}>
            RaftaarRide ko aapki location chahiye taaki aapke najdeek driver dhundha ja sake
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.infoCard}>
          <Feather name="shield" size={18} color="#8A8A9A" />
          <Text style={styles.infoText}>
            Aapka location sirf ride tracking ke liye use hoga — kabhi bhi third party ke saath share nahi hoga
          </Text>
          <Feather name="chevron-right" size={16} color="#8A8A9A" />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.modeRow}>
          <Pressable
            style={[styles.modeCard, mode === "precise" && styles.modeCardActive]}
            onPress={() => setMode("precise")}
          >
            <View style={styles.mapPreview}>
              <Text style={styles.mapEmoji}>🗺️</Text>
              <View style={styles.pinDot} />
            </View>
            <Text style={[styles.modeName, mode === "precise" && styles.modeNameActive]}>
              Precise
            </Text>
            {mode === "precise" && (
              <View style={styles.modeCheck}>
                <Feather name="check-circle" size={16} color="#F5A623" />
              </View>
            )}
          </Pressable>

          <Pressable
            style={[styles.modeCard, mode === "approximate" && styles.modeCardActive]}
            onPress={() => setMode("approximate")}
          >
            <View style={styles.mapPreview}>
              <Text style={styles.mapEmoji}>🌐</Text>
            </View>
            <Text style={[styles.modeName, mode === "approximate" && styles.modeNameActive]}>
              Approximate
            </Text>
            {mode === "approximate" && (
              <View style={styles.modeCheck}>
                <Feather name="check-circle" size={16} color="#F5A623" />
              </View>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(450).springify()} style={styles.buttonsWrap}>
          <Pressable style={styles.allowBtn} onPress={handleAllow} disabled={loading}>
            <LinearGradient colors={["#4A80F0", "#2560D0"]} style={styles.allowGrad}>
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Feather name="map-pin" size={18} color="#FFFFFF" />
              )}
              <Text style={styles.allowText}>
                {loading ? "Location mil rahi hai..." : "Location Share Karo"}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable style={styles.outlineBtn} onPress={handleOnce} disabled={loading}>
            <Text style={styles.outlineText}>Sirf is baar allow karo</Text>
          </Pressable>

          <Pressable style={styles.skipBtn} onPress={handleSkip} disabled={loading}>
            <Text style={styles.skipText}>Abhi nahi</Text>
          </Pressable>

          <Pressable style={styles.manualBtn} onPress={handleSkip} disabled={loading}>
            <Feather name="edit-2" size={14} color="#8A8A9A" />
            <Text style={styles.manualText}>Pickup manually enter karo</Text>
          </Pressable>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24 },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
  stepDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#2A2A38",
  },
  stepActive: { backgroundColor: "#4A80F0", width: 24, borderRadius: 6 },
  stepLine: { flex: 1, height: 2, backgroundColor: "#2A2A38", marginHorizontal: 4 },
  stepLabel: { color: "#8A8A9A", fontSize: 13, marginLeft: 4 },
  iconWrap: { alignItems: "flex-start", marginBottom: 24 },
  bigIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  bigIconText: { fontSize: 36 },
  heading: { fontSize: 26, fontWeight: "800", color: "#FFFFFF", marginBottom: 8 },
  subheading: { fontSize: 14, color: "#8A8A9A", lineHeight: 21, marginBottom: 20 },
  infoCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#16161E", borderRadius: 14,
    borderWidth: 1, borderColor: "#2A2A38", padding: 14, marginBottom: 24,
  },
  infoText: { flex: 1, color: "#8A8A9A", fontSize: 13, lineHeight: 18 },
  modeRow: { flexDirection: "row", gap: 14, marginBottom: 28 },
  modeCard: {
    flex: 1, backgroundColor: "#16161E", borderRadius: 16,
    borderWidth: 1.5, borderColor: "#2A2A38", padding: 16, alignItems: "center",
    position: "relative",
  },
  modeCardActive: { borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.06)" },
  mapPreview: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#1E1E2E", alignItems: "center", justifyContent: "center",
    marginBottom: 10, position: "relative",
  },
  mapEmoji: { fontSize: 36 },
  pinDot: {
    position: "absolute", bottom: 18, left: "50%",
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: "#4A80F0", marginLeft: -6,
    borderWidth: 2, borderColor: "#FFFFFF",
  },
  modeName: { color: "#8A8A9A", fontWeight: "600", fontSize: 14 },
  modeNameActive: { color: "#F5A623" },
  modeCheck: { position: "absolute", top: 8, right: 8 },
  buttonsWrap: { gap: 12 },
  allowBtn: { borderRadius: 16, overflow: "hidden" },
  allowGrad: {
    paddingVertical: 15, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  allowText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  outlineBtn: {
    paddingVertical: 15, borderRadius: 16, alignItems: "center",
    borderWidth: 1.5, borderColor: "#2A2A38", backgroundColor: "#16161E",
  },
  outlineText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
  skipBtn: { paddingVertical: 12, alignItems: "center" },
  skipText: { color: "#8A8A9A", fontWeight: "500", fontSize: 14 },
  manualBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10,
  },
  manualText: { color: "#8A8A9A", fontSize: 13 },
});
