import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface PrimaryButtonProps {
  label?: string;
  title?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  color?: string;
  textColor?: string;
  size?: "sm" | "md" | "lg";
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({
  label,
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  color,
  textColor,
  size = "lg",
}: PrimaryButtonProps) {
  const displayText = label ?? title ?? "";
  const colors = useColors();
  const scale = useSharedValue(1);

  const bgColor = color ?? colors.primary;
  const txtColor = textColor ?? colors.primaryForeground;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const height = size === "lg" ? 58 : size === "md" ? 50 : 42;
  const fontSize = size === "lg" ? 17 : size === "md" ? 15 : 13;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor: bgColor, height, borderRadius: height / 2, opacity: disabled ? 0.5 : 1 },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={txtColor} />
      ) : (
        <Text style={[styles.label, { color: txtColor, fontSize }]}>{displayText}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  label: {
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
});
