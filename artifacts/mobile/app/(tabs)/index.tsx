import React from "react";
import { View, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useDriverAuth } from "@/context/DriverAuthContext";
import { HomeScreen } from "@/screens/HomeScreen";
import { BookingScreen } from "@/screens/BookingScreen";
import { SearchingScreen } from "@/screens/SearchingScreen";
import { DriverAssignedScreen } from "@/screens/DriverAssignedScreen";
import { LiveTrackingScreen } from "@/screens/LiveTrackingScreen";
import { PaymentScreen } from "@/screens/PaymentScreen";
import { DriverModeScreen } from "@/screens/DriverModeScreen";

export default function MainScreen() {
  const colors = useColors();
  const { screen } = useApp();
  const { isDriverLoggedIn } = useDriverAuth();

  const renderScreen = () => {
    if (isDriverLoggedIn) {
      return <DriverModeScreen />;
    }

    switch (screen) {
      case "home":
        return <HomeScreen />;
      case "booking":
        return <BookingScreen />;
      case "searching":
        return <SearchingScreen />;
      case "driver_assigned":
        return <DriverAssignedScreen />;
      case "live_tracking":
        return <LiveTrackingScreen />;
      case "payment":
        return <PaymentScreen />;
      case "driver_mode":
        return <DriverModeScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
