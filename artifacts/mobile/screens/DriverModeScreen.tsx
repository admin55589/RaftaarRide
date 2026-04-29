import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import Animated, {
  FadeInDown,
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MapView } from "@/components/MapView";
import { connectSocket, sendChatMessage, emitDriverLocation, joinDriverRoom, getSocket } from "@/lib/socket";

interface ChatMsg {
  id: string;
  senderId: string;
  senderName: string;
  role: "user" | "driver";
  text: string;
  timestamp: number;
}

interface ActiveRide {
  rideId: number;
  from: string;
  to: string;
  price: number;
  distance: string;
  userName: string;
}

const MOCK_REQUESTS: Array<{ id: string; rideId: number; from: string; to: string; distance: string; price: number; eta: number; userName: string }> = [];

function getVehicleIcon(vehicleType?: string): string {
  switch ((vehicleType ?? "").toLowerCase()) {
    case "bike":    return "🏍️";
    case "auto":    return "🛺";
    case "suv":     return "🚙";
    case "prime":
    case "car":     return "🚗";
    default:        return "🚗";
  }
}

function EarningsCounter({ value }: { value: number }) {
  const colors = useColors();
  const displayVal = useSharedValue(0);
  useEffect(() => {
    displayVal.value = withTiming(1, { duration: 1500 });
  }, []);

  return (
    <Text style={[styles.earningsValue, { color: colors.primary }]}>
      ₹{value.toLocaleString()}
    </Text>
  );
}

const TIMER_SIZE = 64;
const TIMER_RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

function CircleTimer({ countdown, total = 20 }: { countdown: number; total?: number }) {
  const colors = useColors();
  const progress = countdown / total;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const progressColor = countdown > 10 ? "#22c55e" : countdown > 5 ? "#F5A623" : "#ef4444";
  const bgColor = countdown > 10 ? "rgba(34,197,94,0.08)" : countdown > 5 ? "rgba(245,166,35,0.08)" : "rgba(239,68,68,0.08)";

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (countdown <= 5 && countdown > 0) {
      pulse.value = withRepeat(
        withSequence(withTiming(1.12, { duration: 280 }), withTiming(1, { duration: 280 })),
        -1, false
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [countdown <= 5]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const cx = TIMER_SIZE / 2;
  const cy = TIMER_SIZE / 2;

  return (
    <Animated.View style={[{ width: TIMER_SIZE, height: TIMER_SIZE, alignItems: "center", justifyContent: "center" }, pulseStyle]}>
      <Svg width={TIMER_SIZE} height={TIMER_SIZE} style={{ position: "absolute" }}>
        <Defs>
          <SvgGradient id="timerGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={progressColor} stopOpacity="1" />
            <Stop offset="1" stopColor={progressColor} stopOpacity="0.7" />
          </SvgGradient>
        </Defs>
        <Circle
          cx={cx} cy={cy} r={TIMER_RADIUS}
          stroke={colors.border}
          strokeWidth={5}
          fill={bgColor}
        />
        <Circle
          cx={cx} cy={cy} r={TIMER_RADIUS}
          stroke="url(#timerGrad)"
          strokeWidth={5}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${cx}, ${cy}`}
        />
      </Svg>
      <View style={{ alignItems: "center" }}>
        <Text style={{ color: progressColor, fontWeight: "800", fontSize: 16, lineHeight: 19 }}>{countdown}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 9, lineHeight: 11, marginTop: 1 }}>sec</Text>
      </View>
    </Animated.View>
  );
}

function RideRequest({
  request,
  vehicleType,
  onAccept,
  onReject,
}: {
  request: typeof MOCK_REQUESTS[0];
  vehicleType?: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  const [countdown, setCountdown] = useState(20);
  const onRejectRef = React.useRef(onReject);
  onRejectRef.current = onReject;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      onRejectRef.current();
    }
  }, [countdown]);

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <GlassCard style={styles.requestCard} padding={16}>
        <View style={styles.requestHeader}>
          <View style={[styles.requestBadge, { backgroundColor: "rgba(245,166,35,0.13)", borderColor: colors.primary }]}>
            <Text style={{ fontSize: 14 }}>{getVehicleIcon(vehicleType)}</Text>
            <Text style={[styles.requestBadgeText, { color: colors.primary }]}>{t("new_ride")}</Text>
          </View>
          <CircleTimer countdown={countdown} />
        </View>

        <View style={styles.routeInfo}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.routeText, { color: colors.foreground }]}>{request.from}</Text>
          </View>
          <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.routeText, { color: colors.foreground }]}>{request.to}</Text>
          </View>
        </View>

        <View style={styles.requestMeta}>
          <View style={[styles.metaChip, { backgroundColor: colors.secondary }]}>
            <Text style={{ fontSize: 11 }}>📍</Text>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{request.distance}</Text>
          </View>
          <View style={[styles.metaChip, { backgroundColor: colors.secondary }]}>
            <Text style={{ fontSize: 11 }}>🕐</Text>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{request.eta} {t("min_away")}</Text>
          </View>
          <View style={[styles.metaChip, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.metaPrice, { color: colors.primary }]}>₹{request.price}</Text>
          </View>
        </View>

        <View style={styles.requestActions}>
          <Pressable
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onReject(); }}
            style={[styles.rejectBtn, { borderColor: colors.destructive }]}
          >
            <Text style={{ fontSize: 22, color: colors.destructive }}>✕</Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onAccept(); }}
            style={[styles.acceptBtn, { backgroundColor: colors.success }]}
          >
            <Text style={{ fontSize: 22, color: colors.successForeground }}>✓</Text>
            <Text style={[styles.acceptText, { color: colors.successForeground }]}>{t("accept")}</Text>
          </Pressable>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

function DriverChatModal({
  visible,
  onClose,
  activeRide,
  driverName,
  vehicleType,
  messages,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  activeRide: ActiveRide;
  driverName: string;
  vehicleType?: string;
  messages: ChatMsg[];
  onSend: (text: string) => void;
}) {
  const [inputText, setInputText] = useState("");
  const flatRef = useRef<FlatList>(null);
  const colors = useColors();

  useEffect(() => {
    if (visible && messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, visible]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    onSend(text);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={chatStyles.overlay}>
          <View style={[chatStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header */}
            <View style={[chatStyles.header, { borderColor: colors.border }]}>
              <View style={chatStyles.headerLeft}>
                <View style={chatStyles.avatarCircle}>
                  <Text style={{ fontSize: 18 }}>👤</Text>
                </View>
                <View>
                  <Text style={[chatStyles.headerName, { color: colors.foreground }]}>{activeRide.userName}</Text>
                  <Text style={[chatStyles.headerSub, { color: colors.mutedForeground }]}>🟢 On Ride • {activeRide.from} → {activeRide.to}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={[chatStyles.closeBtn, { backgroundColor: colors.secondary }]}>
                <Text style={{ color: colors.foreground, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              ref={flatRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={chatStyles.messageList}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={chatStyles.emptyChat}>
                  <Text style={{ fontSize: 32 }}>💬</Text>
                  <Text style={[chatStyles.emptyChatText, { color: colors.mutedForeground }]}>Abhi koi message nahi — user ka wait karo</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isDriver = item.role === "driver";
                return (
                  <Animated.View
                    entering={FadeInDown.duration(200)}
                    style={[chatStyles.msgRow, isDriver ? chatStyles.msgRowRight : chatStyles.msgRowLeft]}
                  >
                    {!isDriver && (
                      <View style={[chatStyles.msgAvatar, { backgroundColor: colors.secondary }]}>
                        <Text style={{ fontSize: 12 }}>👤</Text>
                      </View>
                    )}
                    <View style={[chatStyles.bubble, isDriver ? chatStyles.driverBubble : [chatStyles.userBubble, { backgroundColor: colors.secondary }]]}>
                      <Text style={[chatStyles.bubbleText, isDriver ? { color: "#0A0A0F" } : { color: colors.foreground }]}>
                        {item.text}
                      </Text>
                      <Text style={[chatStyles.bubbleTime, { color: isDriver ? "rgba(0,0,0,0.5)" : colors.mutedForeground }]}>
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    {isDriver && (
                      <View style={[chatStyles.msgAvatar, { backgroundColor: "rgba(245,166,35,0.2)" }]}>
                        <Text style={{ fontSize: 12 }}>{getVehicleIcon(vehicleType)}</Text>
                      </View>
                    )}
                  </Animated.View>
                );
              }}
            />

            {/* Input */}
            <View style={[chatStyles.inputRow, { borderColor: colors.border }]}>
              <TextInput
                style={[chatStyles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Reply karein..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                onPress={handleSend}
                activeOpacity={0.8}
                style={[chatStyles.sendBtn, { backgroundColor: inputText.trim() ? "#F5A623" : colors.secondary }]}
              >
                <Text style={{ fontSize: 18 }}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function DriverModeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setScreen, driverEarnings, setDriverEarnings } = useApp();
  const { driver, isDriverLoggedIn, driverLogout, driverToken, updateDriver } = useDriverAuth();
  const { showNotification } = useNotification();
  const { lang, toggleLanguage, t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const [isOnline, setIsOnline] = useState(true);
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const ridesCompleted = driver?.totalRides ?? 0;

  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const activeRideRef = useRef<ActiveRide | null>(null);
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    if (!activeRide) return;
    const socket = connectSocket();
    socket.emit("ride:join", activeRide.rideId);

    const handleChatMsg = (data: Omit<ChatMsg, "id">) => {
      if (data.role === "user") {
        const msg: ChatMsg = { ...data, id: `${data.timestamp}-${Math.random()}` };
        setChatMessages((prev) => [...prev, msg]);
        if (!showChat) {
          setUnreadCount((n) => n + 1);
          showNotification({
            title: `💬 ${data.senderName}`,
            body: data.text,
            type: "info",
            icon: "💬",
            duration: 4000,
          });
        }
      }
    };

    socket.on("chat:message", handleChatMsg);
    return () => { socket.off("chat:message", handleChatMsg); };
  }, [activeRide?.rideId]);

  const [locUpdating, setLocUpdating] = useState(false);
  const [lastLocTime, setLastLocTime] = useState<Date | null>(null);

  const handleLocationUpdate = useCallback(async (silent = false) => {
    if (locUpdating) return;
    setLocUpdating(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      let granted = status === "granted";
      if (!granted) {
        const { status: req } = await Location.requestForegroundPermissionsAsync();
        granted = req === "granted";
      }
      if (!granted) {
        if (!silent) {
          Alert.alert(
            "📍 Location Permission Chahiye",
            "Rides receive karne ke liye GPS permission enable karein.\n\nSettings mein jaake 'Location' ko 'Allow' karein.",
            [
              { text: "Settings Kholein", onPress: () => Linking.openSettings() },
              { text: "Bad Mein", style: "cancel" },
            ]
          );
        }
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      if (driverToken) {
        await fetch(`${API_BASE}/driver-auth/location`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${driverToken}` },
          body: JSON.stringify({ lat: latitude, lng: longitude }),
        });
      }
      if (driver?.id && activeRideRef.current?.rideId) {
        emitDriverLocation(driver.id, activeRideRef.current.rideId, latitude, longitude);
      }
      setLastLocTime(new Date());
      if (!silent) showNotification({ title: "📍 Location Update Ho Gayi!", body: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, type: "success", icon: "✅" });
    } catch (_) {
      if (!silent) showNotification({ title: "Location Error", body: "GPS se location nahi mili", type: "error", icon: "❌" });
    } finally {
      setLocUpdating(false);
    }
  }, [locUpdating, driverToken, driver?.id, showNotification]);

  /* Re-check location when app comes back to foreground (e.g. after granting permission in Settings) */
  useEffect(() => {
    if (!isOnline) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        handleLocationUpdate(true);
      }
    });
    return () => sub.remove();
  }, [isOnline, handleLocationUpdate]);

  /* Auto-update location: 10s during active ride, 90s otherwise */
  useEffect(() => {
    if (!isOnline) return;
    handleLocationUpdate(true);
    const intervalMs = activeRide ? 10000 : 90000;
    const interval = setInterval(() => handleLocationUpdate(true), intervalMs);
    return () => clearInterval(interval);
  }, [isOnline, activeRide?.rideId]);

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState(driver?.name ?? "");
  const [editPhoto, setEditPhoto] = useState<string | null>(driver?.photoUrl ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [toast, setToast] = useState<{ show: boolean; title: string; subtitle: string; type: "success" | "error" }>({
    show: false, title: "", subtitle: "", type: "success",
  });
  const showToast = (title: string, subtitle: string, type: "success" | "error" = "success") => {
    setToast({ show: true, title, subtitle, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  };

  const API_BASE = (() => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (domain) return `https://${domain}/api`;
    return "http://localhost:8080/api";
  })();

  /* Join driver socket room + fetch real rides + listen for new ride events */
  useEffect(() => {
    if (!driverToken || !driver?.id) return;
    const socket = connectSocket();
    joinDriverRoom(driver.id);

    /* Fetch existing active rides for this driver */
    fetch(`${API_BASE}/driver-auth/rides/active`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.rides) && data.rides.length > 0) {
          /* Only add if there's no current activeRide and no existing requests */
          setRequests((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newRides = data.rides.filter((r: { id: string }) => !existingIds.has(r.id));
            return [...prev, ...newRides];
          });
        }
      })
      .catch(() => {});

    /* Real-time new ride via socket */
    function onNewRide(data: { id: string; rideId: number; from: string; to: string; distance: string; price: number; eta: number; userName: string }) {
      setRequests((prev) => {
        if (prev.some((r) => r.id === data.id)) return prev;
        return [...prev, data];
      });
      showNotification({
        title: "🚖 Naya Ride Request!",
        body: `${data.from} → ${data.to} • ₹${data.price}`,
        type: "success",
        icon: "🚖",
        duration: 5000,
      });
    }

    socket.on("driver:new_ride", onNewRide);
    return () => { socket.off("driver:new_ride", onNewRide); };
  }, [driverToken, driver?.id]);

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission chahiye", "Gallery access allow karo"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64 && asset.base64.length > 500000) {
        Alert.alert("Photo bahut badi hai", "Choti photo select karo (max 500KB)"); return;
      }
      const dataUri = `data:image/jpeg;base64,${asset.base64}`;
      setEditPhoto(dataUri);
    }
  };

  const handleSaveDriverProfile = async () => {
    if (!editName.trim()) { setProfileError("Naam khali nahi ho sakta"); return; }
    setProfileError("");
    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/driver-auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${driverToken}` },
        body: JSON.stringify({ name: editName.trim(), photoUrl: editPhoto }),
      });
      const data = await res.json();
      if (data.success) {
        updateDriver({ ...driver!, ...data.driver });
        setShowProfileEdit(false);
        showToast("Profile Update Ho Gayi! 🎉", `${data.driver.name} — chalte hain raftaar se!`, "success");
      } else {
        setProfileError(data.message ?? "Update failed");
      }
    } catch { setProfileError("Network error — try again"); }
    finally { setSavingProfile(false); }
  };

  const prevRequestCount = React.useRef(requests.length);
  useEffect(() => {
    if (!isOnline) return;
    if (requests.length > prevRequestCount.current) {
      const newReq = requests[requests.length - 1];
      showNotification({
        title: `Naya Ride Request! ${getVehicleIcon(driver?.vehicleType)}`,
        body: `${newReq.from} → ${newReq.to} • ₹${newReq.price}`,
        type: "ride",
        icon: getVehicleIcon(driver?.vehicleType),
        duration: 5000,
      });
    }
    prevRequestCount.current = requests.length;
  }, [requests, isOnline]);

  useEffect(() => {
    if (isOnline && requests.length > 0) {
      const timer = setTimeout(() => {
        showNotification({
          title: `${requests.length} Ride Request${requests.length > 1 ? "s" : ""} Waiting! 🔔`,
          body: "Aap online hain — requests check karo",
          type: "warning",
          icon: "🔔",
          duration: 4500,
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  const dotScale = useSharedValue(1);
  useEffect(() => {
    dotScale.value = withRepeat(
      withSequence(withTiming(1.4, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

  const handleAccept = async (id: string) => {
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    setRequests((rs) => rs.filter((r) => r.id !== id));
    setDriverEarnings(driverEarnings + req.price);
    setChatMessages([]);
    setUnreadCount(0);
    setActiveRide({
      rideId: req.rideId,
      from: req.from,
      to: req.to,
      price: req.price,
      distance: req.distance,
      userName: req.userName,
    });

    /* Join ride socket room so we can send/receive events for this ride */
    const socket = connectSocket();
    socket.emit("ride:join", req.rideId);

    /* Notify backend that driver is on the way (status → arrived) */
    if (driverToken) {
      fetch(`${API_BASE}/driver-auth/rides/${req.rideId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${driverToken}` },
        body: JSON.stringify({ status: "arrived" }),
      }).catch(() => {});
    }

    showNotification({
      title: "Ride Accept Ho Gayi! ✅",
      body: `${req.from} → ${req.to} • ₹${req.price} milenge`,
      type: "success",
      icon: "✅",
      duration: 4000,
    });
  };

  const handleSendDriverMessage = (text: string) => {
    if (!activeRide) return;
    const msg: ChatMsg = {
      id: `${Date.now()}-driver`,
      senderId: driver?.id?.toString() ?? "driver-1",
      senderName: driver?.name ?? "Driver",
      role: "driver",
      text,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, msg]);
    sendChatMessage(activeRide.rideId, msg.senderId, msg.senderName, "driver", text);
  };

  const handleOpenChat = () => {
    setShowChat(true);
    setUnreadCount(0);
  };

  const handleCompleteRide = () => {
    if (!activeRide) return;
    setPinInput("");
    setPinModalVisible(true);
  };

  const handlePinSubmit = async () => {
    if (!activeRide || pinInput.length !== 4) {
      Alert.alert("Invalid PIN", "4-digit PIN zaroori hai");
      return;
    }
    setPinLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rides/${activeRide.rideId}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${driverToken}` },
        body: JSON.stringify({ pin: Number(pinInput) }),
      });
      const data = await res.json();
      if (data.success) {
        setPinModalVisible(false);
        setPinInput("");
        setActiveRide(null);
        setChatMessages([]);
        setUnreadCount(0);
        showNotification({ title: "Ride Complete! 🎉", body: `₹${activeRide.price} earn kiye`, type: "success", icon: "🎉", duration: 4000 });
      } else {
        Alert.alert("Galat PIN ❌", data.error ?? "PIN sahi nahi — passenger se dobara poochho");
      }
    } catch {
      Alert.alert("Network Error", "Dobara try karo");
    } finally {
      setPinLoading(false);
    }
  };

  const handleReject = (id: string) => {
    setRequests((rs) => rs.filter((r) => r.id !== id));
    showNotification({
      title: "Request Reject Ki",
      body: "Agli request ka intezaar karo",
      type: "warning",
      icon: "⏭️",
      duration: 3000,
    });
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView showRadar={isOnline} />

      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              if (isDriverLoggedIn) {
                driverLogout();
              } else {
                setScreen("home");
              }
            }}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={{ fontSize: 16, color: colors.foreground, lineHeight: 20 }}>
              {isDriverLoggedIn ? "🚪" : "←"}
            </Text>
          </Pressable>

          <Pressable
            onPress={toggleLanguage}
            style={[styles.backBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "66" }]}
          >
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "700" }}>
              {lang === "hi" ? "हिं" : "EN"}
            </Text>
          </Pressable>

          <Pressable
            onPress={toggleTheme}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={{ fontSize: 15 }}>{isDark ? "☀️" : "🌙"}</Text>
          </Pressable>

          {/* GPS Location Update Button */}
          <Pressable
            onPress={() => handleLocationUpdate(false)}
            disabled={locUpdating}
            style={[styles.backBtn, {
              backgroundColor: locUpdating ? colors.secondary : (lastLocTime ? "rgba(74,222,128,0.12)" : "rgba(245,166,35,0.12)"),
              borderColor: locUpdating ? colors.border : (lastLocTime ? "#4ADE80" : colors.primary),
            }]}
          >
            {locUpdating
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={{ fontSize: 15, lineHeight: 19 }}>📍</Text>
            }
          </Pressable>

          <GlassCard style={styles.onlineToggle} padding={10}>
            <Animated.View style={[styles.onlineDot, { backgroundColor: isOnline ? colors.success : colors.destructive }, isOnline ? dotStyle : {}]} />
            <Text style={[styles.onlineLabel, { color: colors.foreground }]}>
              {isOnline ? t("online") : t("offline")}
            </Text>
            <Pressable
              onPress={() => { setIsOnline(!isOnline); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              style={[styles.toggleBtn, { backgroundColor: isOnline ? colors.success + "22" : colors.secondary, borderColor: isOnline ? colors.success : colors.border }]}
            >
              <Text style={[styles.toggleBtnText, { color: isOnline ? colors.success : colors.mutedForeground }]}>
                {isOnline ? t("go_offline_btn") : t("go_online_btn")}
              </Text>
            </Pressable>
          </GlassCard>
        </View>

        {driver && (
          <GlassCard style={{ ...styles.profileChip, marginHorizontal: 16 }} padding={10}>
            <Pressable onPress={() => { setEditName(driver.name); setEditPhoto(driver.photoUrl ?? null); setShowProfileEdit(true); }}>
              {driver.photoUrl ? (
                <Image source={{ uri: driver.photoUrl }} style={styles.profileAvatarImg} />
              ) : (
                <View style={styles.profileAvatar}>
                  <Text style={{ fontSize: 16 }}>👤</Text>
                </View>
              )}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>{driver.name}</Text>
              <Text style={[styles.profileVehicle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {driver.vehicleNumber} • {driver.vehicleType.charAt(0).toUpperCase() + driver.vehicleType.slice(1)}
              </Text>
            </View>
            {driver.rating ? (
              <View style={[styles.ratingBadge, { backgroundColor: "rgba(245,166,35,0.15)" }]}>
                <Text style={{ fontSize: 11 }}>⭐</Text>
                <Text style={[styles.ratingText, { color: "#F5A623" }]}>{driver.rating}</Text>
              </View>
            ) : (
              <View style={[styles.ratingBadge, { backgroundColor: "rgba(138,138,154,0.12)" }]}>
                <Text style={{ fontSize: 11 }}>⭐</Text>
                <Text style={[styles.ratingText, { color: "#8A8A9A" }]}>New</Text>
              </View>
            )}
            <Pressable
              onPress={() => { setEditName(driver.name); setEditPhoto(driver.photoUrl ?? null); setShowProfileEdit(true); }}
              style={styles.editProfileBtn}
            >
              <Text style={{ fontSize: 13 }}>✏️</Text>
            </Pressable>
          </GlassCard>
        )}
      </View>

      <Animated.View entering={FadeInDown.springify()} style={[styles.sheet, { paddingBottom: bottomPad + 12 }]}>
        <GlassCard style={styles.statsCard} padding={12}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statIcon}>💰</Text>
              <EarningsCounter value={parseFloat(driver?.totalEarnings ?? "0")} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Earnings</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={styles.statIcon}>{getVehicleIcon(driver?.vehicleType)}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{ridesCompleted}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rides</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={styles.statIcon}>⭐</Text>
              <Text style={[styles.statValue, { color: driver?.rating ? colors.foreground : colors.mutedForeground }]}>
                {driver?.rating ? driver.rating : "—"}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rating</Text>
            </View>
          </View>
        </GlassCard>

        {/* Active Trip Card */}
        {activeRide && (
          <Animated.View entering={FadeInDown.springify()} style={[styles.activeTripCard, { backgroundColor: colors.card, borderColor: "rgba(34,197,94,0.5)" }]}>
            <View style={styles.activeTripHeader}>
              <View style={styles.activeTripBadge}>
                <Text style={{ fontSize: 10 }}>🟢</Text>
                <Text style={{ color: "#4ADE80", fontSize: 11, fontWeight: "700" }}>ACTIVE RIDE</Text>
              </View>
              <TouchableOpacity onPress={handleCompleteRide} style={styles.completeBtn}>
                <Text style={{ color: "#4ADE80", fontSize: 11, fontWeight: "700" }}>Complete ✓</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activeTripRoute}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: "#F5A623" }]} />
                <Text style={[styles.routeText, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{activeRide.from}</Text>
              </View>
              <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: "#4ADE80" }]} />
                <Text style={[styles.routeText, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{activeRide.to}</Text>
              </View>
            </View>

            <View style={styles.activeTripFooter}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[styles.metaChip, { backgroundColor: colors.secondary }]}>
                  <Text style={{ fontSize: 10 }}>👤</Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{activeRide.userName}</Text>
                </View>
                <View style={[styles.metaChip, { backgroundColor: "rgba(245,166,35,0.12)" }]}>
                  <Text style={[styles.metaPrice, { color: "#F5A623", fontSize: 12 }]}>₹{activeRide.price}</Text>
                </View>
              </View>

              {/* Chat Button with unread badge */}
              <TouchableOpacity onPress={handleOpenChat} activeOpacity={0.8} style={styles.chatBtn}>
                <Text style={{ fontSize: 18 }}>💬</Text>
                {unreadCount > 0 && (
                  <Animated.View entering={FadeInDown.duration(200)} style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                  </Animated.View>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <View style={styles.requestsList}>
          {!activeRide && requests.length > 0 ? (
            <>
              <View style={styles.requestsTitleRow}>
                <Text style={[styles.requestsTitle, { color: colors.mutedForeground }]}>INCOMING REQUESTS</Text>
                {requests.length > 1 && (
                  <View style={[styles.queueBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}>
                    <Text style={[styles.queueBadgeText, { color: colors.primary }]}>+{requests.length - 1} queue mein</Text>
                  </View>
                )}
              </View>
              <RideRequest
                key={requests[0].id}
                request={requests[0]}
                vehicleType={driver?.vehicleType}
                onAccept={() => handleAccept(requests[0].id)}
                onReject={() => handleReject(requests[0].id)}
              />
            </>
          ) : !activeRide ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 32 }}>📡</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {isOnline ? "Waiting for ride requests..." : "Go online to receive requests"}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {toast.show && (
        <Animated.View
          entering={SlideInUp.springify().damping(14)}
          exiting={SlideOutUp.springify()}
          style={[
            styles.toastContainer,
            { top: insets.top + 12 },
            toast.type === "error" ? styles.toastError : styles.toastSuccess,
          ]}
        >
          <Text style={styles.toastEmoji}>
            {toast.type === "success" ? "✅" : "❌"}
          </Text>
          <View style={styles.toastTextWrap}>
            <Text style={styles.toastTitle}>{toast.title}</Text>
            <Text style={styles.toastSubtitle}>{toast.subtitle}</Text>
          </View>
        </Animated.View>
      )}

      {activeRide && (
        <DriverChatModal
          visible={showChat}
          onClose={() => setShowChat(false)}
          activeRide={activeRide}
          driverName={driver?.name ?? "Driver"}
          vehicleType={driver?.vehicleType}
          messages={chatMessages}
          onSend={handleSendDriverMessage}
        />
      )}

      <Modal visible={showProfileEdit} transparent animationType="slide" onRequestClose={() => { setShowProfileEdit(false); setProfileError(""); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>👤 Profile Edit</Text>
                <Pressable onPress={() => { setShowProfileEdit(false); setProfileError(""); }}>
                  <Text style={{ color: "#8A8A9A", fontSize: 18 }}>✕</Text>
                </Pressable>
              </View>

              <Pressable onPress={handlePickPhoto} style={styles.photoWrap}>
                {editPhoto ? (
                  <Image source={{ uri: editPhoto }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={{ fontSize: 32 }}>👤</Text>
                  </View>
                )}
                <View style={styles.cameraOverlay}>
                  <Text style={{ fontSize: 12 }}>📷</Text>
                </View>
              </Pressable>
              <Text style={styles.photoHint}>Photo tap karo badlne ke liye</Text>

              <Text style={styles.inputLabel}>Naam</Text>
              <TextInput
                style={styles.textInput}
                value={editName}
                onChangeText={(v) => { setEditName(v); setProfileError(""); }}
                placeholder="Driver ka naam"
                placeholderTextColor="#8A8A9A"
                autoCapitalize="words"
              />

              {profileError ? (
                <View style={styles.errorBox}>
                  <Text style={{ fontSize: 13 }}>⚠️</Text>
                  <Text style={styles.errorText}>{profileError}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleSaveDriverProfile}
                disabled={savingProfile}
                style={[styles.saveBtn, savingProfile && { opacity: 0.6 }]}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#0A0A0F" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>✅ Save Karo</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PIN Entry Modal */}
      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => setPinModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.pinOverlay}>
            <View style={styles.pinCard}>
              <Text style={styles.pinTitle}>🔐 Ride Complete PIN</Text>
              <Text style={styles.pinSubtitle}>Passenger se 4-digit PIN maango</Text>
              <TextInput
                style={styles.pinInput}
                value={pinInput}
                onChangeText={(t) => setPinInput(t.replace(/[^0-9]/g, "").slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="- - - -"
                placeholderTextColor="rgba(255,255,255,0.3)"
                textAlign="center"
                autoFocus
              />
              <View style={styles.pinActions}>
                <Pressable style={styles.pinCancelBtn} onPress={() => setPinModalVisible(false)} disabled={pinLoading}>
                  <Text style={styles.pinCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.pinSubmitBtn, (pinInput.length !== 4 || pinLoading) && { opacity: 0.5 }]}
                  onPress={handlePinSubmit}
                  disabled={pinInput.length !== 4 || pinLoading}
                >
                  {pinLoading
                    ? <ActivityIndicator color="#0A0A0F" size="small" />
                    : <Text style={styles.pinSubmitText}>✅ Verify & Complete</Text>
                  }
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245,166,35,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
    flexShrink: 0,
  },
  profileAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(245,166,35,0.4)",
  },
  editProfileBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(245,166,35,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(245,166,35,0.3)",
  },
  profileName: { fontSize: 14, fontWeight: "700", lineHeight: 17 },
  profileVehicle: { fontSize: 11, lineHeight: 14 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  ratingText: { fontSize: 12, fontWeight: "700" },
  toastContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  toastSuccess: {
    backgroundColor: "#0E1F13",
    borderWidth: 1.5,
    borderColor: "rgba(52,211,153,0.5)",
  },
  toastError: {
    backgroundColor: "#1F0E0E",
    borderWidth: 1.5,
    borderColor: "rgba(255,77,77,0.5)",
  },
  toastEmoji: { fontSize: 26 },
  toastTextWrap: { flex: 1 },
  toastTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 14, marginBottom: 2 },
  toastSubtitle: { color: "#B0B0C0", fontSize: 12, lineHeight: 17 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#12121A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: "#2A2A38",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  modalTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  photoWrap: {
    alignSelf: "center",
    position: "relative",
    width: 90,
    height: 90,
  },
  photoPreview: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: "#F5A623" },
  photoPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: "#16161E",
    borderWidth: 2, borderColor: "#2A2A38",
    alignItems: "center", justifyContent: "center",
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 2, right: 2,
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: "#F5A623",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#12121A",
  },
  photoHint: { color: "#8A8A9A", fontSize: 11, textAlign: "center" },
  inputLabel: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  textInput: {
    backgroundColor: "#16161E",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#2A2A38",
    paddingVertical: 13,
    paddingHorizontal: 14,
    color: "#FFFFFF",
    fontSize: 15,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,77,77,0.1)", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "rgba(255,77,77,0.3)",
  },
  errorText: { color: "#FF4D4D", fontSize: 12, flex: 1 },
  saveBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { color: "#0A0A0F", fontWeight: "800", fontSize: 15 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "column",
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
  onlineToggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 20,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  onlineLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  toggleBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  toggleBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    gap: 10,
    maxHeight: "66%",
  },
  statsCard: {
    borderRadius: 24,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  statIcon: {
    fontSize: 16,
    marginBottom: 1,
  },
  earningsValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  requestsList: {},
  requestsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  requestsTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  queueBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  queueBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  requestCard: {
    borderRadius: 20,
    marginBottom: 10,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  requestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  requestBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  routeInfo: {
    gap: 0,
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 5,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeLine: {
    width: 1,
    height: 12,
    marginLeft: 3.5,
  },
  routeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  requestMeta: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  metaPrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  requestActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  rejectBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  acceptText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  activeTripCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },
  activeTripHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeTripBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(74,222,128,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  completeBtn: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.3)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  activeTripRoute: { gap: 0, marginVertical: 4 },
  activeTripFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(245,166,35,0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(245,166,35,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  pinOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pinCard: {
    backgroundColor: "#1A1A2E",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  pinTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#F5A623",
  },
  pinSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
  pinInput: {
    width: "100%",
    fontSize: 36,
    letterSpacing: 16,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(245,166,35,0.5)",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  pinActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  pinCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
  },
  pinCancelText: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  pinSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#F5A623",
    alignItems: "center",
  },
  pinSubmitText: {
    color: "#0A0A0F",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
});

const chatStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#10101A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(245,166,35,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(245,166,35,0.35)",
  },
  headerName: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  headerSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: { padding: 16, gap: 10, flexGrow: 1 },
  emptyChat: { alignItems: "center", padding: 40, gap: 10 },
  emptyChatText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 4 },
  msgRowLeft: { justifyContent: "flex-start" },
  msgRowRight: { justifyContent: "flex-end" },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "72%",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    gap: 3,
  },
  userBubble: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderBottomLeftRadius: 4,
  },
  driverBubble: {
    backgroundColor: "#F5A623",
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  bubbleTime: { fontFamily: "Inter_400Regular", fontSize: 10, alignSelf: "flex-end" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fff",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
