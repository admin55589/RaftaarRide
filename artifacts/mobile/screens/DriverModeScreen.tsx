import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
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
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MapView } from "@/components/MapView";

const MOCK_REQUESTS = [
  { id: "1", from: "Connaught Place", to: "DLF Cyber Hub", distance: "18 km", price: 320, eta: 3 },
  { id: "2", from: "Lajpat Nagar", to: "Hauz Khas", distance: "5 km", price: 120, eta: 2 },
];

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
          stroke="rgba(255,255,255,0.08)"
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
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, lineHeight: 11, marginTop: 1 }}>sec</Text>
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
            <Text style={[styles.requestBadgeText, { color: colors.primary }]}>New Ride</Text>
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
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{request.eta} min away</Text>
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
            <Text style={[styles.acceptText, { color: colors.successForeground }]}>Accept</Text>
          </Pressable>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

export function DriverModeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setScreen, driverEarnings, setDriverEarnings } = useApp();
  const { driver, isDriverLoggedIn, driverLogout, driverToken, updateDriver } = useDriverAuth();
  const { showNotification } = useNotification();
  const [isOnline, setIsOnline] = useState(true);
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const ridesCompleted = driver ? driver.totalRides : 7;

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

  const handleAccept = (id: string) => {
    const req = requests.find((r) => r.id === id);
    setRequests((rs) => rs.filter((r) => r.id !== id));
    const price = req?.price ?? 0;
    setDriverEarnings((e) => e + price);
    showNotification({
      title: "Ride Accept Ho Gayi! ✅",
      body: `${req?.from ?? ""} → ${req?.to ?? ""} • ₹${price} milenge`,
      type: "success",
      icon: "✅",
      duration: 4000,
    });
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

          <GlassCard style={styles.onlineToggle} padding={10}>
            <Animated.View style={[styles.onlineDot, { backgroundColor: isOnline ? colors.success : colors.destructive }, isOnline ? dotStyle : {}]} />
            <Text style={[styles.onlineLabel, { color: colors.foreground }]}>
              {isOnline ? "Online" : "Offline"}
            </Text>
            <Pressable
              onPress={() => { setIsOnline(!isOnline); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              style={[styles.toggleBtn, { backgroundColor: isOnline ? colors.success + "22" : colors.secondary, borderColor: isOnline ? colors.success : colors.border }]}
            >
              <Text style={[styles.toggleBtnText, { color: isOnline ? colors.success : colors.mutedForeground }]}>
                {isOnline ? "Go Offline" : "Go Online"}
              </Text>
            </Pressable>
          </GlassCard>
        </View>

        {driver && (
          <GlassCard style={[styles.profileChip, { marginHorizontal: 16 }]} padding={10}>
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
            <View style={[styles.ratingBadge, { backgroundColor: "rgba(245,166,35,0.15)" }]}>
              <Text style={{ fontSize: 11 }}>⭐</Text>
              <Text style={[styles.ratingText, { color: "#F5A623" }]}>{driver.rating}</Text>
            </View>
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
              <EarningsCounter value={driverEarnings || parseFloat(driver?.totalEarnings ?? "0")} />
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
              <Text style={[styles.statValue, { color: colors.foreground }]}>{driver?.rating ?? "4.5"}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rating</Text>
            </View>
          </View>
        </GlassCard>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.requestsList}>
          {requests.length > 0 ? (
            <>
              <Text style={[styles.requestsTitle, { color: colors.mutedForeground }]}>INCOMING REQUESTS</Text>
              {requests.map((r) => (
                <RideRequest
                  key={r.id}
                  request={r}
                  vehicleType={driver?.vehicleType}
                  onAccept={() => handleAccept(r.id)}
                  onReject={() => handleReject(r.id)}
                />
              ))}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 32 }}>📡</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {isOnline ? "Waiting for ride requests..." : "Go online to receive requests"}
              </Text>
            </View>
          )}
        </ScrollView>
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
    maxHeight: "62%",
  },
  statsCard: {
    borderRadius: 24,
    backgroundColor: "rgba(22,22,30,0.97)",
    borderColor: "rgba(255,255,255,0.1)",
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
  requestsList: {
    flex: 1,
  },
  requestsTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  requestCard: {
    borderRadius: 20,
    marginBottom: 10,
    backgroundColor: "rgba(22,22,30,0.97)",
    borderColor: "rgba(255,255,255,0.1)",
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
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
});
