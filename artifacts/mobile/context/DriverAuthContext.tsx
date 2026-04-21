import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { registerForPushNotificationsAsync, savePushTokenForDriver } from "@/hooks/usePushNotifications";

export interface DriverUser {
  id: number;
  name: string;
  phone: string;
  email: string;
  photoUrl: string | null;
  vehicleType: string;
  vehicleNumber: string;
  rating: string;
  totalEarnings: string;
  totalRides: number;
  status: string;
  isOnline: boolean;
}

interface DriverAuthContextType {
  driver: DriverUser | null;
  driverToken: string | null;
  isDriverLoading: boolean;
  isDriverLoggedIn: boolean;
  driverLogin: (token: string, driver: DriverUser) => Promise<void>;
  driverLogout: () => Promise<void>;
  updateDriver: (d: DriverUser) => void;
}

const DriverAuthContext = createContext<DriverAuthContextType | null>(null);

const DRIVER_TOKEN_KEY = "raftaar_driver_token";
const DRIVER_USER_KEY = "raftaar_driver_user";

export function DriverAuthProvider({ children }: { children: React.ReactNode }) {
  const [driver, setDriver] = useState<DriverUser | null>(null);
  const [driverToken, setDriverToken] = useState<string | null>(null);
  const [isDriverLoading, setIsDriverLoading] = useState(true);

  useEffect(() => {
    loadDriverAuth();
  }, []);

  const loadDriverAuth = async () => {
    try {
      const [storedToken, storedDriver] = await Promise.all([
        AsyncStorage.getItem(DRIVER_TOKEN_KEY),
        AsyncStorage.getItem(DRIVER_USER_KEY),
      ]);
      if (storedToken && storedDriver) {
        setDriverToken(storedToken);
        setDriver(JSON.parse(storedDriver));
      }
    } catch {}
    finally {
      setIsDriverLoading(false);
    }
  };

  const driverLogin = async (newToken: string, newDriver: DriverUser) => {
    await Promise.all([
      AsyncStorage.setItem(DRIVER_TOKEN_KEY, newToken),
      AsyncStorage.setItem(DRIVER_USER_KEY, JSON.stringify(newDriver)),
    ]);
    setDriverToken(newToken);
    setDriver(newDriver);
    /* Register & save Expo push token — non-blocking */
    registerForPushNotificationsAsync().then((pushToken) => {
      if (pushToken) savePushTokenForDriver(pushToken, newToken);
    });
  };

  const driverLogout = async () => {
    await Promise.all([
      AsyncStorage.removeItem(DRIVER_TOKEN_KEY),
      AsyncStorage.removeItem(DRIVER_USER_KEY),
    ]);
    setDriverToken(null);
    setDriver(null);
  };

  const updateDriver = (updated: DriverUser) => {
    setDriver(updated);
    AsyncStorage.setItem(DRIVER_USER_KEY, JSON.stringify(updated)).catch(() => {});
  };

  return (
    <DriverAuthContext.Provider
      value={{
        driver,
        driverToken,
        isDriverLoading,
        isDriverLoggedIn: !!driverToken && !!driver,
        driverLogin,
        driverLogout,
        updateDriver,
      }}
    >
      {children}
    </DriverAuthContext.Provider>
  );
}

export function useDriverAuth() {
  const ctx = useContext(DriverAuthContext);
  if (!ctx) throw new Error("useDriverAuth must be used within DriverAuthProvider");
  return ctx;
}
