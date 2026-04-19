import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { MapView } from "@/components/MapView";
import { GlassCard } from "@/components/GlassCard";

const SUGGESTIONS = [
  { label: "Office", sub: "Connaught Place", icon: "💼" },
  { label: "Home", sub: "Sector 62, Noida", icon: "🏠" },
  { label: "Airport", sub: "T3, IGI Airport", icon: "✈️" },
];

const HOUR = new Date().getHours();
function getGreeting() {
  if (HOUR < 12) return "Good Morning";
  if (HOUR < 17) return "Good Afternoon";
  return "Good Evening";
}

function SuggestionChip({
  label,
  sub,
  icon,
  onPress,
}: {
  label: string;
  sub: string;
  icon: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInDown.springify()} style={animStyle}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 20 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
        onPress={onPress}
        style={[styles.suggestion, { backgroundColor: colors.secondary, borderColor: colors.border }]}
      >
        <View style={[styles.suggestionIcon, { backgroundColor: "rgba(245,166,35,0.12)" }]}>
          <Text style={styles.suggestionEmoji}>{icon}</Text>
        </View>
        <View style={styles.suggestionText}>
          <Text style={[styles.suggestionLabel, { color: colors.foreground }]}>{label}</Text>
          <Text style={[styles.suggestionSub, { color: colors.mutedForeground }]} numberOfLines={1}>{sub}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setScreen, setDestination, currentLocationAddress, setCurrentLocationAddress, setPickup } = useApp();
  const { user, token, logout, updateUser } = useAuth();
  const userName = user?.name ?? "Aarav";
  const [inputValue, setInputValue] = useState("");
  const [locating, setLocating] = useState(false);

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editEmail, setEditEmail] = useState(user?.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [showPickupEdit, setShowPickupEdit] = useState(false);
  const [editPickup, setEditPickup] = useState(currentLocationAddress);
  const [gpsLoading, setGpsLoading] = useState(false);

  const API_BASE = (() => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (domain) return `https://${domain}/api`;
    return "http://localhost:8080/api";
  })();

  const handleSaveProfile = async () => {
    if (!editName.trim()) { Alert.alert("Error", "Name khali nahi ho sakta"); return; }
    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName.trim(), email: editEmail.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        updateUser({ ...user!, name: data.user.name, email: data.user.email });
        setShowProfileEdit(false);
        Alert.alert("Done! ✅", "Profile update ho gayi");
      } else {
        Alert.alert("Error", data.error ?? "Update failed");
      }
    } catch { Alert.alert("Error", "Network error — try again"); }
    finally { setSavingProfile(false); }
  };

  const handleGpsPickup = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setGpsLoading(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      if (geo) {
        const parts = [geo.name, geo.street, geo.subregion ?? geo.district, geo.city].filter(Boolean);
        const addr = parts.slice(0, 3).join(", ") || "Current Location";
        setEditPickup(addr);
      }
    } catch (_) {}
    setGpsLoading(false);
  };

  const handleSavePickup = () => {
    const val = editPickup.trim();
    if (!val) { Alert.alert("Error", "Pickup location khali nahi ho sakta"); return; }
    setCurrentLocationAddress(val);
    setPickup(val);
    setShowPickupEdit(false);
  };

  const dotScale = useSharedValue(1);
  useEffect(() => {
    dotScale.value = withRepeat(
      withSequence(withTiming(1.3, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1, false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

  const handleLocateMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocating(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      if (geo) {
        const parts = [geo.name, geo.street, geo.subregion ?? geo.district, geo.city].filter(Boolean);
        const addr = parts.slice(0, 3).join(", ") || "Current Location";
        setCurrentLocationAddress(addr);
        setPickup(addr);
      }
    } catch (_) {}
    setLocating(false);
  };

  const handleDestinationSelect = (dest: string) => {
    setDestination(dest);
    setScreen("booking");
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView />

      <View style={[styles.topOverlay, { paddingTop: topPad + 8 }]}>
        <Animated.View entering={FadeInDown.springify()} style={styles.topBar}>
          <Pressable style={styles.locationRow} onPress={handleLocateMe}>
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Animated.View style={[styles.locationDot, { backgroundColor: colors.primary }, dotStyle]} />
            )}
            <Text style={[styles.locationText, { color: colors.foreground }]} numberOfLines={1}>
              {currentLocationAddress}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => { setEditPickup(currentLocationAddress); setShowPickupEdit(true); }}
            style={[styles.iconBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            hitSlop={8}
          >
            <Text style={styles.iconBtnEmoji}>✏️</Text>
          </Pressable>

          <Pressable
            onPress={() => { setEditName(user?.name ?? ""); setEditEmail(user?.email ?? ""); setShowProfileEdit(true); }}
            style={[styles.iconBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}
            hitSlop={8}
          >
            <Text style={styles.iconBtnEmoji}>👤</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <GlassCard style={styles.greetCard} padding={16}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {getGreeting()}, {userName} 👋
            </Text>
            <Text style={[styles.greetTitle, { color: colors.foreground }]}>
              Where are you heading?
            </Text>
          </GlassCard>
        </Animated.View>
      </View>

      <Modal visible={showProfileEdit} transparent animationType="slide" onRequestClose={() => setShowProfileEdit(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <Text style={{ fontSize: 22 }}>👤</Text>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Profile Update</Text>
                </View>
                <Pressable onPress={() => setShowProfileEdit(false)} style={styles.closeBtn}>
                  <Text style={[styles.closeEmoji, { color: colors.mutedForeground }]}>✕</Text>
                </Pressable>
              </View>

              <View style={[styles.profileAvatarLarge, { backgroundColor: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.3)" }]}>
                <Text style={{ fontSize: 36 }}>👤</Text>
              </View>
              <Text style={[styles.profilePhoneLabel, { color: colors.mutedForeground }]}>
                📱 {user?.phone ?? "—"}
              </Text>

              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Naam</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Apna naam likho"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Email (optional)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Email address"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Pressable
                onPress={handleSaveProfile}
                disabled={savingProfile}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>✅ Save Karo</Text>
                )}
              </Pressable>
              <Pressable onPress={logout} style={styles.logoutBtn}>
                <Text style={{ fontSize: 14 }}>🚪</Text>
                <Text style={[styles.logoutText, { color: colors.destructive }]}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPickupEdit} transparent animationType="slide" onRequestClose={() => setShowPickupEdit(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <Text style={{ fontSize: 20 }}>📍</Text>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Pickup Location</Text>
                </View>
                <Pressable onPress={() => setShowPickupEdit(false)} style={styles.closeBtn}>
                  <Text style={[styles.closeEmoji, { color: colors.mutedForeground }]}>✕</Text>
                </Pressable>
              </View>

              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Apna pickup address type karo</Text>
              <TextInput
                style={[styles.modalInput, styles.pickupInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={editPickup}
                onChangeText={setEditPickup}
                placeholder="e.g. Connaught Place, New Delhi"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={2}
                autoFocus
              />

              <Pressable
                onPress={handleGpsPickup}
                disabled={gpsLoading}
                style={[styles.gpsBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                {gpsLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Text style={{ fontSize: 16 }}>📡</Text>
                    <Text style={[styles.gpsBtnText, { color: colors.foreground }]}>GPS se current location use karo</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={handleSavePickup}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.modalSaveBtnText}>📍 Set Pickup</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
        <GlassCard style={styles.bottomCard} padding={0}>
          <View style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={styles.searchEmoji}>🔍</Text>
              <TextInput
                placeholder="Search destination..."
                placeholderTextColor={colors.mutedForeground}
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={() => {
                  if (inputValue.trim()) handleDestinationSelect(inputValue.trim());
                }}
                returnKeyType="go"
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {inputValue.length > 0 && (
                <Pressable onPress={() => setInputValue("")} style={styles.clearBtn}>
                  <Text style={[styles.clearEmoji, { color: colors.mutedForeground }]}>✕</Text>
                </Pressable>
              )}
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.suggestionsScroll}
            contentContainerStyle={styles.suggestionsContent}
          >
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              Quick Select
            </Text>
            {SUGGESTIONS.map((s) => (
              <SuggestionChip
                key={s.label}
                {...s}
                onPress={() => handleDestinationSelect(`${s.label} — ${s.sub}`)}
              />
            ))}

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              Recent Rides
            </Text>
            {["DLF Cyber Hub", "Lajpat Nagar Market", "Hauz Khas Village"].map((place) => (
              <Pressable
                key={place}
                onPress={() => handleDestinationSelect(place)}
                style={[styles.recentItem, { borderColor: colors.border }]}
              >
                <View style={[styles.recentIcon, { backgroundColor: colors.muted }]}>
                  <Text style={styles.recentClockEmoji}>🕐</Text>
                </View>
                <Text style={[styles.recentLabel, { color: colors.foreground }]}>{place}</Text>
                <Text style={[styles.chevronEmoji, { color: colors.mutedForeground }]}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        </GlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 10,
    zIndex: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(22,22,30,0.85)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  locationText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flex: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconBtnEmoji: {
    fontSize: 16,
    lineHeight: 20,
  },
  greetCard: {
    borderRadius: 20,
  },
  greeting: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginBottom: 2,
  },
  greetTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  closeBtn: { padding: 4 },
  closeEmoji: { fontSize: 18, lineHeight: 22 },
  profileAvatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    marginBottom: 4,
  },
  profilePhoneLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 4,
  },
  modalLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: -4,
  },
  modalInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  pickupInput: {
    minHeight: 56,
    textAlignVertical: "top",
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gpsBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    flex: 1,
  },
  modalSaveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  modalSaveBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#000",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  logoutText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    zIndex: 10,
  },
  bottomCard: {
    borderRadius: 24,
    backgroundColor: "rgba(22,22,30,0.97)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  searchContainer: { padding: 16, paddingBottom: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchEmoji: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  clearBtn: { padding: 4 },
  clearEmoji: { fontSize: 15, lineHeight: 20 },
  suggestionsScroll: { maxHeight: 280 },
  suggestionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  sectionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionEmoji: { fontSize: 17 },
  suggestionText: { flex: 1 },
  suggestionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  suggestionSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  recentClockEmoji: { fontSize: 14 },
  recentLabel: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  chevronEmoji: { fontSize: 22, lineHeight: 26, fontWeight: "300" },
});
