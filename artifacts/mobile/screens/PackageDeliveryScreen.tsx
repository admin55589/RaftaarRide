import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { API_BASE as BASE_URL } from "@/lib/api";

const WEIGHT_OPTIONS = [
  { key: "small",  label: "Small",  sub: "< 1 kg",   icon: "📄", desc: "Documents, letters",       base: 40,  perKm: 8  },
  { key: "medium", label: "Medium", sub: "1–5 kg",   icon: "📦", desc: "Clothes, books, gifts",     base: 70,  perKm: 12 },
  { key: "large",  label: "Large",  sub: "5–15 kg",  icon: "🗃️", desc: "Electronics, shoe box",     base: 100, perKm: 18 },
  { key: "heavy",  label: "Heavy",  sub: "> 15 kg",  icon: "🏋️", desc: "Appliances, furniture",     base: 180, perKm: 25 },
] as const;

type WeightKey = typeof WEIGHT_OPTIONS[number]["key"];

export function PackageDeliveryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setScreen, pickup, pickupCoords, dropCoords, estimatedDistanceKm, setCurrentRideId, destination, userName } = useApp();
  const { token } = useAuth();

  const [receiverName, setReceiverName]     = useState("");
  const [receiverPhone, setReceiverPhone]   = useState("");
  const [itemDesc, setItemDesc]             = useState("");
  const [selectedWeight, setSelectedWeight] = useState<WeightKey>("small");
  const [payMethod, setPayMethod]           = useState<"Cash" | "RaftaarWallet">("Cash");
  const [loading, setLoading]               = useState(false);

  const wCfg   = WEIGHT_OPTIONS.find(w => w.key === selectedWeight)!;
  const distKm = (estimatedDistanceKm ?? 0) > 0 ? estimatedDistanceKm! : 5;
  const rideFare     = Math.round(wCfg.base + wCfg.perKm * distKm);
  const platformFee  = 4;
  const totalFare    = rideFare + platformFee;

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const handleBook = async () => {
    if (!receiverName.trim()) { Alert.alert("Receiver ka naam chahiye"); return; }
    if (!/^\d{10}$/.test(receiverPhone.trim())) { Alert.alert("10-digit receiver phone number daalo"); return; }
    if (!dropCoords) { Alert.alert("Pehle HomeScreen se delivery location select karo"); return; }

    setLoading(true);
    try {
      const body = {
        pickup: pickupCoords
          ? { lat: pickupCoords.lat, lng: pickupCoords.lng, address: pickup }
          : pickup,
        drop: { lat: dropCoords.lat, lng: dropCoords.lng, address: destination || "Delivery Location" },
        vehicleType: "bike",
        rideMode: "package",
        price: totalFare,
        distanceKm: distKm,
        paymentMethod: payMethod,
        senderName: userName || "Sender",
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        itemWeight: selectedWeight,
        packageDetails: JSON.stringify({
          senderName: userName || "Sender",
          receiverName: receiverName.trim(),
          receiverPhone: receiverPhone.trim(),
          itemWeight: selectedWeight,
          weightLabel: wCfg.label,
          itemDesc: itemDesc.trim(),
        }),
      };

      const res = await fetch(`${BASE_URL}/rides`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ride?.id) {
        setCurrentRideId(data.ride.id);
        setScreen("searching");
      } else {
        Alert.alert("Booking Failed", data.error ?? data.message ?? "Dobara try karo");
      }
    } catch (err: any) {
      Alert.alert("Network Error", err.message ?? "Connection check karo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[st.container, { backgroundColor: colors.background }]}>

        {/* Header */}
        <View style={[st.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setScreen("home")} style={st.backBtn} hitSlop={12}>
            <Text style={{ fontSize: 22, color: colors.foreground }}>←</Text>
          </Pressable>
          <View>
            <Text style={[st.headerTitle, { color: colors.foreground }]}>📦 Package Delivery</Text>
            <Text style={[st.headerSub, { color: colors.mutedForeground }]}>Bike se fast delivery</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Route Card */}
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <GlassCard style={st.card}>
              <Text style={[st.sectionTitle, { color: colors.foreground }]}>📍 Route</Text>
              <View style={st.routeRow}>
                <View style={[st.routeDot, { backgroundColor: "#22c55e" }]} />
                <Text style={[st.routeText, { color: colors.foreground }]} numberOfLines={1}>{pickup || "Current Location"}</Text>
              </View>
              <View style={st.routeLine} />
              <View style={st.routeRow}>
                <View style={[st.routeDot, { backgroundColor: "#ef4444" }]} />
                <Text style={[st.routeText, { color: colors.mutedForeground }]} numberOfLines={1}>{destination || "Delivery address (HomeScreen se select karo)"}</Text>
              </View>
              <Text style={[st.distanceTag, { color: colors.primary, borderColor: colors.primary + "44", backgroundColor: colors.primary + "12" }]}>
                📏 {distKm.toFixed(1)} km  •  🏍️ Bike Delivery
              </Text>
            </GlassCard>
          </Animated.View>

          {/* Weight Category */}
          <Animated.View entering={FadeInDown.delay(120).springify()}>
            <GlassCard style={st.card}>
              <Text style={[st.sectionTitle, { color: colors.foreground }]}>⚖️ Package Size</Text>
              <View style={st.weightGrid}>
                {WEIGHT_OPTIONS.map((w) => {
                  const active = selectedWeight === w.key;
                  return (
                    <Pressable
                      key={w.key}
                      onPress={() => setSelectedWeight(w.key)}
                      style={[
                        st.weightCard,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary + "18" : colors.secondary,
                        },
                      ]}
                    >
                      <Text style={st.weightIcon}>{w.icon}</Text>
                      <Text style={[st.weightLabel, { color: active ? colors.primary : colors.foreground }]}>{w.label}</Text>
                      <Text style={[st.weightSub, { color: colors.mutedForeground }]}>{w.sub}</Text>
                      <Text style={[st.weightDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{w.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </GlassCard>
          </Animated.View>

          {/* Receiver Details */}
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <GlassCard style={st.card}>
              <Text style={[st.sectionTitle, { color: colors.foreground }]}>👤 Receiver Details</Text>
              <Text style={[st.inputLabel, { color: colors.mutedForeground }]}>Receiver ka naam *</Text>
              <TextInput
                style={[st.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={receiverName}
                onChangeText={setReceiverName}
                placeholder="Poora naam"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
              />
              <Text style={[st.inputLabel, { color: colors.mutedForeground }]}>Receiver ka phone *</Text>
              <TextInput
                style={[st.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={receiverPhone}
                onChangeText={setReceiverPhone}
                placeholder="10-digit number"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                maxLength={10}
              />
              <Text style={[st.inputLabel, { color: colors.mutedForeground }]}>Item description (optional)</Text>
              <TextInput
                style={[st.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                value={itemDesc}
                onChangeText={setItemDesc}
                placeholder="Kya bhej rahe ho?"
                placeholderTextColor={colors.mutedForeground}
              />
            </GlassCard>
          </Animated.View>

          {/* Payment Method */}
          <Animated.View entering={FadeInDown.delay(240).springify()}>
            <GlassCard style={st.card}>
              <Text style={[st.sectionTitle, { color: colors.foreground }]}>💳 Payment</Text>
              <View style={st.payRow}>
                {(["Cash", "RaftaarWallet"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPayMethod(m)}
                    style={[
                      st.payBtn,
                      {
                        borderColor: payMethod === m ? colors.primary : colors.border,
                        backgroundColor: payMethod === m ? colors.primary + "18" : colors.secondary,
                        flex: 1,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 18 }}>{m === "Cash" ? "💵" : "👛"}</Text>
                    <Text style={[st.payLabel, { color: payMethod === m ? colors.primary : colors.foreground }]}>
                      {m === "RaftaarWallet" ? "Wallet" : m}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </GlassCard>
          </Animated.View>

          {/* Fare Summary */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <GlassCard style={[st.card, { borderColor: colors.primary + "44" }]}>
              <Text style={[st.sectionTitle, { color: colors.foreground }]}>🧾 Fare Estimate</Text>
              <View style={st.fareRow}>
                <Text style={[st.fareLabel, { color: colors.mutedForeground }]}>Package fare ({wCfg.label})</Text>
                <Text style={[st.fareVal, { color: colors.foreground }]}>₹{rideFare}</Text>
              </View>
              <View style={st.fareRow}>
                <Text style={[st.fareLabel, { color: colors.mutedForeground }]}>Platform fee</Text>
                <Text style={[st.fareVal, { color: colors.mutedForeground }]}>₹{platformFee}</Text>
              </View>
              <View style={[st.fareDivider, { backgroundColor: colors.border }]} />
              <View style={st.fareRow}>
                <Text style={[st.fareTotalLabel, { color: colors.foreground }]}>Total</Text>
                <Text style={[st.fareTotalVal, { color: colors.primary }]}>₹{totalFare}</Text>
              </View>
            </GlassCard>
          </Animated.View>

          {/* Book Button */}
          <Animated.View entering={FadeInDown.delay(360).springify()} style={{ marginHorizontal: 16, marginBottom: Math.max(insets.bottom + 16, 32) }}>
            {loading ? (
              <View style={[st.loadingBtn, { backgroundColor: colors.primary }]}>
                <ActivityIndicator color="#fff" />
                <Text style={st.loadingText}>Booking ho rahi hai...</Text>
              </View>
            ) : (
              <PrimaryButton label={`📦 Book Package Delivery — ₹${totalFare}`} onPress={handleBook} />
            )}
          </Animated.View>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 19, fontFamily: "Inter_700Bold", fontWeight: "700" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  scroll: { paddingTop: 16, gap: 12 },
  card: { marginHorizontal: 16, padding: 18 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700", marginBottom: 14, letterSpacing: 0.3 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, height: 14, backgroundColor: "rgba(120,120,120,0.3)", marginLeft: 4, marginVertical: 4 },
  routeText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  distanceTag: { marginTop: 12, fontSize: 12, fontFamily: "Inter_600SemiBold", borderWidth: 1, borderRadius: 20, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4 },
  weightGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  weightCard: { width: "47%", borderWidth: 1.5, borderRadius: 14, padding: 12, alignItems: "center", gap: 3 },
  weightIcon: { fontSize: 24, marginBottom: 2 },
  weightLabel: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  weightSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  weightDesc: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  payRow: { flexDirection: "row", gap: 10 },
  payBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  payLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fareRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  fareLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  fareVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fareDivider: { height: 1, marginVertical: 8 },
  fareTotalLabel: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  fareTotalVal: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  loadingBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  loadingText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
