import { Stack } from "expo-router";
import React from "react";

export default function DriverAuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#0A0A0F" },
        cardStyle: { backgroundColor: "#0A0A0F" },
      }}
    />
  );
}
