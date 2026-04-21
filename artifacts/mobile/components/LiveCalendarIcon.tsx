import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";

const MONTHS_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

interface LiveCalendarIconProps {
  size?: "sm" | "md" | "lg";
  primaryColor?: string;
  bgColor?: string;
}

export function LiveCalendarIcon({
  size = "md",
  primaryColor = "#F5A623",
  bgColor = "#fff",
}: LiveCalendarIconProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - Date.now();
    const t = setTimeout(() => setNow(new Date()), msUntilMidnight);
    return () => clearTimeout(t);
  }, [now]);

  const day = now.getDate();
  const month = MONTHS_SHORT[now.getMonth()];

  const dims = size === "sm"
    ? { w: 28, h: 26, hdr: 8, monthFs: 5.5, dayFs: 11, radius: 5, border: 1.5 }
    : size === "lg"
    ? { w: 44, h: 42, hdr: 13, monthFs: 7.5, dayFs: 18, radius: 8, border: 2 }
    : { w: 36, h: 34, hdr: 10, monthFs: 6.5, dayFs: 14, radius: 6, border: 1.5 };

  return (
    <View style={[styles.wrap, {
      width: dims.w,
      height: dims.h,
      borderRadius: dims.radius,
      borderWidth: dims.border,
      borderColor: primaryColor,
    }]}>
      <View style={[styles.header, { height: dims.hdr, backgroundColor: primaryColor }]}>
        <Text style={[styles.month, { fontSize: dims.monthFs, color: bgColor }]}>{month}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.day, { fontSize: dims.dayFs, color: primaryColor }]}>{day}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    justifyContent: "center",
  },
  month: {
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: "Inter_700Bold",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  day: {
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    lineHeight: undefined,
  },
});
