import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
} from "react-native";
import Animated, {
  FadeInDown,
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

interface Props {
  visible: boolean;
  onClose: () => void;
}

const EMERGENCY_OPTIONS = [
  { number: "112", label: "Emergency (All)", icon: "🆘", color: "#EF4444", sub: "Police + Ambulance + Fire" },
  { number: "100", label: "Police",           icon: "👮", color: "#3B82F6", sub: "Nearest police station" },
  { number: "102", label: "Ambulance",        icon: "🚑", color: "#10B981", sub: "Medical emergency" },
  { number: "1091", label: "Women Helpline",  icon: "🛡️", color: "#8B5CF6", sub: "Women safety helpline" },
];

export function SOSModal({ visible, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = useColors();
  const pulseScale = useSharedValue(1);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (visible) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 700, easing: Easing.out(Easing.sin) }),
          withTiming(1, { duration: 700 })
        ),
        -1, false
      );
      ringScale.value = withRepeat(
        withSequence(withTiming(1.5, { duration: 1000 }), withTiming(1, { duration: 0 })),
        -1, false
      );
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0, { duration: 1000 }), withTiming(0.5, { duration: 0 })),
        -1, false
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      pulseScale.value = 1;
      ringScale.value = 1;
      ringOpacity.value = 0.6;
    }
  }, [visible]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const dial = async (number: string, label: string) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    onClose();
    if (Platform.OS === "web") {
      Alert.alert(`📞 ${label}`, `Calling ${number}...\n\n(On physical device, this dials immediately)`);
      return;
    }
    const url = `tel:${number}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Call Failed", `Please dial ${number} manually`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <BlurView intensity={isDark ? 80 : 60} tint="dark" style={StyleSheet.absoluteFill}>
        <Pressable style={st.backdrop} onPress={onClose}>
          <Animated.View entering={FadeInUp.springify().damping(14).stiffness(120)} style={st.sheet}>
            <Pressable style={{ width: "100%" }}>

              <View style={st.pulseContainer}>
                <Animated.View style={[st.pulseRing, ringStyle]} />
                <Animated.View style={[st.pulseBtn, pulseStyle]}>
                  <View style={st.pulseInner}>
                    <Text style={{ fontSize: 32, lineHeight: 38 }}>🆘</Text>
                  </View>
                </Animated.View>
              </View>

              <Text style={st.title}>Emergency SOS</Text>
              <Text style={st.sub}>Apni safety ke liye turant help maangein</Text>

              <View style={st.optionsList}>
                {EMERGENCY_OPTIONS.map((opt, i) => (
                  <Animated.View key={opt.number} entering={FadeInDown.delay(80 + i * 60).springify()}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => dial(opt.number, opt.label)}
                      style={[st.optionCard, { borderColor: opt.color + "55", backgroundColor: opt.color + "18" }]}
                    >
                      <View style={[st.iconCircle, { backgroundColor: opt.color + "25" }]}>
                        <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                      </View>
                      <View style={st.optionText}>
                        <Text style={[st.optionLabel, { color: opt.color }]} numberOfLines={1}>
                          {opt.label}
                        </Text>
                        <Text style={st.optionSub} numberOfLines={1}>{opt.sub}</Text>
                      </View>
                      <View style={[st.callChip, { backgroundColor: opt.color }]}>
                        <Text style={st.callNum}>{opt.number}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </View>

              <TouchableOpacity style={st.dismissBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={st.dismissTxt}>✕  Main safe hoon</Text>
              </TouchableOpacity>

            </Pressable>
          </Animated.View>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: "#0F0F17",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.30)",
    borderBottomWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    alignItems: "center",
    shadowColor: "#EF4444",
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 30,
  },
  pulseContainer: { width: 100, height: 100, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  pulseRing: {
    position: "absolute",
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2.5, borderColor: "#EF4444", backgroundColor: "transparent",
  },
  pulseBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "rgba(239,68,68,0.18)",
    borderWidth: 2, borderColor: "rgba(239,68,68,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  pulseInner: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", fontFamily: "Inter_700Bold", color: "#FFFFFF", textAlign: "center", marginBottom: 5 },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8A8A9A", textAlign: "center", marginBottom: 24 },
  optionsList: { width: "100%", gap: 10, marginBottom: 20 },
  optionCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, borderWidth: 1.5,
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
  },
  iconCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  optionText: { flex: 1, flexDirection: "column", justifyContent: "center", minWidth: 0 },
  optionLabel: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700", marginBottom: 2 },
  optionSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#8A8A9A" },
  callChip: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7, alignItems: "center", justifyContent: "center", flexShrink: 0, minWidth: 52 },
  callNum: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700", letterSpacing: 0.3 },
  dismissBtn: {
    width: "100%", paddingVertical: 15, borderRadius: 16,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center",
  },
  dismissTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
});
