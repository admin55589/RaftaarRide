const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
}

export async function sendPushNotification(payload: PushPayload): Promise<void> {
  if (!payload.to?.startsWith("ExponentPushToken[")) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: payload.to,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: payload.sound ?? "default",
        badge: payload.badge ?? 1,
        priority: payload.priority ?? "high",
      }),
    });
  } catch (err) {
    console.error("[expoPush] Failed to send notification:", err);
  }
}

export async function sendBulkPushNotifications(payloads: PushPayload[]): Promise<void> {
  const valid = payloads.filter((p) => p.to?.startsWith("ExponentPushToken["));
  if (valid.length === 0) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(valid),
    });
  } catch (err) {
    console.error("[expoPush] Bulk send failed:", err);
  }
}
