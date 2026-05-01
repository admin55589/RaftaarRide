import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform, Alert } from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "https://workspaceapi-server-production-2e22.up.railway.app/api";
})();

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("raftaarride", {
      name: "RaftaarRide",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F5A623",
      sound: "default",
    });
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

export async function savePushTokenForUser(token: string, authToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/users/push-token`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ pushToken: token }),
    });
  } catch {
    /* silent — not critical */
  }
}

export async function savePushTokenForDriver(token: string, driverToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/driver-auth/push-token`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify({ pushToken: token }),
    });
  } catch {
    /* silent — not critical */
  }
}

/* Hook — call inside AuthGuard-wrapped screens with navigation */
export function useNotificationHandler() {
  const router = useRouter();
  const notifListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    notifListener.current = Notifications.addNotificationReceivedListener((_notification) => {
      /* Foreground notification — handled by setNotificationHandler above */
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      if (!data) return;
      const screen = data.screen as string | undefined;
      const type = data.type as string | undefined;

      if (screen === "DriverMode" && type === "new_ride") {
        router.replace("/(tabs)");
      } else if (type === "ride_accepted") {
        router.replace("/(tabs)");
      }
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);
}
