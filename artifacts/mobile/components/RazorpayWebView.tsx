import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
} from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RazorpayOrder } from "@/lib/paymentApi";

interface RazorpayWebViewProps {
  visible: boolean;
  order: RazorpayOrder;
  userInfo: { name: string; email?: string; phone?: string };
  onSuccess: (data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss: () => void;
}

function buildCheckoutHtml(order: RazorpayOrder, user: RazorpayWebViewProps["userInfo"], logoUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0f;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: -apple-system, sans-serif;
    }
    .loader { color: #f5a623; font-size: 16px; text-align: center; }
    .dot { animation: blink 1.4s infinite; display: inline-block; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="loader">
    ⚡ Razorpay khul raha hai
    <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
  </div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var options = {
      key: "${order.keyId}",
      amount: "${order.amount}",
      currency: "${order.currency}",
      order_id: "${order.orderId}",
      name: "RaftaarRide",
      description: "Ride Payment",
      image: "${logoUrl}",
      prefill: {
        name: "${user.name.replace(/"/g, '\\"')}",
        email: "${(user.email || "").replace(/"/g, '\\"')}",
        contact: "${(user.phone || "").replace(/"/g, '\\"')}"
      },
      theme: { color: "#f5a623" },
      modal: {
        ondismiss: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismissed" }));
        }
      },
      handler: function(response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "success",
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature
        }));
      }
    };
    var rzp = new Razorpay(options);
    rzp.on("payment.failed", function(resp) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "failed",
        error: resp.error.description
      }));
    });
    window.onload = function() { rzp.open(); };
  </script>
</body>
</html>
  `.trim();
}

const DARK_BG = "#0A0A0F";
const DARK_BORDER = "#2A2A38";
const DARK_CARD = "#16161E";
const DARK_MUTED = "#8A8A9A";
const ACCENT = "#F5A623";

export function RazorpayWebView({
  visible,
  order,
  userInfo,
  onSuccess,
  onDismiss,
}: RazorpayWebViewProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "success") {
        onSuccess({
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_order_id: data.razorpay_order_id,
          razorpay_signature: data.razorpay_signature,
        });
      } else {
        onDismiss();
      }
    } catch {}
  };

  const handleBack = () => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    } else {
      onDismiss();
    }
  };

  const domain = process.env.EXPO_PUBLIC_DOMAIN || "68e41a5f-c1bd-4337-9c0e-5f9c6dd535e1-00-3rxx9zjx78ze2.janeway.replit.dev";
  const logoUrl = `https://${domain}/api/assets/logo.png`;
  const html = buildCheckoutHtml(order, userInfo, logoUrl);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onDismiss}
    >
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top }]}>
        <View style={styles.header}>
          {/* Back button — fixed width 44 */}
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.sideBtn, { backgroundColor: canGoBack ? DARK_CARD : "transparent", borderColor: canGoBack ? DARK_BORDER : "transparent" }]}
            activeOpacity={0.7}
          >
            <Text style={{ color: canGoBack ? "#FFFFFF" : "transparent", fontSize: 20, lineHeight: 24 }}>←</Text>
          </TouchableOpacity>

          {/* Title — absolutely centered */}
          <View style={styles.titleWrap} pointerEvents="none">
            <View style={styles.titleInner}>
              <Text style={styles.titleBolt}>⚡</Text>
              <Text style={styles.titleText}>RaftaarRide Payment</Text>
            </View>
          </View>

          {/* Close button — same fixed width 44 */}
          <Pressable
            android_ripple={null}
            onPress={onDismiss}
            style={({ pressed }) => [styles.sideBtn, { backgroundColor: pressed ? "#1F1F2E" : DARK_CARD, borderColor: DARK_BORDER }]}
          >
            <Text style={{ color: DARK_MUTED, fontSize: 16, lineHeight: 20 }}>✕</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>
              Razorpay load ho raha hai...
            </Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ html }}
          onMessage={handleMessage}
          onLoad={() => setLoading(false)}
          onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={["*"]}
          style={styles.webview}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DARK_BORDER,
    backgroundColor: DARK_BG,
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  titleInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleBolt: {
    fontSize: 17,
    marginRight: 6,
    lineHeight: 22,
  },
  titleText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.2,
    color: "#FFFFFF",
  },
  webview: { flex: 1, backgroundColor: DARK_BG },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 10,
    backgroundColor: DARK_BG,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: DARK_MUTED,
  },
});
