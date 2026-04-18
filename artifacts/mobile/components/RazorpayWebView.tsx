import React from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  Platform,
} from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
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

function buildCheckoutHtml(order: RazorpayOrder, user: RazorpayWebViewProps["userInfo"]): string {
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
    .loader {
      color: #f5a623;
      font-size: 16px;
      text-align: center;
    }
    .dot { animation: blink 1.4s infinite; display: inline-block; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink {
      0%,80%,100% { opacity: 0; }
      40% { opacity: 1; }
    }
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
      image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAB4AHgDASIAAhEBAxEB/8QAHAABAAEFAQEAAAAAAAAAAAAAAAECAwUGBwQI/8QANxAAAQMDAwIEBQIFAwUAAAAAAQIDBAAFEQYSITFBEyJRYQcUMnGBFbEXQlKRoSMzwTRDguHw/8QAGwEAAgIDAQAAAAAAAAAAAAAAAAEFBgIDBAf/xAAwEQABAwIEBQEIAgMAAAAAAAABAAIRAwQSITFBBSJRYXGBBhMjMqGxwfBSkRTR4f/aAAwDAQACEQMRAD8A6jnFN1Qe9RXhYCuCnNAailOEKd1TmqaUkKoGlUippIU0zUZpmhNTmmaimaElOaZqBUd6EKoGlQKUimlKUppJUUpQhKUpTCEFTSgOKSFGamqakGiEKajNKU0JmlKUIUilBSsSgIaVFBz0phCmlWVyWG17HH2UL/pU4Af7Zq5WRaRqiVNRSqPFb8UteIjxcbtm4bseuOuKAOiFXSlBQhTQUpQhSDQ1TmpFKEJSlKEKRSoFKxKE6niuRXK93fW1+n2+0S126wQSUyJCDtUsDOVE9ccHj0HOa64a418R2GdE2G4Q7U4v5jUMgJ8IH6UD68emchP5qe4CGOqlgE1DAbIkDPM+QMwuS8kNmeUa/j6rxaL01Z9URrm78s4zGi8Imuukqd6kqPYYGD+a2D4GXGVIi3WI48t6DHWjwCo52k5yB7EYOPetK0lEvN7VK0cZzdtiQgVymmk4U95vMVKPUDI46cjiqYt8uFusVyuOn5q7ZY4DwYioQlJXMeJ+pZIO7I5x2FWm8t33LKttjnEW4Zkho2M55u7ZASo+k8Uy2pGkz3/4F2TWWrbfpuBJLspg3IM72IpV51k8JOPTP7GuN26+R7W23f2LgibqVwrK2lIUobl8EqPAOE/yg9T7V5dXTbjKulltt1UzKnlDLz7rnlWVuHytuEDhIBAAx3rIl5Tus5sm+ojoh6dZLzzMVBS2HOAlsE5JJUQMn07VjYcOpWVCDzFwJOfzDQNGWjie2qK1d1V86Rp27+Qty/iFLLUMRHGnz4KfHcdt0gku/wA2AnAA9Kytv1ZdpJ5ipPrttsgfuqudP3fUbqbTKTOEWXfHSmPBZaSUNsZxvAIPPufQ1evV/Ak+BMK/GBQob0ZX4awNhHYA+33PWsafA6Vc4WtaNe+8fxG8j0TdeFgkk/vquz2yVLkDLyUJHX/ZUj91GtE1zq++MXO4RbSG7fAt4QJE51veVFQGAgY98dP7VrzOor/dE2VmzXBTKmH1okuqdASEnARuB+ogZwOcnFYXVrd9QYekpkxydPkyVSypxZKgnBCEqPXspX5GK5LTgzaNz8fCdcjsAc3aRoMp6rbVui+nyT5/Czsy66stdgi6ia1A/JgvKTtRIaSArJIGU/jpxxW+2PXMa5XS1WxUSQiZMhplqUkAtt5TnGevbr7gVzXTMeXr2M47fZ7caz2U7XIDKPDShITnJ5yTgEZ68HpXnt+q7pGsztzikmbdpfyNoZWAUxmknkpHtlKR71uuuH07lrqTmt940kZcoGL5QYAmBzHLRYU6xYQ4E4T66a+J0XV/iTqNzTemlyIZT8++tLMYKTu8x5Jx3wAf8Vm9PfOfocI3NwuTS0C8vAGVHk8Dgen4rhErx2dXus3q5zLtC0+yZ0vxndw8bA8ifTKigY9jV6z6kv8AdrlBvD11nNpbeMiXt3NwosZP/bweFqI+/bua4X8Cm2axjh/IujWRytG+mfkjdbm3nxCSD0j7lfQIpVDLiXmkOt52LSFJyMHBGRkHpSqgRGRUmFWa5rrPS068/E/Ts9SQu1RW/OCfpUCpXTvk7f7V0o0HSuqzu32jy+nqQR/YhaqlMVBDlwz4qxJmkdbRtV21kuRXk+HJbGQFZG1QV6BSe/YgVg9L6Z09qW3ORLbqCepxomUI7iFARUgeYnjZnGBnOTjivoebEYmMKZktpcbPUKFY+Bp62W+NIZhRW2UvJKV7QBkEYPSp6h7QYLZtMyHtgSIzA0mQdJK5HWU1C7Y7L530lDVOXEfUpx+VeLu2hlbityyyyrxHHCT152jPtXRLx8MI6XNQz591kNwZSlyVo34SlWSoKV/UQScZ9a2LQ3w5tulZrktlS3nsFLZcVu8NJOcJ9P8AmshdZluOqWWNVhEayNsOFl5wlSVyPLjIHQhO4Jz3z7VInib76+FK0fDdzlPgA75Af2VoFAUaJdVElciiaesK129xzUVwSpgLZLijydg5bQUkkAAkeXjk81g9RzWXrjI+QdTILDISH15IQkZ2tFQ47/bJI5xzdkuWydc73d22W4wYWhtltttCUOlSsJIGP6QsnGOMVmEWuO3EkfpVzgfpS05fVIZwUK48u0cq46HBz6mrhTt/cOx4ifO2cnQKKNTGMMAfvdYi07ksT3GksuMRooQ6kBZ3uqUTtz0JGTnk44963b4awmp19RqWQ89LkpjBlSDglGPKF88ngBPH371zubGu11ksRrdJduDKUlaApPgoYGepQDtSOeuTk8deKzmjbjM0VeoyZZafiqJCmI7md25JCvqHsD1xxWnils+4tntpfNB9RuPVZW1QU6gLtF6taRJWhtTXWS0067YL4ytqQlvgpC+uD2UDkjPHJFWbXp/R9xtUL5fWIZlsL3BUh3wVtDOdqUqGE88+XvzmuzxLnaNTs/KOISpS0bvCUUq4wCQCCRkZGR19qwEv4SaZfWVJipRznCcj9jVRbxf3LRRu8VOoIzAGcZCQe2+6lP8AGxnFShzT12WhydM6ShyJryr49NhOoytqO+lYUQM7lHcCrByrnvzV7RltsvzcSPPu90kW5lxBYYklPgtrVgpCkJJIIKhyRtBNbZI+FUfBTEmvstngoSs4Ke4Oc8HpVWmvhPbrXev1SW85KlBwugrPAVnOcAAda2VOLWpoOBruJjpn9sj3TZbPDxyBdLSkIG0DAHFKkUqilSig0HFCajtQhKileG8zHIMBbzKAt3ICUnpk/wD3+a2U2Go4MbqUiYElUXy6ItcNS0o8eUpKvAjJVhTygM4z2Hqo8CuMa+1/GvtoTBccXHWleXvCY8RCSMgjxAs5++OuOKq1DdpGor0bY1IWlEl5TK3c4UllokEfZSsk/c+1Y3UNptEG+MxkLbdSY+9yOkEBpgAKLilA/WUgkJAwAoAnJwPRuDcGt7PC6q3FVjFPTp+9ioK7un1ZwmG6eVrF/jltYUw2WLY26lwoKySgrTlIPuE9/wAVFvjuvsyi1KcLrPlaabjle9QPmTuJASduSOvb7153JTkm4SHpQV4cwLkFBPlHGRx3Tgjj0rONOu3iPp5MJ5EOOy6/FcbdcKUBxSyvcojuUHG49m6tjQWjCowwc1jZkyTY33G477qoK38KacwlwoABTu28BWCTweDVyXCtsKAqdHuEt+RnIS4gY2K6YV1zyAeOoNbbqD4fWiIw5JfvJ+YVHdfKgtAQ5wNqEp5KTznknI447aXGiPoRbWm4zipZcATELSnVLyMgbfq65wAMcmnIOYS7LY9I3G3W/VUV5c6XHZQoBqUnhLoUON4KTgEHacHpnFfQlvkrfC0vtpbdSeUp3ED8kYP4rgb9ls9u3O6skeLOWVFq129aQRu6JecGUowSTsRuVnH012f4fSlz9JW+U4goLiTsSSVFKAohKSTySAAMnk4qi+11q0U2XO/y/nL6/SN1M8MqGTT9VsOKg8VV0FU1QlMomlB3pQUIaipNRTCEFWZsdMmOptf0kg/2IP8AxV4CpptcWmRsjXJfNukpCbd8TXIl18iUOvRlKV0AUo7VH25HNeu6aWkRr8S/LfQ255ZaAypRwDgJQcYIUnkc9Tg47534v6djvXYXG1CUm6pAC0tRVrQv7qxj/NaxAkatDKEtWWQXEDCFOPK2o9wknj8GvVrO7bcNbdNeGy0BwdlpOYzHU/Toq5VpGmTTLZgyCF6NJaN/UdTqt7yCgNRnVuIznwSrypSfcdP/ABNW5Gh7zZ1y4z0N2RDdUlXixlALStJ8q0pVx6gjPINZjTkfV1ujuJhWJnx3l+I8/IlKytXbIRjgdhnitiSn4mTEBPzdshJ9G4u8j8rzXHc8VrU7gvpVWYMhDj035ZOa207ZjqYDmmew/wBrTIujZ89KG3ItzkJQjYnx1NNhI9gAoj/0KxV6F00jf2WZLTkZD6QHpPiqK5CD1QXMAgeoGB0rpadJa2l/9frCegHqmPtaH+Kq/hPHlkKvN1uM9XX/AF5K11rZ7SMY+biq0t6NDvuYTNgSORpB7kLQPBspWlVtZV8w75WWHHUqUFc+dSv6Rn7AZ74Fdz0YlDGnYcZrzNsNhtKwoHfjvwTgn0rCWv4Z6bgKCkQGlrHdaAr981t8WO1EYSzHbShtPRKRgCq9xzjNG/pto0ZhvXX7ld1nauouLnxJ6K9SlRVZUgpHelE9aViUKoioxSlCFGKYpShCpUw0s5U2gn1KaJaQn6UpH2FKU5KIVWPSmPvSlKUKcVGKUoTUgcUxSlAQm2mKUolJSkYpSlJNf//Z",
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

export function RazorpayWebView({
  visible,
  order,
  userInfo,
  onSuccess,
  onDismiss,
}: RazorpayWebViewProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);

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

  const html = buildCheckoutHtml(order, userInfo);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onDismiss}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top }]}>
        <View style={[styles.header, { borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>⚡ RaftaarRide Payment</Text>
          <Pressable onPress={onDismiss} style={[styles.closeBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Razorpay load ho raha hai...
            </Text>
          </View>
        )}

        <WebView
          source={{ html }}
          onMessage={handleMessage}
          onLoad={() => setLoading(false)}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 10,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
