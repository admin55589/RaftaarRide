import { Stack } from "expo-router";
import React from "react";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#0A0A0F" },
      }}
    >
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="location" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
