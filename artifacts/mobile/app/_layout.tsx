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
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { View } from "react-native";

import { AppSplash } from "@/components/AppSplash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useNotificationHandler } from "@/hooks/usePushNotifications";
import { AppProvider, useApp } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DriverAuthProvider, useDriverAuth } from "@/context/DriverAuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import "@/lib/backgroundLocation";

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
  const { isLoggedIn, isLoading, loginInProgress } = useAuth();
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
      // Allow driver to access forgot-password even when logged in (to change password)
      const isDriverForgotPwd = inDriverAuthGroup && segments[1] === "forgot-password";
      if (!isDriverForgotPwd && (inAuthGroup || inDriverAuthGroup)) {
        router.replace("/(tabs)");
      }
      return;
    }

    if (isLoggedIn) {
      // Allow user to access forgot-password even when logged in (to change password)
      const isUserForgotPwd = inAuthGroup && segments[1] === "forgot-password";
      if (!isUserForgotPwd && (inAuthGroup || inDriverAuthGroup)) {
        router.replace("/(onboarding)/profile-setup");
      }
      return;
    }

    if (!isLoggedIn && !isDriverLoggedIn && inProtectedArea) {
      /* Skip redirect if a login() call is in flight — the state commit
         (setToken/setUser) hasn't propagated yet but the user is already
         being navigated to the protected screen by the login handler.
         Without this guard the AuthGuard would bounce the user back to
         /auth/login during that brief window, causing the "immediate
         logout" bug. */
      if (!loginInProgress.current) {
        router.replace("/auth/login");
      }
    }
  }, [isLoggedIn, isDriverLoggedIn, anyLoading, segments]);

  useNotificationHandler();

  if (anyLoading) {
    return <AppSplash />;
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0A0A0F" },
      }}
    >
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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return <AppSplash />;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
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
                        <OfflineBanner />
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
