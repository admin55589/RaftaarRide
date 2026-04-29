import React, { useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, Text, Platform } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { useLanguage } from "@/context/LanguageContext";

function getVehicleIcon(vehicleType?: string): string {
  switch ((vehicleType ?? "").toLowerCase()) {
    case "bike": return "🏍️";
    case "auto": return "🛺";
    case "car":  return "🚗";
    default:     return "🚗";
  }
}

import { HomeScreen } from "@/screens/HomeScreen";
import { BookingScreen } from "@/screens/BookingScreen";
import { SearchingScreen } from "@/screens/SearchingScreen";
import { DriverAssignedScreen } from "@/screens/DriverAssignedScreen";
import { LiveTrackingScreen } from "@/screens/LiveTrackingScreen";
import { PaymentScreen } from "@/screens/PaymentScreen";
import { DriverModeScreen } from "@/screens/DriverModeScreen";
import { WalletScreen } from "@/screens/WalletScreen";
import { ScheduledRidesScreen } from "@/screens/ScheduledRidesScreen";
import { DriverKYCScreen } from "@/screens/DriverKYCScreen";
import { DriverEarningsScreen } from "@/screens/DriverEarningsScreen";

const MONTHS_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function CalendarIcon({ isActive, color }: { isActive: boolean; color: string }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - Date.now();
    const t = setTimeout(() => {
      setNow(new Date());
    }, msUntilMidnight);
    return () => clearTimeout(t);
  }, [now]);

  const day = now.getDate();
  const month = MONTHS_SHORT[now.getMonth()];

  return (
    <View style={[calStyles.wrap, isActive && { borderColor: color }]}>
      <View style={[calStyles.header, { backgroundColor: color, opacity: isActive ? 1 : 0.45 }]}>
        <Text style={calStyles.month}>{month}</Text>
      </View>
      <View style={calStyles.body}>
        <Text style={[calStyles.day, { color: isActive ? color : "#888", opacity: isActive ? 1 : 0.7 }]}>
          {day}
        </Text>
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  wrap: {
    width: 30,
    height: 28,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
  },
  header: {
    height: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  month: {
    fontSize: 5.5,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
    fontFamily: "Inter_700Bold",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  day: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    lineHeight: 14,
  },
});

const USER_TABS = [
  { key: "home",     icon: "🏠", label_hi: "होम",     label_en: "Home",     custom: false },
  { key: "wallet",   icon: "💰", label_hi: "वॉलेट",   label_en: "Wallet",   custom: false },
  { key: "schedule", icon: null, label_hi: "शेड्यूल", label_en: "Schedule", custom: true  },
];


const RIDE_SCREENS = ["booking", "searching", "driver_assigned", "live_tracking", "payment"];

export default function MainScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { screen } = useApp();
  const { isDriverLoggedIn, driver } = useDriverAuth();
  const { lang } = useLanguage();

  const [activeTab, setActiveTab] = useState("home");

  const driverVehicleIcon = getVehicleIcon(driver?.vehicleType);
  const DRIVER_TABS = [
    { key: "home",     icon: driverVehicleIcon, label_hi: "राइड्स",  label_en: "Rides",    custom: false },
    { key: "kyc",      icon: "📋",              label_hi: "KYC",      label_en: "KYC",      custom: false },
    { key: "earnings", icon: "💵",              label_hi: "कमाई",    label_en: "Earnings", custom: false },
  ];

  const isInRideFlow = RIDE_SCREENS.includes(screen);

  const renderContent = () => {
    if (isDriverLoggedIn) {
      switch (activeTab) {
        case "kyc":      return <DriverKYCScreen />;
        case "earnings": return <DriverEarningsScreen />;
        default:         return <DriverModeScreen />;
      }
    }

    if (isInRideFlow) {
      switch (screen) {
        case "booking":         return <BookingScreen />;
        case "searching":       return <SearchingScreen />;
        case "driver_assigned": return <DriverAssignedScreen />;
        case "live_tracking":   return <LiveTrackingScreen />;
        case "payment":         return <PaymentScreen />;
      }
    }

    switch (activeTab) {
      case "wallet":   return <WalletScreen />;
      case "schedule": return <ScheduledRidesScreen />;
      default:         return <HomeScreen />;
    }
  };

  const tabs = isDriverLoggedIn ? DRIVER_TABS : USER_TABS;
  const showTabBar = !isInRideFlow;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 8) : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flex: 1 }}>{renderContent()}</View>

      {showTabBar && (
        <Animated.View
          entering={FadeInUp.duration(400)}
          style={[
            styles.tabBar,
            {
              backgroundColor: colors.tabBar ?? colors.card,
              paddingBottom: bottomPad,
              borderTopColor: colors.tabBarBorder ?? colors.border,
            },
          ]}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <View style={styles.tabIconWrap}>
                  {tab.custom ? (
                    <CalendarIcon isActive={isActive} color={colors.primary} />
                  ) : (
                    <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                      {tab.icon}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? colors.primary : colors.textSecondary },
                    isActive && { fontFamily: "Inter_600SemiBold" },
                  ]}
                >
                  {tab[`label_${lang}` as "label_hi"]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 4,
  },
  tabIconWrap: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
