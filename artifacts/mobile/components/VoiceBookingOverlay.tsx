import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import * as Speech from "expo-speech";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

interface VoiceBookingOverlayProps {
  rawText: string;
  destination: string;
  parsing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function VoiceBookingOverlay({
  rawText,
  destination,
  parsing,
  onConfirm,
  onCancel,
}: VoiceBookingOverlayProps) {
  const colors = useColors();
  const { lang } = useLanguage();
  const hasSpokeRef = useRef(false);

  useEffect(() => {
    if (!parsing && destination && !hasSpokeRef.current) {
      hasSpokeRef.current = true;
      Speech.stop();
      setTimeout(() => {
        if (lang === "hi") {
          Speech.speak(`ठीक है, ${destination}। Book करूँ?`, {
            language: "hi-IN",
            rate: 0.88,
            pitch: 1.0,
          });
        } else {
          Speech.speak(`Got it — ${destination}. Shall I book?`, {
            language: "en-IN",
            rate: 0.9,
          });
        }
      }, 300);
    }
    return () => {
      Speech.stop();
    };
  }, [parsing, destination, lang]);

  return (
    <>
      {/* Dark backdrop */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={StyleSheet.absoluteFillObject}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
          onPress={onCancel}
        />
      </Animated.View>

      {/* Bottom card */}
      <Animated.View
        entering={SlideInDown.springify().damping(18)}
        exiting={SlideOutDown.springify().damping(18)}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        pointerEvents="box-none"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.micBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "44" }]}>
            <Text style={{ fontSize: 22 }}>🎤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {lang === "hi" ? "आवाज़ से बुकिंग" : "Voice Booking"}
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {lang === "hi" ? "आपने कहा:" : "You said:"}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancel} hitSlop={12}>
            <Text style={{ fontSize: 20, color: colors.mutedForeground }}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Raw heard text */}
        <View style={[styles.rawBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.rawText, { color: colors.foreground }]} numberOfLines={2}>
            "{rawText}"
          </Text>
        </View>

        {/* Detected destination */}
        <View style={[styles.destBox, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
          <Text style={{ fontSize: 16 }}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.destLabel, { color: colors.mutedForeground }]}>
              {lang === "hi" ? "Destination मिला:" : "Destination found:"}
            </Text>
            {parsing ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.destText, { color: colors.mutedForeground }]}>
                  {lang === "hi" ? "पता ढूंढ रहा है..." : "Finding location..."}
                </Text>
              </View>
            ) : (
              <Text style={[styles.destText, { color: colors.primary }]} numberOfLines={2}>
                {destination}
              </Text>
            )}
          </View>
        </View>

        {/* Voice confirmation hint */}
        {!parsing && (
          <View style={styles.speechHint}>
            <Text style={{ fontSize: 14 }}>🔊</Text>
            <Text style={[styles.speechHintText, { color: colors.mutedForeground }]}>
              {lang === "hi"
                ? `"ठीक है, ${destination.split(",")[0]}। Book करूँ?"`
                : `"Got it — ${destination.split(",")[0]}. Shall I book?"`}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={onCancel}
            activeOpacity={0.8}
          >
            <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>
              ✕  {lang === "hi" ? "Cancel" : "Cancel"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: parsing ? colors.border : colors.primary, opacity: parsing ? 0.6 : 1 }]}
            onPress={onConfirm}
            disabled={parsing}
            activeOpacity={0.85}
          >
            {parsing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.bookBtnText}>
                ✓  {lang === "hi" ? "Book करो" : "Book Now"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    paddingBottom: 36,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  micBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    lineHeight: 22,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
  rawBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rawText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },
  destBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  destLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  destText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    marginTop: 2,
    lineHeight: 22,
  },
  speechHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  speechHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    fontStyle: "italic",
    flex: 1,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  bookBtn: {
    flex: 2,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  bookBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#000",
  },
});
