import React from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { useColors } from "@/hooks/useColors";

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
}

export function GlassCard({
  children,
  style,
  padding = 20,
  borderRadius = 24,
}: GlassCardProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.glassBackground,
          borderColor: colors.glassBorder,
          borderRadius,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: "hidden",
  },
});
