import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useNotification } from "@/context/NotificationContext";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BASE_URL } from "@/lib/api";

const DOC_FIELDS = [
  { key: "aadhaarFront", label_hi: "आधार कार्ड (Front)", label_en: "Aadhaar Card (Front)", icon: "🪪" },
  { key: "aadhaarBack", label_hi: "आधार कार्ड (Back)", label_en: "Aadhaar Card (Back)", icon: "🪪" },
  { key: "licenseFront", label_hi: "Driving License (Front)", label_en: "Driving License (Front)", icon: "📄" },
  { key: "licenseBack", label_hi: "Driving License (Back)", label_en: "Driving License (Back)", icon: "📄" },
  { key: "rcFront", label_hi: "RC Book / वाहन पंजीकरण", label_en: "RC Book / Vehicle Registration", icon: "🚗" },
  { key: "selfie", label_hi: "ड्राइवर सेल्फी (चेहरा दिखे)", label_en: "Driver Selfie (Face Visible)", icon: "🤳" },
] as const;

type DocKey = typeof DOC_FIELDS[number]["key"];

interface KycData {
  status: string;
  rejectionReason?: string;
  verifiedAt?: string;
  aadhaarFront?: string;
  aadhaarBack?: string;
  licenseFront?: string;
  licenseBack?: string;
  rcFront?: string;
  selfie?: string;
}

export function DriverKYCScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { driverToken } = useDriverAuth();
  const { t, lang } = useLanguage();
  const { showNotification } = useNotification();

  const [kycData, setKycData] = useState<KycData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [docs, setDocs] = useState<Partial<Record<DocKey, string>>>({});

  const fetchKyc = async () => {
    if (!driverToken) return;
    try {
      const res = await fetch(`${BASE_URL}driver/kyc`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      const data = await res.json();
      if (data.success && data.kyc) {
        setKycData(data.kyc);
        setDocs({
          aadhaarFront: data.kyc.aadhaarFront ?? undefined,
          aadhaarBack: data.kyc.aadhaarBack ?? undefined,
          licenseFront: data.kyc.licenseFront ?? undefined,
          licenseBack: data.kyc.licenseBack ?? undefined,
          rcFront: data.kyc.rcFront ?? undefined,
          selfie: data.kyc.selfie ?? undefined,
        });
      }
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchKyc(); }, [driverToken]);

  const pickImage = async (field: DocKey) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showNotification({ title: t("submit"), body: "Gallery access chahiye documents upload karne ke liye", type: "error", icon: "📷" });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: field === "selfie" ? [1, 1] : [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (!asset.base64) { showNotification({ title: "Error", body: "Image load nahi ho paya", type: "error", icon: "❌" }); return; }

      const b64 = `data:image/jpeg;base64,${asset.base64}`;
      if (b64.length > 500 * 1024) {
        showNotification({ title: "Image Too Large", body: "Image 500KB se choti honi chahiye", type: "error", icon: "⚠️" });
        return;
      }

      setDocs((prev) => ({ ...prev, [field]: b64 }));
      showNotification({
        title: `Image Selected ✅`,
        body: DOC_FIELDS.find((d) => d.key === field)?.[lang === "hi" ? "label_hi" : "label_en"] ?? field,
        type: "success", icon: "✅", duration: 2000
      });
    }
  };

  const handleSubmit = async () => {
    const requiredFields: DocKey[] = ["aadhaarFront", "aadhaarBack", "licenseFront", "licenseBack", "rcFront", "selfie"];
    const missing = requiredFields.filter((f) => !docs[f]);
    if (missing.length > 0) {
      showNotification({ title: t("kyc_documents"), body: `${missing.length} documents upload karne baaki hain`, type: "error", icon: "📄" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}driver/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${driverToken}` },
        body: JSON.stringify(docs),
      });
      const data = await res.json();
      if (data.success) {
        setKycData(data.kyc);
        showNotification({
          title: "KYC Submitted! 🎉",
          body: lang === "hi" ? "Documents review ke liye bhej diye gaye — jald confirm karenge" : "Documents sent for review — we'll confirm soon",
          type: "success",
          icon: "🎉",
          duration: 5000,
        });
      } else {
        showNotification({ title: "Submission Failed", body: data.error ?? "Kuch galat hua", type: "error", icon: "❌" });
      }
    } catch {
      showNotification({ title: "Network Error", body: "Dobara try karein", type: "error", icon: "📵" });
    } finally { setSubmitting(false); }
  };

  const statusConfig: Record<string, { bg: string; icon: string; label: string }> = {
    pending: { bg: "#F59E0B", icon: "⏳", label: t("kyc_pending") },
    verified: { bg: "#4ADE80", icon: "✅", label: t("kyc_verified") },
    rejected: { bg: "#F87171", icon: "❌", label: t("kyc_rejected") },
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: topPad },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontFamily: "Inter_400Regular" },
    statusBanner: { marginHorizontal: 20, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    statusIcon: { fontSize: 28 },
    statusText: { fontSize: 16, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    statusSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
    infoBox: { marginHorizontal: 20, borderRadius: 12, padding: 14, marginBottom: 20, backgroundColor: "rgba(245,166,35,0.08)", borderWidth: 1, borderColor: "rgba(245,166,35,0.2)" },
    infoText: { fontSize: 13, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 },
    docRow: { marginHorizontal: 20, marginBottom: 14, borderRadius: 16, overflow: "hidden" },
    docHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
    docIcon: { fontSize: 20 },
    docLabel: { fontSize: 14, fontWeight: "600", color: colors.text, flex: 1, fontFamily: "Inter_600SemiBold" },
    docStatus: { fontSize: 11, color: "#4ADE80", fontFamily: "Inter_400Regular" },
    uploadArea: { height: 120, margin: 14, marginTop: 0, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
    uploadText: { fontSize: 13, color: colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 6 },
    uploadIcon: { fontSize: 32 },
    uploadedImage: { width: "100%", height: "100%", resizeMode: "cover" },
    submitArea: { marginHorizontal: 20, marginTop: 8, marginBottom: 20 },
  });

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const currentStatus = kycData?.status ?? "not_submitted";
  const sc = statusConfig[currentStatus];
  const isVerified = currentStatus === "verified";

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(50)} style={styles.header}>
          <Text style={styles.title}>📋 {t("kyc_documents")}</Text>
          <Text style={styles.subtitle}>{t("kyc_subtitle")}</Text>
        </Animated.View>

        {sc && (
          <Animated.View entering={FadeInDown.delay(80)} style={[styles.statusBanner, { backgroundColor: sc.bg }]}>
            <Text style={styles.statusIcon}>{sc.icon}</Text>
            <View>
              <Text style={styles.statusText}>{sc.label}</Text>
              {kycData?.rejectionReason && (
                <Text style={styles.statusSub}>{kycData.rejectionReason}</Text>
              )}
              {kycData?.verifiedAt && (
                <Text style={styles.statusSub}>
                  {t("verified_on")} {new Date(kycData.verifiedAt).toLocaleDateString("en-IN")}
                </Text>
              )}
            </View>
          </Animated.View>
        )}

        {!isVerified && (
          <Animated.View entering={FadeInDown.delay(100)} style={styles.infoBox}>
            <Text style={styles.infoText}>{t("kyc_info")}</Text>
          </Animated.View>
        )}

        {DOC_FIELDS.map((field, i) => (
          <Animated.View key={field.key} entering={FadeInDown.delay(120 + i * 40)}>
            <GlassCard style={styles.docRow}>
              <View style={styles.docHeader}>
                <Text style={styles.docIcon}>{field.icon}</Text>
                <Text style={styles.docLabel}>{field[lang === "hi" ? "label_hi" : "label_en"]}</Text>
                {docs[field.key] && <Text style={styles.docStatus}>✅ {t("added_label")}</Text>}
              </View>

              <TouchableOpacity
                style={styles.uploadArea}
                onPress={() => !isVerified && pickImage(field.key)}
                disabled={isVerified}
                activeOpacity={0.7}
              >
                {docs[field.key] ? (
                  <Image source={{ uri: docs[field.key] }} style={styles.uploadedImage} />
                ) : (
                  <>
                    <Text style={styles.uploadIcon}>📤</Text>
                    <Text style={styles.uploadText}>
                      {isVerified ? t("kyc_is_verified") : t("tap_to_upload")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </GlassCard>
          </Animated.View>
        ))}

        {!isVerified && (
          <Animated.View entering={FadeInDown.delay(400)} style={styles.submitArea}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 14, fontFamily: "Inter_400Regular" }}>
              {Object.values(docs).filter(Boolean).length}/6 {t("docs_uploaded")}
            </Text>
            <PrimaryButton
              title={submitting
                ? t("submitting")
                : currentStatus === "not_submitted"
                ? t("kyc_submit")
                : t("kyc_resubmit")}
              onPress={handleSubmit}
              disabled={submitting}
            />
          </Animated.View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
