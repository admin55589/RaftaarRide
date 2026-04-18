import React, { useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { MapView } from "@/components/MapView";
import { GlassCard } from "@/components/GlassCard";

const SUGGESTIONS = [
  { label: "Office", sub: "Connaught Place", icon: "briefcase" },
  { label: "Home", sub: "Sector 62, Noida", icon: "home" },
  { label: "Airport", sub: "T3, IGI Airport", icon: "send" },
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
        <View style={[styles.suggestionIcon, { backgroundColor: colors.primary + "20" }]}>
          <Feather name={icon as any} size={16} color={colors.primary} />
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
  const { setScreen, setDestination, isDriverMode, setIsDriverMode } = useApp();
  const { user, logout } = useAuth();
  const userName = user?.name ?? "Aarav";
  const [inputValue, setInputValue] = React.useState("");

  const dotScale = useSharedValue(1);

  useEffect(() => {
    dotScale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      false
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
  }));

  const handleDestinationSelect = (dest: string) => {
    setDestination(dest);
    setScreen("booking");
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView />

      <View
        style={[
          styles.topOverlay,
          { paddingTop: topPad + 8 },
        ]}
      >
        <Animated.View entering={FadeInDown.springify()} style={styles.topBar}>
          <View style={styles.locationRow}>
            <Animated.View style={[styles.locationDot, { backgroundColor: colors.primary }, dotStyle]} />
            <Text style={[styles.locationText, { color: colors.foreground }]} numberOfLines={1}>
              Connaught Place, New Delhi
            </Text>
          </View>
          <Pressable
            onPress={() => setIsDriverMode(!isDriverMode)}
            style={[styles.modeToggle, { backgroundColor: isDriverMode ? colors.primary : colors.secondary, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons
              name={isDriverMode ? "steering" : "account"}
              size={20}
              color={isDriverMode ? colors.primaryForeground : colors.foreground}
            />
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <GlassCard style={styles.greetCard} padding={16}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {getGreeting()}, {userName}
            </Text>
            <Text style={[styles.greetTitle, { color: colors.foreground }]}>
              Where are you heading?
            </Text>
          </GlassCard>
        </Animated.View>
      </View>

      <View style={styles.bottomSheet}>
        <GlassCard style={styles.bottomCard} padding={0}>
          <View style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="search" size={18} color={colors.mutedForeground} style={{ marginRight: 10 }} />
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
                <Pressable onPress={() => setInputValue("")}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
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
                  <Feather name="clock" size={14} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.recentLabel, { color: colors.foreground }]}>{place}</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </ScrollView>
        </GlassCard>

        <Pressable
          onPress={() => setScreen("driver_mode")}
          style={[styles.driverFab, { backgroundColor: colors.card, borderColor: colors.glassBorder }]}
        >
          <MaterialCommunityIcons name="steering" size={20} color={colors.primary} />
          <Text style={[styles.driverFabText, { color: colors.foreground }]}>Driver</Text>
        </Pressable>
      </View>

      <Pressable
        style={[
          styles.sosButton,
          { backgroundColor: colors.destructive, bottom: Platform.OS === "web" ? 34 + 220 : 220 },
        ]}
      >
        <Text style={[styles.sosText, { color: colors.destructiveForeground }]}>SOS</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
    justifyContent: "space-between",
    gap: 12,
  },
  locationRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  locationText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  modeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  searchContainer: {
    padding: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  suggestionsScroll: {
    maxHeight: 280,
  },
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
  suggestionText: {
    flex: 1,
  },
  suggestionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  suggestionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
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
  recentLabel: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  driverFab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  driverFabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  sosButton: {
    position: "absolute",
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  sosText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
