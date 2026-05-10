import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  Alert,
  Image,
  Linking,
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
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { VoiceBookingOverlay } from "@/components/VoiceBookingOverlay";
import { API_BASE } from "@/lib/api";

function getGreeting(t: (k: any) => string, hour: number) {
  if (hour < 12) return t("good_morning");
  if (hour < 17) return t("good_afternoon");
  if (hour < 20) return t("good_evening");
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
  const router = useRouter();
  const { setScreen, setDestination, setDropCoords, setPickupCoords, pickupCoords, currentLocationAddress, setCurrentLocationAddress, setPickup, rideHistory, setEstimatedDistanceKm, setEstimatedTime, setIsDistanceLoading, setGpsCoords } = useApp();
  const { user, token, logout, updateUser } = useAuth();
  const { lang, toggleLanguage, t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const userName = user?.name ?? "Aarav";

  const SUGGESTIONS = [
    { label: t("suggestion_office"), sub: t("suggestion_office_sub"), icon: "💼" },
    { label: t("suggestion_home"), sub: t("suggestion_home_sub"), icon: "🏠" },
    { label: t("suggestion_airport"), sub: t("suggestion_airport_sub"), icon: "✈️" },
  ];
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => {
      setCurrentHour(new Date().getHours());
      intervalId = setInterval(() => setCurrentHour(new Date().getHours()), 60000);
    }, msUntilNextMinute);
    /* Clean up both the initial timeout AND the interval if it was started */
    return () => {
      clearTimeout(timeout);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, []);

  const [inputValue, setInputValue] = useState("");
  const [locating, setLocating] = useState(false);

  const locationPermGranted = useRef<boolean | null>(null);
  /* Stores the user's last known raw GPS position — used as geocoding bias */
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);

  /* On mount: request location permission and auto-set pickup from GPS */
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          /* Request permission on first open */
          const result = await Location.requestForegroundPermissionsAsync();
          status = result.status;
        }
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          gpsRef.current = gps;
          setPickupCoords(gps);
          setGpsCoords(gps); /* Store raw GPS in AppContext for GPS-priority distance calc */
          const [geo] = await Location.reverseGeocodeAsync({ latitude: gps.lat, longitude: gps.lng });
          if (geo) {
            const parts = [geo.name, geo.street, geo.subregion ?? geo.district, geo.city].filter(Boolean);
            const addr = parts.slice(0, 3).join(", ") || "Current Location";
            setCurrentLocationAddress(addr);
            setPickup(addr);
          }
        }
      } catch { /* location unavailable — user enters manually */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ensureLocationPermission = useCallback(async (): Promise<boolean> => {
    if (locationPermGranted.current === true) return true;
    const { status: existing } = await Location.getForegroundPermissionsAsync();
    if (existing === "granted") {
      locationPermGranted.current = true;
      return true;
    }
    if (locationPermGranted.current === false) return false;
    const { status } = await Location.requestForegroundPermissionsAsync();
    locationPermGranted.current = status === "granted";
    return locationPermGranted.current;
  }, []);

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editEmail, setEditEmail] = useState(user?.email ?? "");
  const [editPhoto, setEditPhoto] = useState<string | null>(user?.photoUrl ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      "🗑️ Account Delete Karo",
      "Kya aap sure hain? Yeh action undo nahi ho sakta. Aapka sara data permanently delete ho jayega.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Haan, Delete Karo",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const res = await fetch(`${API_BASE}/auth/account`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await res.json();
              if (data.success) {
                setShowProfileEdit(false);
                logout();
              } else {
                Alert.alert("Error", data.message ?? "Account delete nahi hua");
              }
            } catch {
              Alert.alert("Error", "Network error — dobara try karo");
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const [showPickupEdit, setShowPickupEdit] = useState(false);
  const [editPickup, setEditPickup] = useState(currentLocationAddress);

  const [toast, setToast] = useState<{ show: boolean; title: string; subtitle: string; type: "success" | "error" }>({
    show: false, title: "", subtitle: "", type: "success",
  });
  const showToast = (title: string, subtitle: string, type: "success" | "error" = "success") => {
    setToast({ show: true, title, subtitle, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  };


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

  

  /* India bounding box — reject any coordinates outside this range */
  const INDIA_LAT_MIN = 6.0, INDIA_LAT_MAX = 37.6;
  const INDIA_LNG_MIN = 67.0, INDIA_LNG_MAX = 98.0;
  const isInIndia = (lat: number, lng: number) =>
    lat >= INDIA_LAT_MIN && lat <= INDIA_LAT_MAX &&
    lng >= INDIA_LNG_MIN && lng <= INDIA_LNG_MAX;

  /* Straight-line distance in km (Haversine) */
  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /* Nominatim (OpenStreetMap) fallback — free, no API key, India-restricted + location bias */
  const geocodeViaNominatim = (
    address: string,
    onResult: (lat: number, lng: number) => void,
    bias?: { lat: number; lng: number },
  ) => {
    const q = encodeURIComponent(address + ", India");
    /* viewbox gives a soft location bias — bounded=0 means results outside box still returned if nothing inside */
    const biasParam = bias
      ? `&viewbox=${bias.lng - 1},${bias.lat + 1},${bias.lng + 1},${bias.lat - 1}&bounded=0`
      : "";
    fetch(`https://nominatim.openstreetmap.org/search?q=${q}&countrycodes=in&format=json&limit=5${biasParam}`, {
      headers: { "Accept-Language": "en", "User-Agent": "RaftaarRide/1.0 (raftaarride.app)" },
    })
      .then(r => r.json())
      .then((results: Array<{ lat: string; lon: string }>) => {
        if (!results?.length) return;
        /* If bias given, prefer the result closest to bias point */
        let best = results[0];
        if (bias && results.length > 1) {
          let minDist = Infinity;
          for (const r of results) {
            const d = haversineKm(bias.lat, bias.lng, parseFloat(r.lat), parseFloat(r.lon));
            if (d < minDist) { minDist = d; best = r; }
          }
        }
        const lat = parseFloat(best.lat);
        const lng = parseFloat(best.lon);
        if (isInIndia(lat, lng)) onResult(lat, lng);
      })
      .catch(() => {});
  };

  const geocodeAddress = (
    address: string,
    onResult: (lat: number, lng: number) => void,
    bias?: { lat: number; lng: number },
  ) => {
    const q = encodeURIComponent(address);
    /* Server-side proxy — Maps key never sent to client */
    const biasParams = bias ? `&lat=${bias.lat}&lng=${bias.lng}` : "";
    fetch(`${API_BASE}/maps/geocode?q=${q}${biasParams}`)
      .then(r => r.json())
      .then((data: { results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }> }) => {
        if (!data?.results?.length) { geocodeViaNominatim(address, onResult, bias); return; }
        /* If bias given, pick the Google result closest to it (not always index 0) */
        let best = data.results[0].geometry?.location;
        if (bias && data.results.length > 1) {
          let minDist = Infinity;
          for (const r of data.results) {
            const loc = r.geometry?.location;
            if (!loc) continue;
            const d = haversineKm(bias.lat, bias.lng, loc.lat, loc.lng);
            if (d < minDist) { minDist = d; best = loc; }
          }
        }
        if (best?.lat && best?.lng && isInIndia(best.lat, best.lng)) {
          onResult(best.lat, best.lng);
        } else {
          geocodeViaNominatim(address, onResult, bias);
        }
      })
      .catch(() => geocodeViaNominatim(address, onResult, bias));
  };

  const handleSavePickup = () => {
    const val = editPickup.trim();
    if (!val) { Alert.alert("Error", "Pickup location khali nahi ho sakta"); return; }
    setCurrentLocationAddress(val);
    setPickup(val);
    setShowPickupEdit(false);
    /* Geocode the manually-entered pickup — bias toward last GPS fix if available.
     * GPS-priority: if user's GPS is within 2 km of the geocoded result, use GPS
     * coordinates instead of the geocoded address center — same logic Rapido uses. */
    geocodeAddress(val, (lat, lng) => {
      const gps = gpsRef.current;
      if (gps) {
        const R = 6371;
        const dLat = (lat - gps.lat) * (Math.PI / 180);
        const dLng = (lng - gps.lng) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(gps.lat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) *
          Math.sin(dLng / 2) ** 2;
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (distKm < 2.0) {
          /* User is physically at/near the typed address — use GPS for accuracy */
          setPickupCoords(gps);
          return;
        }
      }
      setPickupCoords({ lat, lng });
    }, gpsRef.current ?? undefined);
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
      /* Always ask for permission — handles first-time and previously-denied cases */
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      let permStatus = existing;
      if (existing !== "granted") {
        const result = await Location.requestForegroundPermissionsAsync();
        permStatus = result.status;
      }
      if (permStatus !== "granted") {
        /* Guide user to settings if permission denied */
        Alert.alert(
          "Location Permission Chahiye 📍",
          "Sahi pickup ke liye RaftaarRide ko aapki location access chahiye.\n\nPhone Settings mein jaake Location ko 'Allow' karein.",
          [
            { text: "Settings Kholein", onPress: () => Linking.openSettings() },
            { text: "Baad Mein", style: "cancel" },
          ]
        );
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      gpsRef.current = gps;
      setPickupCoords(gps);
      setGpsCoords(gps); /* Keep AppContext GPS in sync for GPS-priority distance calc */
      const [geo] = await Location.reverseGeocodeAsync({ latitude: gps.lat, longitude: gps.lng });
      if (geo) {
        const parts = [geo.name, geo.street, geo.subregion ?? geo.district, geo.city].filter(Boolean);
        const addr = parts.slice(0, 3).join(", ") || "Current Location";
        setCurrentLocationAddress(addr);
        setPickup(addr);
      }
    } catch {
      Alert.alert("Location Error", "GPS se location nahi mili. Phone ki location service on hai? Dobara try karein.");
    }
    setLocating(false);
  };

  /* Maximum straight-line distance (km) — 200km covers inter-city rides like Badka→Haridwar */
  const MAX_RIDE_KM = 200;

  const handleDestinationSelect = (dest: string) => {
    setDestination(dest);
    /* Reset previous distance so BookingScreen never shows stale old distance */
    setEstimatedDistanceKm(null);
    setDropCoords(null);
    /* Show distance spinner immediately */
    setIsDistanceLoading(true);

    /* Use current pickup coords (or last GPS fix) as bias so ambiguous names like
       "Barka" resolve to the locality closest to the user, not a random Indian town */
    const bias = pickupCoords ?? gpsRef.current ?? undefined;

    /* Geocode drop address with location bias */
    geocodeAddress(dest, (dropLat, dropLng) => {
      /* Distance sanity check — warn user if destination is suspiciously far */
      if (bias) {
        const straightLine = haversineKm(bias.lat, bias.lng, dropLat, dropLng);
        if (straightLine > MAX_RIDE_KM) {
          Alert.alert(
            "Door Destination 🚗",
            `"${dest}" aapke pickup se ~${Math.round(straightLine)} km door lag raha hai.\n\nKya yahi sahi destination hai?`,
            [
              {
                text: "Haan, sahi destination hai",
                onPress: () => setDropCoords({ lat: dropLat, lng: dropLng }),
              },
              {
                text: "Destination badlo",
                style: "cancel",
                onPress: () => {
                  setDropCoords(null);
                  setIsDistanceLoading(false);
                  setScreen("home");
                },
              },
            ],
          );
          return;
        }
      }
      setDropCoords({ lat: dropLat, lng: dropLng });
    }, bias);

    /* Ensure pickupCoords is set — needed for AppContext distance calculation to fire.
       If GPS ref available but state not yet updated, use it directly (faster than geocoding).
       If neither, geocode the current address. */
    if (!pickupCoords) {
      if (gpsRef.current) {
        setPickupCoords(gpsRef.current);
      } else {
        geocodeAddress(currentLocationAddress, (lat, lng) => setPickupCoords({ lat, lng }));
      }
    }
    setScreen("booking");
  };

  /* Voice booking overlay state */
  const [voiceOverlay, setVoiceOverlay] = useState<{ rawText: string; destination: string; parsing: boolean } | null>(null);

  const { state: voiceState, toggle: toggleVoice } = useVoiceInput(async (text) => {
    if (text === "__script_error__") {
      showToast("Hindi mein bolein", "Urdu script detect hui — phir se Hindi mein bolne ki koshish karein", "error");
      return;
    }
    if (!text.trim()) return;

    /* Show overlay immediately with parsing=true, then fetch clean destination */
    setVoiceOverlay({ rawText: text.trim(), destination: "", parsing: true });

    try {
      const res = await fetch(`${API_BASE}/voice/parse-destination`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json() as { destination?: string };
      const dest = data.destination?.trim() || text.trim();
      setVoiceOverlay({ rawText: text.trim(), destination: dest, parsing: false });
    } catch {
      /* Network error — use raw text as destination */
      setVoiceOverlay({ rawText: text.trim(), destination: text.trim(), parsing: false });
    }
  });

  const handleMicPress = useCallback(async () => {
    await toggleVoice();
  }, [voiceState, toggleVoice]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Map fills entire screen as background */}
      <View style={StyleSheet.absoluteFillObject}>
        <MapView />
      </View>

      {/* Single full-screen flex column — top content + transparent spacer + bottom content */}
      <View style={styles.overlayLayout} pointerEvents="box-none">
        <View style={[styles.topSection, { paddingTop: topPad + 8 }]} pointerEvents="box-none">
        <Animated.View entering={FadeInDown.springify()} style={styles.topBar}>
          <Pressable style={[styles.locationRow, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={handleLocateMe}>
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
            onPress={() => setScreen("profile")}
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

        <GlassCard style={styles.greetCard} padding={10}>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {getGreeting(t, currentHour)}, {userName} 👋
          </Text>
          <Text style={[styles.greetTitle, { color: colors.foreground }]}>
            {t("where_going")}
          </Text>
        </GlassCard>
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
              <Pressable
                onPress={() => { setShowProfileEdit(false); setTimeout(() => router.push("/auth/forgot-password"), 200); }}
                style={[styles.actionLinkBtn, { borderColor: colors.border }]}
              >
                <Text style={{ fontSize: 14 }}>🔑</Text>
                <Text style={[styles.actionLinkText, { color: colors.foreground }]}>Password Change Karo</Text>
              </Pressable>

              <Pressable onPress={logout} style={styles.logoutBtn}>
                <Text style={{ fontSize: 14 }}>🚪</Text>
                <Text style={[styles.logoutText, { color: colors.destructive }]}>{t("logout")}</Text>
              </Pressable>

              <Pressable
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
                style={[styles.deleteBtn, { borderColor: "rgba(255,77,77,0.3)" }]}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#FF4D4D" />
                ) : (
                  <>
                    <Text style={{ fontSize: 14 }}>🗑️</Text>
                    <Text style={[styles.actionLinkText, { color: colors.destructive }]}>Account Delete Karo</Text>
                  </>
                )}
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
                onPress={handleSavePickup}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.modalSaveBtnText}>{t("set_pickup")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
        </Modal>

        {/* Transparent spacer — map visible and touchable in this region */}
        <View style={{ flex: 1 }} pointerEvents="none" />

        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
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
              {inputValue.length > 0 ? (
                <Pressable onPress={() => setInputValue("")} style={styles.clearBtn}>
                  <Text style={[styles.clearEmoji, { color: colors.mutedForeground }]}>✕</Text>
                </Pressable>
              ) : (
                <View style={styles.micBtn}>
                  <VoiceMicButton state={voiceState} onToggle={handleMicPress} size={32} />
                </View>
              )}
            </View>
          </View>

          {/* Location chip — visible button so user can tap to get GPS pickup */}
          <Pressable
            onPress={handleLocateMe}
            style={[styles.locationChip, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "44" }]}
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={{ fontSize: 15 }}>📍</Text>
            )}
            <Text style={[styles.locationChipText, { color: colors.primary }]}>
              {locating ? "Location dhundh raha hai…" : "Current Location Set Karo"}
            </Text>
          </Pressable>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.suggestionsScroll}
            contentContainerStyle={styles.suggestionsContent}
          >
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              SERVICES
            </Text>
            <Pressable
              onPress={() => setScreen("package_booking")}
              style={[styles.packageBanner, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "55" }]}
            >
              <Text style={{ fontSize: 30 }}>📦</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.packageBannerTitle, { color: colors.foreground }]}>Package Delivery</Text>
                <Text style={[styles.packageBannerSub, { color: colors.mutedForeground }]}>Bike se fast parcel delivery — ₹40 se shuru</Text>
              </View>
              <Text style={{ color: colors.primary, fontSize: 20 }}>›</Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 4 }]}>
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
            {(() => {
              const recentDests = Array.from(
                new Map(
                  rideHistory
                    .filter(r => r.status === "completed" && r.destination)
                    .map(r => [r.destination, r])
                ).values()
              ).slice(0, 3);
              const fallbacks = [t("recent_dlf"), t("recent_lajpat"), t("recent_hauz")];
              const items = recentDests.length > 0
                ? recentDests.map(r => r.destination)
                : fallbacks;
              return items.map((place) => (
                <Pressable
                  key={place}
                  onPress={() => handleDestinationSelect(place)}
                  style={[styles.recentItem, { borderColor: colors.border }]}
                >
                  <View style={[styles.recentIcon, { backgroundColor: colors.muted }]}>
                    <Text style={styles.recentClockEmoji}>{recentDests.length > 0 ? "🕐" : "📍"}</Text>
                  </View>
                  <Text style={[styles.recentLabel, { color: colors.foreground }]}>{place}</Text>
                  <Text style={[styles.chevronEmoji, { color: colors.mutedForeground }]}>›</Text>
                </Pressable>
              ));
            })()}

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              HELP & SUPPORT
            </Text>
            <View style={[styles.supportCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.supportTitle, { color: colors.foreground }]}>🎧 Madad chahiye?</Text>
              <Text style={[styles.supportSub, { color: colors.mutedForeground }]}>
                Koi problem? Hum yahan hain — WhatsApp ya email karein
              </Text>
              <View style={styles.supportBtns}>
                <Pressable
                  onPress={() => Linking.openURL("https://wa.me/919999999999?text=RaftaarRide%20Support%20chahiye")}
                  style={[styles.supportBtn, { backgroundColor: "#25D366" }]}
                >
                  <Text style={styles.supportBtnText}>💬 WhatsApp</Text>
                </Pressable>
                <Pressable
                  onPress={() => Linking.openURL("mailto:support@raftaarride.com")}
                  style={[styles.supportBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.supportBtnText}>📧 Email</Text>
                </Pressable>
              </View>
              <Text style={[styles.supportHours, { color: colors.mutedForeground }]}>
                🕐 9 AM – 9 PM, Mon–Sat
              </Text>
            </View>
            <View style={{ height: 12 }} />
          </ScrollView>
        </GlassCard>
        </View>
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

      {/* ── Voice Booking Overlay ─────────────────────────────────────────── */}
      {voiceOverlay && (
        <VoiceBookingOverlay
          rawText={voiceOverlay.rawText}
          destination={voiceOverlay.destination}
          parsing={voiceOverlay.parsing}
          onConfirm={() => {
            const dest = voiceOverlay.destination;
            setVoiceOverlay(null);
            if (dest) handleDestinationSelect(dest);
          }}
          onCancel={() => setVoiceOverlay(null)}
        />
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
  overlayLayout: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "column",
  },
  topSection: {
    paddingHorizontal: 16,
    gap: 10,
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
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
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
    borderRadius: 16,
  },
  greeting: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 1,
  },
  greetTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
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
  actionLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 2,
  },
  actionLinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
  },
  bottomSection: {
    padding: 16,
  },
  bottomCard: {
    borderRadius: 24,
  },
  locationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  locationChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flex: 1,
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
  micBtn: { padding: 2 },
  suggestionsScroll: { maxHeight: 380 },
  suggestionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  packageBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  packageBannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    marginBottom: 2,
  },
  packageBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
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
  supportCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  supportTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  supportSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  supportBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  supportBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  supportBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  supportHours: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
});
