import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Alert,
  Linking,
} from "react-native";
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

export interface CallDriver {
  name: string;
  phone?: string;
  vehicle: string;
  vehicleNumber: string;
  photo: string;
  rating: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  driver: CallDriver;
}

const CALL_COLOR = "#22C55E";

export function CallModal({ visible, onClose, driver }: Props) {
  const { isDark } = useTheme();
  const colors = useColors();
  const ringScale1 = useSharedValue(1);
  const ringOpacity1 = useSharedValue(0.5);
  const ringScale2 = useSharedValue(1);
  const ringOpacity2 = useSharedValue(0.4);

  useEffect(() => {
    if (visible) {
      ringScale1.value = withRepeat(
        withSequence(withTiming(1.7, { duration: 1400 }), withTiming(1, { duration: 0 })),
        -1, false
      );
      ringOpacity1.value = withRepeat(
        withSequence(withTiming(0, { duration: 1400 }), withTiming(0.5, { duration: 0 })),
        -1, false
      );
      ringScale2.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: 0 }),
          withTiming(1.7, { duration: 1400, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 0 })
        ),
        -1, false
      );
      ringOpacity2.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(0.4, { duration: 0 }),
          withTiming(0, { duration: 1400 }),
          withTiming(0, { duration: 0 })
        ),
        -1, false
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      ringScale1.value = 1;
      ringOpacity1.value = 0.5;
      ringScale2.value = 1;
      ringOpacity2.value = 0.4;
    }
  }, [visible]);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale1.value }],
    opacity: ringOpacity1.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale2.value }],
    opacity: ringOpacity2.value,
  }));

  const doCall = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!driver.phone) {
      Alert.alert(
        "📞 " + driver.name,
        "Is ride ka driver number abhi available nahi hai.\n\nPlease chat se contact karein.",
        [{ text: "OK" }]
      );
      return;
    }
    const url = `tel:${driver.phone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Call", `Please dial ${driver.phone} manually`);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <BlurView intensity={isDark ? 85 : 65} tint="dark" style={StyleSheet.absoluteFill}>
        <Pressable style={cm.backdrop} onPress={onClose}>
          <Animated.View entering={FadeInUp.springify().damping(14).stiffness(120)} style={cm.sheet}>
            <Pressable style={{ width: "100%", alignItems: "center" }}>

              <View style={cm.avatarWrap}>
                <Animated.View style={[cm.ring, { borderColor: CALL_COLOR }, ring1Style]} />
                <Animated.View style={[cm.ring, { borderColor: CALL_COLOR }, ring2Style]} />
                <View style={[cm.avatar, { backgroundColor: CALL_COLOR + "25", borderColor: CALL_COLOR + "60" }]}>
                  <Text style={cm.avatarText}>{driver.photo}</Text>
                </View>
              </View>

              <Text style={[cm.callingLabel, { color: colors.mutedForeground }]}>Connecting call...</Text>
              <Text style={[cm.driverName, { color: "#FFFFFF" }]}>{driver.name}</Text>
              <Text style={[cm.driverSub, { color: colors.mutedForeground }]}>
                {driver.vehicle} • {driver.vehicleNumber}
              </Text>
              <View style={cm.ratingRow}>
                <Text style={{ fontSize: 12 }}>⭐</Text>
                <Text style={[cm.ratingTxt, { color: "#F5A623" }]}>{driver.rating.toFixed(1)}</Text>
              </View>

              <View style={cm.actionRow}>
                <TouchableOpacity onPress={onClose} style={cm.sideBtn} activeOpacity={0.8}>
                  <Text style={{ fontSize: 22 }}>✕</Text>
                  <Text style={cm.sideBtnLabel}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={doCall}
                  style={[cm.callBtn, { backgroundColor: CALL_COLOR }]}
                  activeOpacity={0.85}
                >
                  <Text style={{ fontSize: 28 }}>📞</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onClose}
                  style={[cm.sideBtn, { backgroundColor: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.35)" }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 22 }}>💬</Text>
                  <Text style={[cm.sideBtnLabel, { color: "#93C5FD" }]}>Chat</Text>
                </TouchableOpacity>
              </View>

              <Text style={[cm.phoneLine, { color: colors.mutedForeground }]}>
                {driver.phone ? `📱 ${driver.phone}` : "Number fetching..."}
              </Text>

            </Pressable>
          </Animated.View>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

const cm = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: "#0F0F17",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.28)",
    borderBottomWidth: 0,
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 28,
    alignItems: "center",
    shadowColor: "#22C55E",
    shadowOpacity: 0.35,
    shadowRadius: 40,
    elevation: 30,
  },
  avatarWrap: {
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  ring: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#22C55E",
    fontFamily: "Inter_700Bold",
  },
  callingLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  driverName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  driverSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 6,
    textAlign: "center",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 36,
  },
  ratingTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    marginBottom: 20,
  },
  callBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#22C55E",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
  },
  sideBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  sideBtnLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "#8A8A9A",
  },
  phoneLine: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
