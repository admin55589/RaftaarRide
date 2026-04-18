import React, { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Alert,
  Platform,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MapView } from "@/components/MapView";
import { useVoiceAI } from "@/hooks/useVoiceAI";

function StarRating({ rating }: { rating: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={{ fontSize: 13, color: colors.primary }}>
          {i < Math.floor(rating) ? "⭐" : "☆"}
        </Text>
      ))}
    </View>
  );
}

function AvatarCircle({ initials }: { initials: string }) {
  const colors = useColors();
  const scale = useSharedValue(0.8);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + "33", borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" }, style]}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.primary }}>{initials}</Text>
    </Animated.View>
  );
}

function ETABar({ eta }: { eta: number }) {
  const colors = useColors();
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withRepeat(
      withSequence(
        withTiming(1, { duration: eta * 1000 }),
        withTiming(0, { duration: 0 })
      ), -1, false
    );
  }, [eta]);
  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as any,
  }));
  return (
    <View style={[styles.etaBarBg, { backgroundColor: colors.secondary }]}>
      <Animated.View style={[styles.etaBarFill, { backgroundColor: colors.primary }, barStyle]} />
    </View>
  );
}

export function DriverAssignedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assignedDriver, setScreen, selectedVehicle, pickup, destination } = useApp();
  const { announceDriverFound } = useVoiceAI();

  const driver = assignedDriver ?? {
    name: "Raj Kumar",
    rating: 4.8,
    vehicle: "Swift Dzire",
    vehicleNumber: "DL 4C AB 1234",
    vehicleType: selectedVehicle,
    eta: 5,
    photo: "RK",
  };

  const vehicleColor =
    driver.vehicleType === "bike"
      ? colors.bikeColor
      : driver.vehicleType === "auto"
      ? colors.autoColor
      : colors.cabColor;

  useEffect(() => {
    announceDriverFound(driver.name, driver.eta);
  }, []);

  const handleCall = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Calling Driver", `Calling ${driver.name}...`);
  };

  const handleChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Chat", "In-app chat coming soon!");
  };

  const handleShareLocation = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const vehicleEmoji = driver.vehicleType === "bike" ? "🏍️" : driver.vehicleType === "auto" ? "🛺" : "🚗";
    const message = [
      `${vehicleEmoji} Main RaftaarRide mein hoon!`,
      ``,
      `👤 Driver: ${driver.name} (⭐ ${driver.rating})`,
      `🚘 Vehicle: ${driver.vehicle}`,
      `🔢 Number: ${driver.vehicleNumber}`,
      `⏱️ ETA: ${driver.eta} min`,
      ``,
      `📍 Pickup: ${pickup || "Current location"}`,
      `🏁 Destination: ${destination || "Unknown"}`,
      ``,
      `RaftaarRide se book kiya gaya — safe & fast! ⚡`,
    ].join("\n");

    try {
      await Share.share({ message, title: "Meri Ride Track Karo 🚗" });
    } catch {
      Alert.alert("Share Error", "Location share nahi ho saki.");
    }
  };

  const handleCancel = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Cancel Ride", "Are you sure?", [
      { text: "No" },
      { text: "Yes", style: "destructive", onPress: () => setScreen("home") },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView />

      <Animated.View entering={FadeInUp.springify()} style={styles.sheet}>
        <GlassCard style={styles.card} padding={0}>
          <View style={styles.handle} />

          <View style={styles.content}>
            <Animated.View entering={FadeInDown.springify()} style={styles.etaRow}>
              <View style={[styles.etaBadge, { backgroundColor: vehicleColor + "22", borderColor: vehicleColor }]}>
                <Feather name="clock" size={16} color={vehicleColor} />
                <Text style={[styles.etaText, { color: vehicleColor }]}>
                  {driver.eta} min away
                </Text>
              </View>
              <ETABar eta={driver.eta * 60} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.driverRow}>
              <AvatarCircle initials={driver.photo} />
              <View style={styles.driverInfo}>
                <Text style={[styles.driverName, { color: colors.foreground }]}>{driver.name}</Text>
                <StarRating rating={driver.rating} />
                <Text style={[styles.driverVehicle, { color: colors.mutedForeground }]}>
                  {driver.vehicle}
                </Text>
                <Text style={[styles.driverPlate, { color: vehicleColor }]}>
                  {driver.vehicleNumber}
                </Text>
              </View>
              <View style={styles.actionBtns}>
                <Pressable
                  onPress={handleCall}
                  style={[styles.actionBtn, { backgroundColor: colors.success + "22", borderColor: colors.success }]}
                >
                  <Text style={styles.actionBtnEmoji}>📞</Text>
                </Pressable>
                <Pressable
                  onPress={handleChat}
                  style={[styles.actionBtn, { backgroundColor: vehicleColor + "22", borderColor: vehicleColor }]}
                >
                  <Text style={styles.actionBtnEmoji}>💬</Text>
                </Pressable>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.bottomActions}>
              <Pressable onPress={handleCancel} style={[styles.cancelBtn, { borderColor: colors.destructive }]}>
                <Text style={[styles.cancelText, { color: colors.destructive }]}>Cancel Ride</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Track Live"
                  onPress={() => setScreen("live_tracking")}
                  size="md"
                />
              </View>
            </Animated.View>

            <View style={[styles.sosRow, { paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 0) + 4 }]}>
              <Pressable style={[styles.sosBtn, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive }]}>
                <Feather name="alert-triangle" size={14} color={colors.destructive} />
                <Text style={[styles.sosText, { color: colors.destructive }]}>SOS</Text>
              </Pressable>
              <Pressable
                onPress={handleShareLocation}
                style={({ pressed }) => [
                  styles.shareBtn,
                  {
                    backgroundColor: pressed ? colors.primary + "22" : colors.secondary,
                    borderColor: pressed ? colors.primary : colors.border,
                  },
                ]}
              >
                <Feather name="share-2" size={14} color={colors.primary} />
                <Text style={[styles.shareText, { color: colors.primary }]}>Share Location</Text>
              </Pressable>
            </View>
          </View>
        </GlassCard>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: "rgba(22,22,30,0.97)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 12,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  etaRow: {
    gap: 8,
  },
  etaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  etaText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  etaBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  etaBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverInfo: {
    flex: 1,
    gap: 3,
  },
  driverName: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  driverVehicle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
  },
  driverPlate: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 1,
  },
  actionBtns: {
    gap: 8,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnEmoji: {
    fontSize: 20,
  },
  bottomActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  cancelBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  sosRow: {
    flexDirection: "row",
    gap: 10,
  },
  sosBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  sosText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flex: 1,
    justifyContent: "center",
  },
  shareText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
