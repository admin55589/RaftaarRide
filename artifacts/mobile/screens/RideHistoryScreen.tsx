import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, Ride } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";

function getStatusColor(status?: string) {
  switch (status) {
    case "completed":  return "#22c55e";
    case "cancelled":  return "#ef4444";
    case "onRide":     return "#3b82f6";
    case "searching":  return "#f59e0b";
    default:           return "#8b8fa8";
  }
}
function getStatusLabel(status?: string) {
  switch (status) {
    case "completed":      return "Completed ✅";
    case "cancelled":      return "Cancelled ✕";
    case "onRide":         return "In Progress 🚗";
    case "searching":      return "Searching...";
    case "driver_assigned":return "Driver Assigned";
    case "arrived":        return "Driver Arrived";
    default:               return status ?? "Unknown";
  }
}
function getVehicleIcon(vehicleType?: string) {
  switch ((vehicleType ?? "").toLowerCase()) {
    case "bike":   return "🏍️";
    case "auto":   return "🛺";
    case "suv":    return "🚐";
    case "prime":  return "⭐🚗";
    default:       return "🚗";
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function StarRating({ rating }: { rating?: number }) {
  const colors = useColors();
  if (!rating) return null;
  const stars = Math.round(rating);
  return (
    <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: 12, color: i <= stars ? "#f59e0b" : colors.border }}>★</Text>
      ))}
      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginLeft: 4 }}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function RideDetailModal({ ride, onClose }: { ride: Ride; onClose: () => void }) {
  const colors = useColors();
  const { isDark } = useTheme();
  const statusColor = getStatusColor(ride.status);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <BlurView intensity={isDark ? 60 : 40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.modalBackdrop} onPress={onClose}>
          <Animated.View
            entering={FadeInUp.springify().damping(16)}
            style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Pressable>
              {/* Header */}
              <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                    {formatDate(ride.date)} • {formatTime(ride.date)}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <Text style={{ fontSize: 20 }}>{getVehicleIcon(ride.vehicleType)}</Text>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>
                      {ride.vehicleType}
                    </Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: `${statusColor}22` }}>
                      <Text style={{ fontSize: 11, color: statusColor, fontWeight: "600" }}>{getStatusLabel(ride.status)}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 20, color: colors.mutedForeground }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Route */}
              <View style={{ padding: 16, gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                  <View style={{ alignItems: "center", gap: 3, paddingTop: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#16a34a" }} />
                    <View style={{ width: 2, height: 20, backgroundColor: colors.border }} />
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#ef4444" }} />
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    <View>
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>PICKUP</Text>
                      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "500", fontFamily: "Inter_500Medium" }} numberOfLines={2}>{ride.pickup}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>DROP</Text>
                      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "500", fontFamily: "Inter_500Medium" }} numberOfLines={2}>{ride.destination}</Text>
                    </View>
                  </View>
                </View>

                {/* Stats Row */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 14 }}>📍</Text>
                    <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: "600" }}>{ride.distance}</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 14 }}>⏱️</Text>
                    <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: "600" }}>{ride.duration} min</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: "rgba(34,197,94,0.12)", flex: 1 }]}>
                    <Text style={{ fontSize: 14 }}>💰</Text>
                    <Text style={{ fontSize: 14, color: "#22c55e", fontWeight: "700", fontFamily: "Inter_700Bold" }}>₹{ride.price.toFixed(0)}</Text>
                  </View>
                </View>

                {/* Driver Info */}
                {ride.driver && ride.driver.id !== "0" && (
                  <View style={[styles.driverRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <View style={[styles.driverAvatar, { backgroundColor: "#1e293b" }]}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>{ride.driver.photo ?? ride.driver.name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{ride.driver.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{ride.driver.vehicle} • {ride.driver.vehicleNumber}</Text>
                      <StarRating rating={ride.driver.rating} />
                    </View>
                  </View>
                )}

                {/* Mode */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Ride Mode</Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.15)" }}>
                    <Text style={{ fontSize: 12, color: "#f59e0b", fontWeight: "600", textTransform: "capitalize" }}>{ride.rideMode}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Ride ID</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>#{ride.id}</Text>
                </View>
              </View>

              {/* Close Button */}
              <View style={{ padding: 16, paddingTop: 0 }}>
                <TouchableOpacity
                  onPress={onClose}
                  style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, fontFamily: "Inter_700Bold" }}>Close</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

export function RideHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rideHistory, refreshHistoryFromServer, isHistoryLoading } = useApp();
  const { token } = useAuth();
  const { lang } = useLanguage();
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try { await refreshHistoryFromServer(token); } catch { }
    finally { setRefreshing(false); }
  };

  const completedRides = rideHistory.filter((r) => r.status === "completed");
  const totalSpent = completedRides.reduce((sum, r) => sum + r.price, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0)} style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>🕓 Ride History</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {lang === "hi" ? "Aapki sabhi rides" : "All your past rides"}
          </Text>
        </Animated.View>

        {/* Summary Card */}
        <Animated.View entering={FadeInDown.delay(60)} style={{ marginHorizontal: 20, marginBottom: 16, flexDirection: "row", gap: 10 }}>
          <View style={[styles.summaryChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 20 }}>🚗</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, fontFamily: "Inter_700Bold" }}>{completedRides.length}</Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Completed</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 20 }}>💰</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#22c55e", fontFamily: "Inter_700Bold" }}>₹{totalSpent.toFixed(0)}</Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Total Spent</Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            style={[styles.summaryChip, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ fontSize: 20 }}>🔄</Text>}
            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Refresh</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Ride List */}
        {rideHistory.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(120)} style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
            <Text style={{ fontSize: 56 }}>🛺</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>
              {lang === "hi" ? "Koi ride nahi mili" : "No rides yet"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 40 }}>
              {lang === "hi" ? "Pehli ride book karo aur yahan dikhegi!" : "Book your first ride and it will appear here!"}
            </Text>
          </Animated.View>
        ) : (
          rideHistory.map((ride, i) => {
            const statusColor = getStatusColor(ride.status);
            return (
              <Animated.View key={ride.id} entering={FadeInDown.delay(80 + i * 40)}>
                <TouchableOpacity
                  onPress={() => setSelectedRide(ride)}
                  activeOpacity={0.75}
                  style={[styles.rideCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {/* Date + Status */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                      {formatDate(ride.date)} • {formatTime(ride.date)}
                    </Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: `${statusColor}22` }}>
                      <Text style={{ fontSize: 10, color: statusColor, fontWeight: "700" }}>{getStatusLabel(ride.status)}</Text>
                    </View>
                  </View>

                  {/* Route summary */}
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Text style={{ fontSize: 22 }}>{getVehicleIcon(ride.vehicleType)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600", fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                        {ride.pickup}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginVertical: 2 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                        <Text style={{ fontSize: 9, color: colors.mutedForeground }}>▼</Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                      </View>
                      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600", fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                        {ride.destination}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: "#22c55e", fontFamily: "Inter_700Bold" }}>
                        ₹{ride.price.toFixed(0)}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{ride.distance}</Text>
                    </View>
                  </View>

                  {/* Driver + tap hint */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    {ride.driver && ride.driver.id !== "0" ? (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        👤 {ride.driver.name} • ⭐ {ride.driver.rating?.toFixed(1) ?? "N/A"}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>No driver info</Text>
                    )}
                    <Text style={{ fontSize: 11, color: colors.primary }}>Details →</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Detail Modal */}
      {selectedRide && (
        <RideDetailModal ride={selectedRide} onClose={() => setSelectedRide(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "800", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, marginTop: 4, fontFamily: "Inter_400Regular" },
  summaryChip: {
    flex: 1, alignItems: "center", padding: 12, borderRadius: 14,
    borderWidth: 1, gap: 2,
  },
  rideCard: {
    marginHorizontal: 20, marginBottom: 12, borderRadius: 16,
    padding: 14, borderWidth: 1,
  },
  modalBackdrop: {
    flex: 1, justifyContent: "center", alignItems: "center", padding: 20,
  },
  detailCard: {
    width: "100%", maxWidth: 400, borderRadius: 20, borderWidth: 1, overflow: "hidden",
  },
  detailHeader: {
    flexDirection: "row", alignItems: "flex-start", padding: 16, borderBottomWidth: 1,
  },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10,
    paddingVertical: 8, borderRadius: 10,
  },
  driverRow: {
    flexDirection: "row", gap: 10, alignItems: "center", padding: 10,
    borderRadius: 12, borderWidth: 1,
  },
  driverAvatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },
});
