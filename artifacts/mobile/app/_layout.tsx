import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider, useApp } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DriverAuthProvider, useDriverAuth } from "@/context/DriverAuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function HistorySyncer() {
  const { token, isLoggedIn } = useAuth();
  const { refreshHistoryFromServer } = useApp();

  useEffect(() => {
    if (isLoggedIn && token) {
      refreshHistoryFromServer(token);
    }
  }, [isLoggedIn, token]);

  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const { isDriverLoggedIn, isDriverLoading } = useDriverAuth();
  const segments = useSegments();
  const router = useRouter();

  const anyLoading = isLoading || isDriverLoading;
  const inAuthGroup = segments[0] === "auth";
  const inDriverAuthGroup = segments[0] === "driver-auth";
  const inOnboarding = segments[0] === "(onboarding)";
  const inTerms = segments[0] === "terms";
  const inProtectedArea = !inAuthGroup && !inDriverAuthGroup && !inOnboarding && !inTerms;

  useEffect(() => {
    if (anyLoading) return;

    if (isDriverLoggedIn) {
      if (inAuthGroup || inDriverAuthGroup) {
        router.replace("/(tabs)");
      }
      return;
    }

    if (isLoggedIn) {
      if (inAuthGroup || inDriverAuthGroup) {
        router.replace("/(onboarding)/profile-setup");
      }
      return;
    }

    if (!isLoggedIn && !isDriverLoggedIn && inProtectedArea) {
      router.replace("/auth/login");
    }
  }, [isLoggedIn, isDriverLoggedIn, anyLoading, segments]);

  if (anyLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#F5A623" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="driver-auth" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
              <LanguageProvider>
                <AuthProvider>
                  <DriverAuthProvider>
                    <AppProvider>
                      <NotificationProvider>
                        <HistorySyncer />
                        <AuthGuard>
                          <RootLayoutNav />
                        </AuthGuard>
                      </NotificationProvider>
                    </AppProvider>
                  </DriverAuthProvider>
                </AuthProvider>
              </LanguageProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
