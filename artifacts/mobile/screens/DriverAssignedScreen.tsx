import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Alert,
  Platform,
  Linking,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  FlatList,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MapView } from "@/components/MapView";
import { useVoiceAI } from "@/hooks/useVoiceAI";
import { connectSocket, joinRideRoom, getSocket, sendChatMessage } from "@/lib/socket";

interface ChatMsg {
  id: string;
  role: "user" | "driver";
  senderName: string;
  text: string;
  timestamp: number;
}

function getSmartDriverReply(userMsg: string, driverName: string, eta: number): string {
  const msg = userMsg.toLowerCase().trim();

  // Location / kahan ho
  if (/kahan|where|location|ho tum|kaha hai|abhi kahan|current location|kha ho/.test(msg)) {
    const opts = [
      `Main abhi ${eta + 1} km door hoon, ${eta} minute mein pahunch jaata hoon! 📍`,
      `Signal pe hoon, ${eta - 1} minute mein aa jaunga.`,
      `Aapki gali ke paas hi hoon, bas ek turn baaki hai. 🚗`,
      `Google Maps pe dekh raha hoon aapki location — pahunch raha hoon!`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // ETA / time / kitni der
  if (/kitni der|kab|time|minute|minut|der ho|late|jaldi|kb|aao ge|aoge|pahunchoge/.test(msg)) {
    const opts = [
      `Bas ${eta} minute mein pahunch jaata hoon sir! 🕐`,
      `${eta - 1} se ${eta} minute mein aa jaunga, bilkul pakka.`,
      `Thoda traffic tha, par ab ${eta} minute mein aa jaunga.`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // Vehicle / car / gaadi / kaunsi
  if (/gaadi|car|kaunsi|vehicle|number|bike|auto|colour|color|kaisi|rang|dikhna|recognize|pehchaan/.test(msg)) {
    const opts = [
      `Meri gaadi ka number app mein dekh lo. Main blue gate ke paas khadaa hounga. 🚘`,
      `${driverName} naam se app mein vehicle number show ho raha hai. Aap ready ho jaiye!`,
      `Main ${driverName} hoon — vehicle number app mein dikh raha hai aapko. 👋`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // Call / phone
  if (/call|phone|contact|number|baat|ring/.test(msg)) {
    return `App mein mera number dikh raha hai, call kar sakte ho. Main receive karunga! 📞`;
  }

  // Traffic / jam
  if (/traffic|jam|jaam|road|congestion/.test(msg)) {
    const opts = [
      `Haan thoda traffic hai, par ${eta + 2} minute mein pahunch jaata hoon.`,
      `Traffic se nikal raha hoon, ${eta} minute mein aa jaaunga. Sorry for delay! 🙏`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // Cancel / cancel karna
  if (/cancel|rok|mat aao|nahi chahiye/.test(msg)) {
    return `Sir please wait karein, main bilkul paas hoon. Cancel mat karein! 🙏`;
  }

  // OK / acknowledgement
  if (/^ok$|^okay$|^theek$|^acha$|^accha$|^fine$|^sure$|^haan$|^han$|^ji$/.test(msg)) {
    const opts = [
      `Ok sir! Main pahunch raha hoon. 👍`,
      `Ji bilkul! 🙏`,
      `Theek hai, milte hain! 😊`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // Greeting
  if (/hello|hi|hii|namaste|namaskar|hey|bhai|sir/.test(msg)) {
    const opts = [
      `Namaste sir! Main ${driverName} — aapki ride le raha hoon. ${eta} minute mein pahunch jaata hoon! 🙏`,
      `Hello! Haan bata dijiye, main sun raha hoon. 😊`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // Thanks
  if (/thanks|shukriya|dhanyawaad|thank you|ty/.test(msg)) {
    return `Aapka swagat hai! Safe ride guaranteed. 😊⚡`;
  }

  // Default — generic context-aware
  const defaults = [
    `Samajh gaya sir. Main ${eta} minute mein pahunch raha hoon! 🚗`,
    `Ji zaroor. Koi baat nahi, main aa raha hoon.`,
    `Ok sir, noted. Pahunch raha hoon! 👍`,
    `Haan, main sun raha hoon. ${eta} minute mein milte hain.`,
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

function StarRating({ rating }: { rating: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={{ fontSize: 13, color: colors.primary }}>
          {i < Math.floor(rating) ? "⭐" : "☆"}
        </Text>
      ))}
    </View>
  );
}

function AvatarCircle({ initials }: { initials: string }) {
  const colors = useColors();
  const scale = useSharedValue(0.8);
  useEffect(() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: "rgba(245,166,35,0.2)", borderWidth: 2,
      borderColor: colors.primary, alignItems: "center", justifyContent: "center"
    }, style]}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.primary }}>{initials}</Text>
    </Animated.View>
  );
}

function ETABar({ eta }: { eta: number }) {
  const colors = useColors();
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withRepeat(withSequence(withTiming(1, { duration: eta * 1000 }), withTiming(0, { duration: 0 })), -1, false);
  }, [eta]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` as any }));
  return (
    <View style={[s.etaBarBg, { backgroundColor: colors.secondary }]}>
      <Animated.View style={[s.etaBarFill, { backgroundColor: colors.primary }, barStyle]} />
    </View>
  );
}

// ─── SOS Modal ───────────────────────────────────────────────────────────────
function SOSModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDark } = useTheme();
  const colors = useColors();
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      pulseScale.value = withRepeat(
        withSequence(withTiming(1.12, { duration: 600, easing: Easing.out(Easing.sin) }), withTiming(1, { duration: 600 })),
        -1, false
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [visible]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  const dial = async (number: string, label: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    onClose();
    if (Platform.OS === "web") {
      Alert.alert(`📞 ${label}`, `Calling ${number}...\n\n(On physical device, this dials immediately)`);
      return;
    }
    const url = `tel:${number}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Call Failed", `Please dial ${number} manually`);
    }
  };

  const EMERGENCY_OPTIONS = [
    { number: "112", label: "Emergency (All)", icon: "🆘", color: "#EF4444", sub: "Police + Ambulance + Fire" },
    { number: "100", label: "Police",           icon: "👮", color: "#3B82F6", sub: "Nearest police station" },
    { number: "102", label: "Ambulance",        icon: "🚑", color: "#10B981", sub: "Medical emergency" },
    { number: "1091", label: "Women Helpline",  icon: "🛡️", color: "#8B5CF6", sub: "Women safety helpline" },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <BlurView intensity={isDark ? 70 : 50} tint="dark" style={StyleSheet.absoluteFill}>
        <Pressable style={s.modalBackdrop} onPress={onClose}>
          <Animated.View entering={FadeInUp.springify().damping(13)} style={[s.sosCard, { backgroundColor: colors.card }]}>
            <Pressable>
              <Animated.View style={[s.sosPulseWrap, pulseStyle]}>
                <View style={s.sosPulseOuter}>
                  <View style={s.sosPulseInner}>
                    <Text style={{ fontSize: 36 }}>🆘</Text>
                  </View>
                </View>
              </Animated.View>

              <Text style={[s.sosModalTitle, { color: colors.foreground }]}>Emergency SOS</Text>
              <Text style={[s.sosModalSub, { color: colors.mutedForeground }]}>Apni safety ke liye turant help maangein</Text>

              <View style={s.sosOptions}>
                {EMERGENCY_OPTIONS.map((opt, i) => (
                  <Animated.View key={opt.number} entering={FadeInDown.delay(60 + i * 50)}>
                    <TouchableOpacity
                      style={[s.sosOption, { borderColor: opt.color + "44", backgroundColor: opt.color + "12" }]}
                      onPress={() => dial(opt.number, opt.label)}
                      activeOpacity={0.75}
                    >
                      <Text style={{ fontSize: 26 }}>{opt.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.sosOptLabel, { color: opt.color }]}>{opt.label}</Text>
                        <Text style={[s.sosOptSub, { color: colors.mutedForeground }]}>{opt.sub}</Text>
                      </View>
                      <View style={[s.sosDialBtn, { backgroundColor: opt.color }]}>
                        <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }}>{opt.number}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </View>

              <TouchableOpacity style={[s.sosDismiss, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={[s.sosDismissText, { color: colors.foreground }]}>✕  Main safe hoon</Text>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

// ─── Chat Modal ───────────────────────────────────────────────────────────────
function ChatModal({
  visible,
  onClose,
  driverName,
  rideId,
  userName,
  eta,
}: {
  visible: boolean;
  onClose: () => void;
  driverName: string;
  rideId: number | null;
  userName: string;
  eta: number;
}) {
  const colors = useColors();
  const { isDark } = useTheme();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "sys",
      role: "driver",
      senderName: driverName,
      text: `Namaste! Main ${driverName} hoon. Aapki koi baat?`,
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isDriverTyping, setIsDriverTyping] = useState(false);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible || !rideId) return;
    const socket = connectSocket();
    joinRideRoom(rideId);

    const handler = (data: ChatMsg) => {
      if (data.role === "driver") {
        setIsDriverTyping(false);
        setMessages((prev) => [...prev, { ...data, id: `${data.timestamp}-${Math.random()}` }]);
      }
    };
    socket.on("chat:message", handler);
    return () => { socket.off("chat:message", handler); };
  }, [visible, rideId]);

  const sendMsg = () => {
    const text = inputText.trim();
    if (!text) return;

    const msg: ChatMsg = {
      id: `${Date.now()}-user`,
      role: "user",
      senderName: userName,
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    setInputText("");

    if (rideId) {
      sendChatMessage(rideId, "user-1", userName, "user", text);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setIsDriverTyping(true);
    const delay = 1200 + Math.random() * 1000;
    setTimeout(() => {
      const reply = getSmartDriverReply(text, driverName, eta);
      const driverMsg: ChatMsg = {
        id: `${Date.now()}-driver`,
        role: "driver",
        senderName: driverName,
        text: reply,
        timestamp: Date.now(),
      };
      setIsDriverTyping(false);
      setMessages((prev) => [...prev, driverMsg]);
    }, delay);
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <BlurView intensity={isDark ? 60 : 40} tint="dark" style={{ flex: 1 }}>
          <Animated.View entering={FadeInUp.duration(350)} style={[s.chatContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header */}
            <View style={[s.chatHeader, { borderBottomColor: colors.border }]}>
              <View style={s.chatHeaderLeft}>
                <View style={s.chatAvatar}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.primary }}>
                    {driverName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[s.chatHeaderName, { color: colors.foreground }]}>{driverName}</Text>
                  <Text style={[s.chatHeaderSub, { color: "#4ADE80" }]}>
                    {isDriverTyping ? "Typing..." : "● Online"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={[s.chatCloseBtn, { backgroundColor: colors.secondary }]}>
                <Text style={{ color: colors.foreground, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              ref={flatRef}
              data={messages}
              keyExtractor={(m) => m.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => {
                const isUser = item.role === "user";
                return (
                  <Animated.View
                    entering={FadeInDown.duration(250)}
                    style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowDriver]}
                  >
                    {!isUser && (
                      <View style={s.msgAvatar}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                          {item.senderName.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ maxWidth: "72%", gap: 3 }}>
                      <View style={[
                        s.msgBubble,
                        isUser
                          ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
                          : { backgroundColor: colors.secondary, borderBottomLeftRadius: 4 },
                      ]}>
                        <Text style={[s.msgText, { color: isUser ? "#000" : colors.foreground }]}>{item.text}</Text>
                      </View>
                      <Text style={[s.msgTime, { color: colors.mutedForeground }, isUser ? { textAlign: "right" } : {}]}>{formatTime(item.timestamp)}</Text>
                    </View>
                  </Animated.View>
                );
              }}
              ListFooterComponent={
                isDriverTyping ? (
                  <View style={[s.msgRow, s.msgRowDriver, { marginTop: 6 }]}>
                    <View style={s.msgAvatar}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                        {driverName.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={[s.msgBubble, { backgroundColor: colors.secondary, paddingVertical: 10 }]}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 18 }}>● ● ●</Text>
                    </View>
                  </View>
                ) : null
              }
            />

            {/* Input */}
            <View style={[s.chatInputRow, { borderTopColor: colors.border }]}>
              <TextInput
                style={[s.chatInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
                placeholder="Message type karein..."
                placeholderTextColor={colors.mutedForeground}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={sendMsg}
                returnKeyType="send"
                multiline={false}
              />
              <TouchableOpacity
                style={[s.chatSendBtn, { backgroundColor: inputText.trim() ? colors.primary : colors.secondary }]}
                onPress={sendMsg}
                disabled={!inputText.trim()}
              >
                <Text style={{ fontSize: 18 }}>➤</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export function DriverAssignedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assignedDriver, setScreen, selectedVehicle, pickup, destination, currentRideId } = useApp();
  const { user } = useAuth();
  const { announceDriverFound } = useVoiceAI();

  const [showSOS, setShowSOS] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const driver = assignedDriver ?? {
    name: "Raj Kumar",
    rating: 4.8,
    vehicle: "Swift Dzire",
    vehicleNumber: "DL 4C AB 1234",
    vehicleType: selectedVehicle,
    eta: 5,
    photo: "RK",
  };

  const vehicleColor =
    driver.vehicleType === "bike" ? colors.bikeColor
    : driver.vehicleType === "auto" ? colors.autoColor
    : colors.cabColor;

  useEffect(() => { announceDriverFound(driver.name, driver.eta); }, []);

  const handleCall = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("📞 Calling Driver", `${driver.name} ko call kar rahe hain...\n\n(Real number integration ke liye backend update needed)`);
  };

  const handleShareLocation = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const vehicleEmoji = driver.vehicleType === "bike" ? "🏍️" : driver.vehicleType === "auto" ? "🛺" : "🚗";
    const message = [
      `${vehicleEmoji} Main RaftaarRide mein hoon!`,
      ``,
      `👤 Driver: ${driver.name} (⭐ ${driver.rating})`,
      `🚘 Vehicle: ${driver.vehicle}`,
      `🔢 Number: ${driver.vehicleNumber}`,
      `⏱️ ETA: ${driver.eta} min`,
      ``,
      `📍 Pickup: ${pickup || "Current location"}`,
      `🏁 Destination: ${destination || "Unknown"}`,
      ``,
      `RaftaarRide se book kiya gaya — safe & fast! ⚡`,
    ].join("\n");
    try { await Share.share({ message, title: "Meri Ride Track Karo 🚗" }); } catch { }
  };

  const handleCancel = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Cancel Ride", "Are you sure?", [
      { text: "No" },
      { text: "Yes", style: "destructive", onPress: () => setScreen("home") },
    ]);
  };

  const userName = user?.name ?? user?.email?.split("@")[0] ?? "User";

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <MapView />

      <Animated.View entering={FadeInUp.springify()} style={s.sheet}>
        <GlassCard style={s.card} padding={0}>
          <View style={[s.handle, { backgroundColor: colors.border }]} />
          <View style={s.content}>

            <Animated.View entering={FadeInDown.springify()} style={s.etaRow}>
              <View style={[s.etaBadge, { backgroundColor: "rgba(245,166,35,0.13)", borderColor: vehicleColor }]}>
                <Text style={{ fontSize: 15 }}>🕐</Text>
                <Text style={[s.etaText, { color: vehicleColor }]}>{driver.eta} min away</Text>
              </View>
              <ETABar eta={driver.eta * 60} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(100).springify()} style={s.driverRow}>
              <AvatarCircle initials={driver.photo} />
              <View style={s.driverInfo}>
                <Text style={[s.driverName, { color: colors.foreground }]}>{driver.name}</Text>
                <StarRating rating={driver.rating} />
                <Text style={[s.driverVehicle, { color: colors.mutedForeground }]}>{driver.vehicle}</Text>
                <Text style={[s.driverPlate, { color: vehicleColor }]}>{driver.vehicleNumber}</Text>
              </View>
              <View style={s.actionBtns}>
                <Pressable
                  onPress={handleCall}
                  style={[s.actionBtn, { backgroundColor: colors.success + "22", borderColor: colors.success }]}
                >
                  <Text style={s.actionBtnEmoji}>📞</Text>
                </Pressable>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowChat(true); }}
                  style={[s.actionBtn, { backgroundColor: vehicleColor + "22", borderColor: vehicleColor }]}
                >
                  <Text style={s.actionBtnEmoji}>💬</Text>
                </Pressable>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).springify()} style={s.bottomActions}>
              <Pressable onPress={handleCancel} style={[s.cancelBtn, { borderColor: colors.destructive }]}>
                <Text style={[s.cancelText, { color: colors.destructive }]}>Cancel Ride</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Track Live" onPress={() => setScreen("live_tracking")} size="md" />
              </View>
            </Animated.View>

            <View style={[s.sosRow, { paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 0) + 4 }]}>
              <Pressable
                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); setShowSOS(true); }}
                style={[s.sosBtn, { backgroundColor: "rgba(239,68,68,0.13)", borderColor: colors.destructive }]}
              >
                <Text style={{ fontSize: 14 }}>⚠️</Text>
                <Text style={[s.sosText, { color: colors.destructive }]}>SOS</Text>
              </Pressable>
              <Pressable
                onPress={handleShareLocation}
                style={({ pressed }) => [
                  s.shareBtn,
                  { backgroundColor: pressed ? "rgba(245,166,35,0.13)" : colors.secondary, borderColor: pressed ? colors.primary : colors.border },
                ]}
              >
                <Text style={{ fontSize: 14 }}>📤</Text>
                <Text style={[s.shareText, { color: colors.primary }]}>Share Location</Text>
              </Pressable>
            </View>

          </View>
        </GlassCard>
      </Animated.View>

      <SOSModal visible={showSOS} onClose={() => setShowSOS(false)} />
      <ChatModal
        visible={showChat}
        onClose={() => setShowChat(false)}
        driverName={driver.name}
        rideId={currentRideId}
        userName={userName}
        eta={driver.eta}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0 },
  card: { borderRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12 },
  content: { padding: 20, gap: 16 },
  etaRow: { gap: 8 },
  etaBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12, alignSelf: "flex-start" },
  etaText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  etaBarBg: { height: 4, borderRadius: 2, overflow: "hidden" },
  etaBarFill: { height: "100%", borderRadius: 2 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  driverInfo: { flex: 1, gap: 3 },
  driverName: { fontFamily: "Inter_700Bold", fontSize: 18 },
  driverVehicle: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  driverPlate: { fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 1 },
  actionBtns: { gap: 8 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  actionBtnEmoji: { fontSize: 20 },
  bottomActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  cancelBtn: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  sosRow: { flexDirection: "row", gap: 10 },
  sosBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  sosText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14, flex: 1, justifyContent: "center" },
  shareText: { fontFamily: "Inter_500Medium", fontSize: 13 },

  // SOS Modal
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  sosCard: { width: "100%", borderRadius: 28, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", padding: 24, alignItems: "center", shadowColor: "#EF4444", shadowOpacity: 0.3, shadowRadius: 32, elevation: 20 },
  sosPulseWrap: { alignItems: "center", marginBottom: 16 },
  sosPulseOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(239,68,68,0.10)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(239,68,68,0.3)" },
  sosPulseInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(239,68,68,0.18)", alignItems: "center", justifyContent: "center" },
  sosModalTitle: { fontSize: 24, fontWeight: "800", textAlign: "center", fontFamily: "Inter_700Bold", marginBottom: 6 },
  sosModalSub: { fontSize: 13, textAlign: "center", fontFamily: "Inter_400Regular", marginBottom: 20 },
  sosOptions: { width: "100%", gap: 10 },
  sosOption: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  sosOptLabel: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  sosOptSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  sosDialBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
  sosDismiss: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14, borderWidth: 1 },
  sosDismissText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  // Chat Modal
  chatContainer: { flex: 1, marginTop: 60, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, overflow: "hidden" },
  chatHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1 },
  chatHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  chatAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(245,166,35,0.15)", borderWidth: 1.5, borderColor: "rgba(245,166,35,0.4)", alignItems: "center", justifyContent: "center" },
  chatHeaderName: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chatHeaderSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  chatCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowDriver: { justifyContent: "flex-start" },
  msgAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(245,166,35,0.15)", borderWidth: 1, borderColor: "rgba(245,166,35,0.3)", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  msgBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  chatInputRow: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 28, borderTopWidth: 1, alignItems: "center" },
  chatInput: { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  chatSendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
});
