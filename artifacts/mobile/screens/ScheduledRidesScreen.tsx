import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotification } from "@/context/NotificationContext";
import { GlassCard } from "@/components/GlassCard";
import { BASE_URL } from "@/lib/api";

const MONTHS_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function LiveCalendarIcon() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - Date.now();
    const t = setTimeout(() => setNow(new Date()), msUntilMidnight);
    return () => clearTimeout(t);
  }, [now]);

  const day = now.getDate();
  const month = MONTHS_SHORT[now.getMonth()];

  return (
    <View style={liveCal.wrap}>
      <View style={liveCal.header}>
        <Text style={liveCal.month}>{month}</Text>
      </View>
      <View style={liveCal.body}>
        <Text style={liveCal.day}>{day}</Text>
      </View>
    </View>
  );
}

const liveCal = StyleSheet.create({
  wrap: {
    width: 38,
    height: 36,
    borderRadius: 7,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#F5A623",
    marginRight: 10,
  },
  header: {
    height: 11,
    backgroundColor: "#F5A623",
    alignItems: "center",
    justifyContent: "center",
  },
  month: {
    fontSize: 6.5,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
    fontFamily: "Inter_700Bold",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  day: {
    fontSize: 14,
    fontWeight: "800",
    color: "#F5A623",
    fontFamily: "Inter_700Bold",
    lineHeight: 16,
  },
});

function FormDateCalendarIcon({ dateStr }: { dateStr: string }) {
  let day: string = "--";
  let month: string = "---";

  if (dateStr && dateStr.length === 10) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = parseInt(parts[2], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (!isNaN(d) && !isNaN(m) && m >= 0 && m < 12) {
        day = String(d);
        month = MONTHS_SHORT[m];
      }
    }
  }

  return (
    <View style={formCal.wrap}>
      <View style={formCal.header}>
        <Text style={formCal.month}>{month}</Text>
      </View>
      <View style={formCal.body}>
        <Text style={formCal.day}>{day}</Text>
      </View>
    </View>
  );
}

const formCal = StyleSheet.create({
  wrap: {
    width: 44,
    height: 42,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    marginRight: 12,
  },
  header: {
    height: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  month: {
    fontSize: 7,
    fontWeight: "800",
    color: "#F5A623",
    letterSpacing: 0.6,
    fontFamily: "Inter_700Bold",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  day: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    fontFamily: "Inter_700Bold",
    lineHeight: 19,
  },
});

const VEHICLE_ICONS: Record<string, string> = {
  bike: "🏍️",
  auto: "🛺",
  prime: "🚗",
  suv: "🚙",
};

interface ScheduledRide {
  id: number;
  pickup: string;
  destination: string;
  vehicleType: string;
  price: string;
  scheduledAt: string;
  status: string;
  notes?: string;
}

export function ScheduledRidesScreen() {
  const colors = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedVehicle, pickup, destination, estimatedPrice } = useApp();
  const { t, lang } = useLanguage();
  const { showNotification } = useNotification();
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";

  const [rides, setRides] = useState<ScheduledRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formPickup, setFormPickup] = useState(pickup ?? "");
  const [formDest, setFormDest] = useState(destination ?? "");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formVehicle, setFormVehicle] = useState(selectedVehicle ?? "prime");
  const [formNotes, setFormNotes] = useState("");

  const fetchRides = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}scheduled-rides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setRides(data.rides);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRides(); }, [token]);

  const getMinDate = () => {
    const d = new Date(Date.now() + 31 * 60 * 1000);
    return d.toISOString().split("T")[0];
  };

  const normalizeDate = (raw: string): string => {
    return raw.replace(/[\/\.]/g, "-").replace(/[^0-9\-]/g, "");
  };

  const handleDateChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, "");
    if (cleaned.length > 4 && cleaned.length <= 6) cleaned = cleaned.slice(0, 4) + "-" + cleaned.slice(4);
    else if (cleaned.length > 6) cleaned = cleaned.slice(0, 4) + "-" + cleaned.slice(4, 6) + "-" + cleaned.slice(6, 8);
    if (text.endsWith("/") || text.endsWith("-") || text.endsWith(".")) {
      const normalized = normalizeDate(text);
      if (!normalized.endsWith("-")) setFormDate(normalized);
      return;
    }
    setFormDate(cleaned);
  };

  const handleSubmit = async () => {
    if (!formPickup || !formDest || !formDate || !formTime) {
      showNotification({ title: t("ride_details"), body: "Sabhi fields fill karein", type: "error", icon: "⚠️" });
      return;
    }

    const normalizedDate = normalizeDate(formDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      showNotification({ title: t("date_label"), body: "Date format sahi karein: YYYY-MM-DD (jaise 2026-04-20)", type: "error", icon: "📅" });
      return;
    }

    const scheduledAt = new Date(`${normalizedDate}T${formTime}:00`);
    if (isNaN(scheduledAt.getTime())) {
      showNotification({ title: t("date_label"), body: "Date ya time galat hai, dobara check karein", type: "error", icon: "📅" });
      return;
    }
    const minTime = new Date(Date.now() + 30 * 60 * 1000);
    if (scheduledAt < minTime) {
      showNotification({ title: t("time_label"), body: "Kam se kam 30 minute baad schedule karein", type: "error", icon: "⏰" });
      return;
    }

    const basePrices: Record<string, number> = { bike: 40, auto: 65, prime: 120, suv: 180 };
    const price = estimatedPrice ?? basePrices[formVehicle] ?? 100;

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}scheduled-rides`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pickup: formPickup,
          destination: formDest,
          vehicleType: formVehicle,
          rideMode: "economy",
          price,
          scheduledAt: scheduledAt.toISOString(),
          notes: formNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setFormPickup(""); setFormDest(""); setFormDate(""); setFormTime(""); setFormNotes("");
        await fetchRides();
        showNotification({
          title: "Ride Schedule Ho Gayi! 📅",
          body: `${formPickup} → ${formDest} — ${normalizedDate} ${formTime}`,
          type: "success",
          icon: "📅",
          duration: 5000,
        });
      } else {
        showNotification({ title: "Error", body: data.error ?? "Kuch galat hua", type: "error", icon: "❌" });
      }
    } catch {
      showNotification({ title: "Network Error", body: "Dobara try karein", type: "error", icon: "📵" });
    } finally { setSubmitting(false); }
  };

  const handleCancel = async (id: number) => {
    try {
      const res = await fetch(`${BASE_URL}scheduled-rides/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setRides((r) => r.map((ride) => ride.id === id ? { ...ride, status: "cancelled" } : ride));
        showNotification({ title: t("cancel"), body: "Scheduled ride cancel kar di gayi", type: "warning", icon: "🚫" });
      }
    } catch { }
  };

  const statusColors: Record<string, string> = {
    pending: "#F59E0B",
    confirmed: "#4ADE80",
    cancelled: "#F87171",
    completed: "#60A5FA",
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: topPad },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontFamily: "Inter_400Regular" },
    addBtn: { marginHorizontal: 20, marginBottom: 16, borderRadius: 14, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    form: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 14, fontFamily: "Inter_700Bold" },
    input: { borderRadius: 12, padding: 14, fontSize: 14, color: colors.text, marginBottom: 12, borderWidth: 1, fontFamily: "Inter_400Regular" },
    vehicleRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    vehicleChip: { flex: 1, alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1 },
    vehicleIcon: { fontSize: 22, marginBottom: 4 },
    vehicleName: { fontSize: 11, fontFamily: "Inter_500Medium" },
    rideCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 16, padding: 16 },
    routeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    routeText: { flex: 1, fontSize: 14, color: colors.text, fontFamily: "Inter_500Medium" },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 11, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" },
    detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
    detailText: { fontSize: 12, color: colors.textSecondary, fontFamily: "Inter_400Regular" },
    cancelBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#F87171" },
    emptyText: { textAlign: "center", color: colors.textSecondary, fontSize: 14, marginTop: 40, fontFamily: "Inter_400Regular" },
    emptyIcon: { textAlign: "center", fontSize: 48, marginBottom: 12 },
    fieldLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 8, fontFamily: "Inter_400Regular" },
  });

  const formatScheduled = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(50)} style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <LiveCalendarIcon />
            <Text style={styles.title}>{t("schedule_ride")}</Text>
          </View>
          <Text style={styles.subtitle}>{t("advance_book")}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: showForm ? "rgba(245,166,35,0.12)" : colors.primary }]}
            onPress={() => setShowForm(!showForm)}
          >
            <Text style={{ fontSize: 18 }}>{showForm ? "✕" : "➕"}</Text>
            <Text style={{ color: showForm ? colors.primary : "#000", fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" }}>
              {showForm ? t("close") : t("new_scheduled")}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {showForm && (
          <Animated.View entering={FadeInUp.duration(300)}>
            <GlassCard style={styles.form}>
              <Text style={styles.sectionTitle}>{t("ride_details")}</Text>

              <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder={t("pickup_location_ph")}
                placeholderTextColor={colors.textSecondary}
                value={formPickup}
                onChangeText={setFormPickup}
              />
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder={t("destination_ph")}
                placeholderTextColor={colors.textSecondary}
                value={formDest}
                onChangeText={setFormDest}
              />

              <Text style={styles.fieldLabel}>{t("date_label")} ({getMinDate()} format)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder={getMinDate()}
                placeholderTextColor={colors.textSecondary}
                value={formDate}
                onChangeText={handleDateChange}
                keyboardType="numeric"
                maxLength={10}
              />

              <Text style={styles.fieldLabel}>{t("time_label")}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder="09:30"
                placeholderTextColor={colors.textSecondary}
                value={formTime}
                onChangeText={setFormTime}
              />

              <Text style={styles.fieldLabel}>{t("vehicle_type")}</Text>
              <View style={styles.vehicleRow}>
                {Object.entries(VEHICLE_ICONS).map(([v, icon]) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.vehicleChip, {
                      backgroundColor: formVehicle === v ? colors.primary + "22" : inputBg,
                      borderColor: formVehicle === v ? colors.primary : inputBorder,
                    }]}
                    onPress={() => setFormVehicle(v)}
                  >
                    <Text style={styles.vehicleIcon}>{icon}</Text>
                    <Text style={[styles.vehicleName, { color: formVehicle === v ? colors.primary : colors.textSecondary }]}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder }]}
                placeholder={t("special_instructions")}
                placeholderTextColor={colors.textSecondary}
                value={formNotes}
                onChangeText={setFormNotes}
                multiline
              />

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.82}
                style={{
                  backgroundColor: submitting ? "rgba(245,166,35,0.5)" : "#F5A623",
                  borderRadius: 16,
                  height: 58,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 8,
                  paddingHorizontal: 20,
                }}
              >
                <FormDateCalendarIcon dateStr={formDate} />
                <Text style={{ color: "#000", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" }}>
                  {submitting ? t("scheduling") : t("schedule_btn")}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </Animated.View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : rides.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(200)}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>{t("no_scheduled_yet")}</Text>
            <Text style={[styles.emptyText, { fontSize: 12, marginTop: 6 }]}>{t("use_btn_above")}</Text>
          </Animated.View>
        ) : (
          rides.map((ride, i) => (
            <Animated.View key={ride.id} entering={FadeInDown.delay(i * 60)}>
              <GlassCard style={styles.rideCard}>
                <View style={styles.routeRow}>
                  <Text style={{ fontSize: 20 }}>{VEHICLE_ICONS[ride.vehicleType] ?? "🚗"}</Text>
                  <Text style={styles.routeText} numberOfLines={1}>
                    {ride.pickup} → {ride.destination}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: statusColors[ride.status] ?? "#6B7280" }]}>
                    <Text style={styles.badgeText}>{ride.status.charAt(0).toUpperCase() + ride.status.slice(1)}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailText}>📅 {formatScheduled(ride.scheduledAt)}</Text>
                  <Text style={[styles.detailText, { color: colors.primary, fontWeight: "700" }]}>₹{Number(ride.price).toFixed(0)}</Text>
                </View>

                {ride.notes && (
                  <Text style={[styles.detailText, { marginTop: 6 }]}>📝 {ride.notes}</Text>
                )}

                {ride.status === "pending" && (
                  <TouchableOpacity style={[styles.cancelBtn, { marginTop: 10, alignSelf: "flex-end" }]} onPress={() => handleCancel(ride.id)}>
                    <Text style={{ color: "#F87171", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                      {t("cancel")}
                    </Text>
                  </TouchableOpacity>
                )}
              </GlassCard>
            </Animated.View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
