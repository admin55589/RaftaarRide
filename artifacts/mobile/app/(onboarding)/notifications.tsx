import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function NotificationPermissionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const handleAllow = () => {
    router.replace("/(tabs)");
  };

  const handleLater = () => {
    router.replace("/(tabs)");
  };

  return (
    <LinearGradient colors={["#0A0A0F", "#12121A", "#0A0A0F"]} style={styles.container}>
      <View style={[styles.inner, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}>
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.stepRow}>
          <View style={styles.stepDot} />
          <View style={styles.stepLine} />
          <View style={styles.stepDot} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, styles.stepActive]} />
          <Text style={styles.stepLabel}>  Step 3 of 3</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.iconWrap}>
          <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.bigIcon}>
            <Text style={styles.bigIconText}>🔔</Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <Text style={styles.heading}>Notifications Allow Karo</Text>
          <Text style={styles.subheading}>
            Ride alerts aur important updates ke liye notifications zaroori hain
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).springify()} style={styles.benefitsCard}>
          <View style={styles.benefitRow}>
            <View style={styles.benefitIcon}>
              <Feather name="map-pin" size={20} color="#F5A623" />
            </View>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>Real-time Driver Updates</Text>
              <Text style={styles.benefitDesc}>
                Driver allocation, arrival aur ride status — sab kuch instantly
              </Text>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.benefitRow}>
            <View style={styles.benefitIcon}>
              <Feather name="volume-2" size={20} color="#F5A623" />
            </View>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>Offers aur News</Text>
              <Text style={styles.benefitDesc}>
                Naye offers aur features sabse pehle aapko milenge
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(450).springify()} style={styles.buttonsWrap}>
          <Pressable style={styles.allowBtn} onPress={handleAllow}>
            <LinearGradient colors={["#F5A623", "#E09010"]} style={styles.allowGrad}>
              <Feather name="bell" size={18} color="#0A0A0F" />
              <Text style={styles.allowText}>Allow Karo</Text>
            </LinearGradient>
          </Pressable>

          <Pressable style={styles.laterBtn} onPress={handleLater}>
            <Text style={styles.laterText}>Baad mein</Text>
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
  stepActive: { backgroundColor: "#F5A623", width: 24, borderRadius: 6 },
  stepLine: { flex: 1, height: 2, backgroundColor: "#2A2A38", marginHorizontal: 4 },
  stepLabel: { color: "#8A8A9A", fontSize: 13, marginLeft: 4 },
  iconWrap: { alignItems: "flex-start", marginBottom: 24 },
  bigIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  bigIconText: { fontSize: 36 },
  heading: { fontSize: 26, fontWeight: "800", color: "#FFFFFF", marginBottom: 8 },
  subheading: { fontSize: 14, color: "#8A8A9A", lineHeight: 21, marginBottom: 28 },
  benefitsCard: {
    backgroundColor: "#16161E", borderRadius: 20,
    borderWidth: 1, borderColor: "#2A2A38", padding: 20,
    marginBottom: 32, flex: 1,
  },
  benefitRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  benefitIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(245,166,35,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  benefitText: { flex: 1 },
  benefitTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 15, marginBottom: 4 },
  benefitDesc: { color: "#8A8A9A", fontSize: 13, lineHeight: 19 },
  separator: { height: 1, backgroundColor: "#1E1E28", marginVertical: 18 },
  buttonsWrap: { gap: 12 },
  allowBtn: { borderRadius: 16, overflow: "hidden" },
  allowGrad: {
    paddingVertical: 16, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  allowText: { color: "#0A0A0F", fontWeight: "800", fontSize: 16 },
  laterBtn: {
    paddingVertical: 16, borderRadius: 16, alignItems: "center",
    borderWidth: 1.5, borderColor: "#2A2A38", backgroundColor: "#16161E",
  },
  laterText: { color: "#8A8A9A", fontWeight: "600", fontSize: 15 },
});
