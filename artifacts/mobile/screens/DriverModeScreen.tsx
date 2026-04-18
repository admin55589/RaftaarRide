import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
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
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MapView } from "@/components/MapView";

const MOCK_REQUESTS = [
  { id: "1", from: "Connaught Place", to: "DLF Cyber Hub", distance: "18 km", price: 320, eta: 3 },
  { id: "2", from: "Lajpat Nagar", to: "Hauz Khas", distance: "5 km", price: 120, eta: 2 },
];

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

function RideRequest({
  request,
  onAccept,
  onReject,
}: {
  request: typeof MOCK_REQUESTS[0];
  onAccept: () => void;
  onReject: () => void;
}) {
  const colors = useColors();
  const [countdown, setCountdown] = useState(20);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timer); onReject(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const progress = countdown / 20;
  const progressColor = countdown > 10 ? colors.success : countdown > 5 ? colors.primary : colors.destructive;

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <GlassCard style={styles.requestCard} padding={16}>
        <View style={styles.requestHeader}>
          <View style={[styles.requestBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
            <Text style={{ fontSize: 14 }}>🚗</Text>
            <Text style={[styles.requestBadgeText, { color: colors.primary }]}>New Ride</Text>
          </View>
          <View style={styles.countdown}>
            <Text style={[styles.countdownText, { color: progressColor }]}>{countdown}s</Text>
          </View>
        </View>

        <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: progressColor }]} />
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
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{request.distance}</Text>
          </View>
          <View style={[styles.metaChip, { backgroundColor: colors.secondary }]}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
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
            <Feather name="x" size={22} color={colors.destructive} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onAccept(); }}
            style={[styles.acceptBtn, { backgroundColor: colors.success }]}
          >
            <Feather name="check" size={22} color={colors.successForeground} />
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
  const [isOnline, setIsOnline] = useState(true);
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const [ridesCompleted, setRidesCompleted] = useState(7);

  const dotScale = useSharedValue(1);
  useEffect(() => {
    dotScale.value = withRepeat(
      withSequence(withTiming(1.4, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

  const handleAccept = (id: string) => {
    setRequests((rs) => rs.filter((r) => r.id !== id));
    setRidesCompleted((c) => c + 1);
    const price = requests.find((r) => r.id === id)?.price ?? 0;
    setDriverEarnings((e) => e + price);
  };

  const handleReject = (id: string) => {
    setRequests((rs) => rs.filter((r) => r.id !== id));
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView showRadar={isOnline} />

      <View style={[styles.header, { paddingTop: topPad + 8, paddingHorizontal: 16 }]}>
        <Pressable
          onPress={() => setScreen("home")}
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
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

      <Animated.View entering={FadeInDown.springify()} style={[styles.sheet, { paddingBottom: bottomPad + 12 }]}>
        <GlassCard style={styles.statsCard} padding={16}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statIcon}>💰</Text>
              <EarningsCounter value={driverEarnings} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Today's Earnings</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={styles.statIcon}>🚗</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{ridesCompleted}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rides</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={styles.statIcon}>⭐</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>4.9</Text>
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
                  onAccept={() => handleAccept(r.id)}
                  onReject={() => handleReject(r.id)}
                />
              ))}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="radio" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {isOnline ? "Waiting for ride requests..." : "Go online to receive requests"}
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
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
    gap: 12,
    maxHeight: "55%",
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
    fontSize: 18,
    marginBottom: 2,
  },
  earningsValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
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
  countdown: {
    minWidth: 32,
    alignItems: "center",
  },
  countdownText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
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
