import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
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
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { MapView } from "@/components/MapView";
import { GlassCard } from "@/components/GlassCard";

function getGreeting(t: (k: any) => string) {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return t("good_morning");
  if (hour >= 12 && hour < 17) return t("good_afternoon");
  if (hour >= 17 && hour < 21) return t("good_evening");
  return t("good_night");
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
  const { lang, toggleLanguage, t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const userName = user?.name ?? "Aarav";

  const SUGGESTIONS = [
    { label: t("suggestion_office"), sub: t("suggestion_office_sub"), icon: "💼" },
    { label: t("suggestion_home"), sub: t("suggestion_home_sub"), icon: "🏠" },
    { label: t("suggestion_airport"), sub: t("suggestion_airport_sub"), icon: "✈️" },
  ];
  const [inputValue, setInputValue] = useState("");
  const [locating, setLocating] = useState(false);

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editEmail, setEditEmail] = useState(user?.email ?? "");
  const [editPhoto, setEditPhoto] = useState<string | null>(user?.photoUrl ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [showPickupEdit, setShowPickupEdit] = useState(false);
  const [editPickup, setEditPickup] = useState(currentLocationAddress);
  const [gpsLoading, setGpsLoading] = useState(false);

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
    if (pickingPhoto) return;
    setPickingPhoto(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission chahiye", "Gallery access allow karo settings mein");
        setPickingPhoto(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const dataUri = `data:image/jpeg;base64,${asset.base64}`;
          if (dataUri.length > 500 * 1024) {
            Alert.alert("Photo bahut badi hai", "Choti photo select karo (max 500KB)");
          } else {
            setEditPhoto(dataUri);
          }
        }
      }
    } catch { Alert.alert("Error", "Photo pick nahi ho payi"); }
    setPickingPhoto(false);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { setProfileError("Naam khali nahi ho sakta ✍️"); return; }
    setProfileError("");
    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName.trim(), email: editEmail.trim() || undefined, photoUrl: editPhoto }),
      });
      const data = await res.json();
      if (data.success) {
        updateUser({ ...user!, name: data.user.name, email: data.user.email, photoUrl: data.user.photoUrl });
        setShowProfileEdit(false);
        showToast("Profile Update Ho Gayi! 🎉", `${data.user.name} — ab aap bilkul ready hain!`, "success");
      } else {
        setProfileError(data.error ?? "Update nahi ho payi, dobara try karo");
      }
    } catch { setProfileError("Network error — internet check karo 🔄"); }
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
            onPress={toggleLanguage}
            style={[styles.iconBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "66" }]}
            hitSlop={8}
          >
            <Text style={[styles.iconBtnEmoji, { color: colors.primary, fontWeight: "700" }]}>
              {lang === "hi" ? "हिं" : "EN"}
            </Text>
          </Pressable>

          <Pressable
            onPress={toggleTheme}
            style={[styles.iconBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            hitSlop={8}
          >
            <Text style={styles.iconBtnEmoji}>{isDark ? "☀️" : "🌙"}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setEditName(user?.name ?? "");
              setEditEmail(user?.email ?? "");
              setEditPhoto(user?.photoUrl ?? null);
              setShowProfileEdit(true);
            }}
            style={[styles.profileTopBtn, { borderColor: colors.primary + "55" }]}
            hitSlop={8}
          >
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={styles.profileTopBtnImg} />
            ) : (
              <Text style={styles.iconBtnEmoji}>👤</Text>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <GlassCard style={styles.greetCard} padding={16}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {getGreeting(t)}, {userName} 👋
            </Text>
            <Text style={[styles.greetTitle, { color: colors.foreground }]}>
              {t("where_going")}
            </Text>
          </GlassCard>
        </Animated.View>
      </View>

      <Modal visible={showProfileEdit} transparent animationType="slide" onRequestClose={() => { setShowProfileEdit(false); setProfileError(""); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <Text style={{ fontSize: 22 }}>👤</Text>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("profile_update")}</Text>
                </View>
                <Pressable onPress={() => { setShowProfileEdit(false); setProfileError(""); }} style={styles.closeBtn}>
                  <Text style={[styles.closeEmoji, { color: colors.mutedForeground }]}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.photoPickerWrapper}>
                <Pressable onPress={handlePickPhoto} disabled={pickingPhoto} style={styles.photoPickerBtn}>
                  {editPhoto ? (
                    <Image source={{ uri: editPhoto }} style={styles.profileAvatarPhoto} />
                  ) : (
                    <View style={[styles.profileAvatarLarge, { backgroundColor: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.3)" }]}>
                      <Text style={{ fontSize: 36 }}>👤</Text>
                    </View>
                  )}
                  <View style={[styles.cameraOverlay, { backgroundColor: colors.primary }]}>
                    {pickingPhoto ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={{ fontSize: 14 }}>📷</Text>
                    )}
                  </View>
                </Pressable>
                {editPhoto && (
                  <Pressable onPress={() => setEditPhoto(null)} style={styles.removePhotoBtn}>
                    <Text style={[{ fontSize: 11, color: colors.destructive, fontFamily: "Inter_500Medium" }]}>{t("remove")}</Text>
                  </Pressable>
                )}
              </View>
              <Text style={[styles.profilePhoneLabel, { color: colors.mutedForeground }]}>
                📱 {user?.phone ?? "—"}
              </Text>

              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t("name_label")}</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder={t("name_placeholder")}
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t("email_optional")}</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Email address"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {profileError ? (
                <View style={styles.profileErrorBox}>
                  <Text style={{ fontSize: 14, lineHeight: 18 }}>⚠️</Text>
                  <Text style={styles.profileErrorText}>{profileError}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={handleSaveProfile}
                disabled={savingProfile}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>✅ {t("save")}</Text>
                )}
              </Pressable>
              <Pressable onPress={logout} style={styles.logoutBtn}>
                <Text style={{ fontSize: 14 }}>🚪</Text>
                <Text style={[styles.logoutText, { color: colors.destructive }]}>{t("logout")}</Text>
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
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("pickup_location")}</Text>
                </View>
                <Pressable onPress={() => setShowPickupEdit(false)} style={styles.closeBtn}>
                  <Text style={[styles.closeEmoji, { color: colors.mutedForeground }]}>✕</Text>
                </Pressable>
              </View>

              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t("enter_address")}</Text>
              <TextInput
                style={[styles.modalInput, styles.pickupInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={editPickup}
                onChangeText={setEditPickup}
                placeholder={t("pickup_placeholder")}
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
                    <Text style={[styles.gpsBtnText, { color: colors.foreground }]}>{t("gps_label")}</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={handleSavePickup}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.modalSaveBtnText}>{t("set_pickup")}</Text>
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
                placeholder={t("search_dest")}
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
              {t("quick_select").toUpperCase()}
            </Text>
            {SUGGESTIONS.map((s) => (
              <SuggestionChip
                key={s.label}
                {...s}
                onPress={() => handleDestinationSelect(`${s.label} — ${s.sub}`)}
              />
            ))}

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              {t("recent_rides").toUpperCase()}
            </Text>
            {[t("recent_dlf"), t("recent_lajpat"), t("recent_hauz")].map((place) => (
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  profileErrorBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,77,77,0.1)", borderRadius: 10, padding: 10, gap: 8,
    borderWidth: 1, borderColor: "rgba(255,77,77,0.3)",
  },
  profileErrorText: { color: "#FF4D4D", fontSize: 12, flex: 1 },
  toastEmoji: { fontSize: 26 },
  toastTextWrap: { flex: 1 },
  toastTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 2,
  },
  toastSubtitle: {
    color: "#B0B0C0",
    fontSize: 12,
    lineHeight: 17,
  },
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
  profileTopBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: "rgba(245,166,35,0.15)",
  },
  profileTopBtnImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  photoPickerWrapper: {
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  photoPickerBtn: {
    position: "relative",
    width: 80,
    height: 80,
  },
  profileAvatarPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.3)",
  },
  removePhotoBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
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
