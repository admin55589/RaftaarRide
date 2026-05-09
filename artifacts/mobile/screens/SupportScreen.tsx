import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { BASE_URL } from "@/lib/api";

interface SupportMessage {
  id: number;
  chatId: number;
  senderRole: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface SupportChat {
  id: number;
  status: string;
  subject: string;
  createdAt: string;
}

const FAQ_ITEMS = [
  {
    id: "overcharge",
    question: "🚨 Driver ne zyada charge kiya / Overcharge hua",
    answer:
      "Hamara fare algorithm distance + vehicle type + surge (demand high hone par) se calculate hota hai. Surge pricing hoti hai toh booking screen pe clearly ⚡ icon ke saath dikhti hai.\n\nAgar phir bhi lage ki galat charge hua, neeche Dispute File karo — 24 ghante mein review hogi.",
    action: { label: "📝 Dispute File Karo", target: "dispute" },
  },
  {
    id: "payment_charged",
    question: "💳 Payment cut gaya par ride nahi hui",
    answer:
      "Agar ride cancel hua ya driver nahi mila toh payment automatically reverse ho jaati hai (2–3 din mein bank statement mein).\n\nWallet se payment hua hoga toh turant Wallet check karo — balance wahan dikhega.",
    action: null,
  },
  {
    id: "driver_cancelled",
    question: "🚗 Driver ne last moment mein cancel kar diya",
    answer:
      "Ye frustrating hota hai — hum samajhte hain.\n\n• Driver ko ₹10 penalty lagti hai\n• Aapki booking pe zero charge\n• Dobara book karo — 2–3 min mein next driver milta hai\n\nPeak hours (7–10am, 5–9pm) mein thoda zyada time lag sakta hai.",
    action: null,
  },
  {
    id: "wrong_location",
    question: "📍 Driver wrong location pe aaya",
    answer:
      "GPS accuracy ki wajah se hota hai — khaas karke buildings ke andar.\n\n1. Booking ke waqt pin carefully drag karke exact spot pe set karo\n2. Driver accept hone ke baad in-app call karke exact location batao\n3. Nearby landmark use karo (jaise 'SBI ATM ke saamne')",
    action: null,
  },
  {
    id: "lost_item",
    question: "🎒 Ride mein koi cheez chhoot gayi",
    answer:
      "Jaldi karo!\n\n1. Ride History mein us ride ka driver number dekho\n2. Driver ko directly call karo\n3. Agar driver respond na kare — 1 ghante ke andar hume chat mein batao, hum driver se contact karenge.",
    action: { label: "📜 Ride History", target: "history" },
  },
  {
    id: "safety",
    question: "🚨 Safety issue / Emergency",
    answer:
      "Turant emergency mein 112 call karo (Police/Ambulance).\n\nUnsafe driver behavior (route change, abusive behavior) ke liye ride ke baad Safety Dispute file karo — hum seriously investigate karte hain aur driver suspend kar sakte hain.",
    action: { label: "📝 Safety Dispute", target: "dispute" },
  },
  {
    id: "otp_issue",
    question: "🔑 OTP nahi aaya / Login problem",
    answer:
      "OTP ke liye:\n• 30 second wait karo\n• Network check karo (2G mein delay)\n• Dobara OTP request karo\n• DND/spam filter check karo\n\nAbhi bhi problem hai? Neeche support chat open karo.",
    action: null,
  },
  {
    id: "app_issue",
    question: "📱 App crash / Payment fail",
    answer:
      "1. App force-close karke reopen karo\n2. Internet connection check karo (Wi-Fi vs Mobile Data try karo)\n3. Play Store / App Store se update check karo\n\nPayment fail hone par amount 5–7 business days mein automatically refund ho jaata hai.",
    action: null,
  },
];

type ViewMode = "faq" | "chat";

export function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setScreen } = useApp();
  const { token } = useAuth();
  const { driverToken } = useDriverAuth();
  const authToken = token ?? driverToken;

  const [view, setView] = useState<ViewMode>("faq");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const fetchChat = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch(`${BASE_URL}support/chat`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.success && data.chat) {
        setChat(data.chat);
        setMessages(data.messages ?? []);
      }
    } catch {}
  }, [authToken]);

  useEffect(() => {
    if (view === "chat") {
      fetchChat();
      pollRef.current = setInterval(fetchChat, 10000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view, fetchChat]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages.length]);

  const openChat = async (subject: string) => {
    if (!authToken) return;
    setStartingChat(true);
    try {
      const res = await fetch(`${BASE_URL}support/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ subject }),
      });
      const data = await res.json();
      if (data.success) {
        setChat(data.chat);
        setMessages(data.messages ?? []);
        setView("chat");
      }
    } catch {}
    finally { setStartingChat(false); }
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !chat || sending) return;
    const text = msgInput.trim();
    setMsgInput("");
    setSending(true);
    try {
      const res = await fetch(`${BASE_URL}support/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ chatId: chat.id, message: text }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message]);
      }
    } catch {}
    finally { setSending(false); }
  };

  const fmt = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  /* ── CHAT VIEW ── */
  if (view === "chat") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background, paddingTop: topPad }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
          <TouchableOpacity onPress={() => setView("faq")} style={{ marginRight: 12, padding: 4 }}>
            <Text style={{ fontSize: 22, color: colors.text }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>💬 Support Chat</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: chat?.status === "open" ? "#4ADE80" : "#6B7280" }} />
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "Inter_400Regular" }}>
                {chat?.status === "open" ? "10 min mein reply · 10am–10pm" : "✅ Resolved"}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setScreen("home")} style={{ padding: 4 }}>
            <Text style={{ fontSize: 22, color: colors.textSecondary }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {chat && (
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ backgroundColor: "rgba(245,166,35,0.1)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(245,166,35,0.25)" }}>
                <Text style={{ fontSize: 11, color: "#F5A623", fontFamily: "Inter_500Medium" }}>
                  🎫 Ticket #{chat.id} · {fmtDate(chat.createdAt)}
                </Text>
              </View>
            </View>
          )}

          {messages.map((msg, i) => {
            const isAdmin = msg.senderRole === "admin";
            return (
              <Animated.View key={msg.id} entering={FadeInUp.delay(i * 15).duration(200)} style={{ alignItems: isAdmin ? "flex-start" : "flex-end", marginBottom: 10 }}>
                <View style={{
                  maxWidth: "82%",
                  backgroundColor: isAdmin ? "rgba(245,166,35,0.1)" : "rgba(74,222,128,0.1)",
                  borderRadius: 16,
                  borderBottomLeftRadius: isAdmin ? 4 : 16,
                  borderBottomRightRadius: isAdmin ? 16 : 4,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: isAdmin ? "rgba(245,166,35,0.2)" : "rgba(74,222,128,0.2)",
                }}>
                  {isAdmin && (
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#F5A623", marginBottom: 4, letterSpacing: 0.5 }}>SUPPORT</Text>
                  )}
                  <Text style={{ fontSize: 13.5, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
                    {msg.message}
                  </Text>
                  <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 5, fontFamily: "Inter_400Regular" }}>{fmt(msg.createdAt)}</Text>
                </View>
              </Animated.View>
            );
          })}

          {chat?.status === "resolved" && (
            <View style={{ alignItems: "center", marginTop: 16 }}>
              <Text style={{ fontSize: 12, color: "#4ADE80", fontFamily: "Inter_500Medium", textAlign: "center" }}>
                ✅ Chat closed{"\n"}Naya issue? Ek aur chat shuru karo
              </Text>
              <TouchableOpacity
                onPress={() => { setChat(null); setMessages([]); setView("faq"); }}
                style={{ marginTop: 12, backgroundColor: "rgba(245,166,35,0.12)", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(245,166,35,0.3)" }}
              >
                <Text style={{ color: "#F5A623", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>New Chat</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>

        {chat?.status !== "resolved" && (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 16, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" }}>
            <TextInput
              style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
              placeholder="Apni problem likhein..."
              placeholderTextColor={colors.textSecondary}
              value={msgInput}
              onChangeText={setMsgInput}
              multiline
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!msgInput.trim() || sending}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: msgInput.trim() && !sending ? "#F5A623" : "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 18 }}>➤</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  }

  /* ── FAQ VIEW ── */
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: topPad }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20 }}>
          <TouchableOpacity onPress={() => setScreen("profile")} style={{ marginRight: 12, padding: 4 }}>
            <Text style={{ fontSize: 22, color: colors.text }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text }}>🆘 Help & Support</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3, fontFamily: "Inter_400Regular" }}>
              90% problems yahan khud solve ho jaati hain
            </Text>
          </View>
          <TouchableOpacity onPress={() => setScreen("home")} style={{ padding: 4 }}>
            <Text style={{ fontSize: 22, color: colors.textSecondary }}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 20 }}>
          {[
            { icon: "📝", label: "File\nDispute", onPress: () => setScreen("dispute_report"), loading: false },
            { icon: "💬", label: "Live\nChat", onPress: () => openChat("Mujhe help chahiye"), loading: startingChat },
          ].map((a, i) => (
            <TouchableOpacity
              key={i}
              onPress={a.onPress}
              disabled={a.loading}
              style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, paddingVertical: 18, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}
            >
              <Text style={{ fontSize: 26, marginBottom: 6 }}>{a.icon}</Text>
              <Text style={{ fontSize: 12, color: colors.text, textAlign: "center", fontFamily: "Inter_600SemiBold", lineHeight: 17 }}>{a.label}</Text>
              {a.loading && <ActivityIndicator size="small" color="#F5A623" style={{ marginTop: 6 }} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Prevention tip */}
        <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: "rgba(74,222,128,0.07)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(74,222,128,0.18)", flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <Text style={{ fontSize: 20 }}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#4ADE80", marginBottom: 3 }}>Pehle FAQ padho</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 18 }}>
              Overcharge, cancel, payment — in sab ka jawab neeche hai. Chat support ki zaroorat hi nahi padegi.
            </Text>
          </View>
        </View>

        {/* FAQ accordion */}
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 12 }}>🔍 Common Problems</Text>
          {FAQ_ITEMS.map((item, i) => {
            const expanded = expandedId === item.id;
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 25).duration(200)}>
                <TouchableOpacity
                  onPress={() => setExpandedId(expanded ? null : item.id)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 14,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: expanded ? "rgba(245,166,35,0.35)" : "rgba(255,255,255,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}>
                    <Text style={{ flex: 1, fontSize: 13.5, fontFamily: "Inter_600SemiBold", color: expanded ? "#F5A623" : colors.text, lineHeight: 20 }}>
                      {item.question}
                    </Text>
                    <Text style={{ fontSize: 14, color: expanded ? "#F5A623" : colors.textSecondary }}>{expanded ? "▲" : "▼"}</Text>
                  </View>
                  {expanded && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 10 }}>
                        {item.answer}
                      </Text>
                      {item.action && (
                        <TouchableOpacity
                          onPress={() => {
                            if (item.action!.target === "dispute") setScreen("dispute_report");
                            else if (item.action!.target === "history") setScreen("home");
                          }}
                          style={{ marginTop: 12, backgroundColor: "rgba(245,166,35,0.12)", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignSelf: "flex-start", borderWidth: 1, borderColor: "rgba(245,166,35,0.3)" }}
                        >
                          <Text style={{ fontSize: 13, color: "#F5A623", fontFamily: "Inter_600SemiBold" }}>{item.action!.label}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        {/* Last-resort chat CTA */}
        <View style={{ marginHorizontal: 20, marginBottom: 32, borderRadius: 20, borderWidth: 1, borderColor: "rgba(245,166,35,0.25)", overflow: "hidden" }}>
          <View style={{ backgroundColor: "rgba(245,166,35,0.07)", padding: 20 }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 6 }}>💬 Phir bhi problem hai?</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 19, marginBottom: 16 }}>
              FAQ se solve nahi hua? Humse directly chat karo — team 10 minute mein reply karti hai.
            </Text>
            <TouchableOpacity
              onPress={() => openChat("Mujhe help chahiye")}
              disabled={startingChat}
              style={{ backgroundColor: "#F5A623", borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              {startingChat
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={{ fontSize: 18 }}>💬</Text>}
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" }}>
                {startingChat ? "Chat shuru ho raha hai..." : "Support se Chat Karo"}
              </Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: "center", marginTop: 10, fontFamily: "Inter_400Regular" }}>
              Typically replies in 10 min · Mon–Sat 10am–10pm
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
