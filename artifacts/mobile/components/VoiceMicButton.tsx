import React, { useEffect } from "react";
import { Pressable, Text, StyleSheet, View, ActivityIndicator } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { type VoiceInputState } from "@/hooks/useVoiceInput";
import { useLanguage } from "@/context/LanguageContext";

interface VoiceMicButtonProps {
  state: VoiceInputState;
  onToggle: () => void;
  size?: number;
}

export function VoiceMicButton({ state, onToggle, size = 36 }: VoiceMicButtonProps) {
  const colors = useColors();
  const { lang } = useLanguage();
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (state === "listening") {
      scale.value = withRepeat(
        withSequence(withSpring(1.2), withSpring(1.0)),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(withTiming(0.6, { duration: 600 }), withTiming(0.1, { duration: 600 })),
        -1,
        false
      );
    } else {
      scale.value = withSpring(1);
      glowOpacity.value = withTiming(0);
    }
  }, [state]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const isListening = state === "listening";
  const isProcessing = state === "processing";

  const bgColor = isListening
    ? "#EF4444"
    : isProcessing
    ? colors.border
    : `${colors.primary}22`;

  const borderColor = isListening
    ? "#EF4444"
    : isProcessing
    ? colors.border
    : `${colors.primary}66`;

  return (
    <Pressable onPress={onToggle} disabled={isProcessing} accessibilityLabel={lang === "hi" ? "Voice input" : "Voice input"}>
      <View style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
        {isListening && (
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                borderRadius: size / 2 + 6,
                backgroundColor: "#EF444444",
                margin: -6,
              },
              glowStyle,
            ]}
          />
        )}
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: bgColor,
              borderWidth: 1.5,
              borderColor,
              alignItems: "center",
              justifyContent: "center",
            },
            animStyle,
          ]}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={{ fontSize: size * 0.45 }}>{isListening ? "⏹" : "🎤"}</Text>
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}
