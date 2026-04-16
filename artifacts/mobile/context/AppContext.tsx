import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type RideMode = "economy" | "fast" | "premium";
export type VehicleType = "bike" | "auto" | "cab";
export type AppScreen =
  | "home"
  | "booking"
  | "searching"
  | "driver_assigned"
  | "live_tracking"
  | "payment"
  | "payment_success"
  | "driver_mode";

export interface SavedPlace {
  id: string;
  name: string;
  address: string;
  icon: string;
}

export interface Driver {
  id: string;
  name: string;
  rating: number;
  vehicle: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  eta: number;
  photo: string;
}

export interface Ride {
  id: string;
  pickup: string;
  destination: string;
  vehicleType: VehicleType;
  rideMode: RideMode;
  price: number;
  duration: number;
  distance: string;
  date: string;
  driver: Driver;
}

interface AppContextType {
  screen: AppScreen;
  setScreen: (s: AppScreen) => void;
  selectedVehicle: VehicleType;
  setSelectedVehicle: (v: VehicleType) => void;
  rideMode: RideMode;
  setRideMode: (m: RideMode) => void;
  pickup: string;
  setPickup: (p: string) => void;
  destination: string;
  setDestination: (d: string) => void;
  estimatedPrice: number;
  setEstimatedPrice: (p: number) => void;
  estimatedTime: number;
  setEstimatedTime: (t: number) => void;
  assignedDriver: Driver | null;
  setAssignedDriver: (d: Driver | null) => void;
  rideHistory: Ride[];
  addRideToHistory: (r: Ride) => void;
  isDriverMode: boolean;
  setIsDriverMode: (v: boolean) => void;
  driverEarnings: number;
  setDriverEarnings: (e: number) => void;
  paymentMethod: string;
  setPaymentMethod: (m: string) => void;
  savedPlaces: SavedPlace[];
  userName: string;
  setUserName: (n: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const MOCK_DRIVERS: Driver[] = [
  {
    id: "1",
    name: "Raj Kumar",
    rating: 4.8,
    vehicle: "Honda Activa",
    vehicleNumber: "DL 4C AB 1234",
    vehicleType: "bike",
    eta: 3,
    photo: "RK",
  },
  {
    id: "2",
    name: "Suresh Yadav",
    rating: 4.9,
    vehicle: "Bajaj Auto",
    vehicleNumber: "DL 8S XY 5678",
    vehicleType: "auto",
    eta: 5,
    photo: "SY",
  },
  {
    id: "3",
    name: "Arjun Sharma",
    rating: 4.7,
    vehicle: "Swift Dzire",
    vehicleNumber: "DL 2C PQ 9012",
    vehicleType: "cab",
    eta: 7,
    photo: "AS",
  },
];

const SAVED_PLACES: SavedPlace[] = [
  { id: "1", name: "Office", address: "Connaught Place, New Delhi", icon: "briefcase" },
  { id: "2", name: "Home", address: "Sector 62, Noida", icon: "home" },
  { id: "3", name: "Gym", address: "DLF Cyber Hub, Gurgaon", icon: "activity" },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("cab");
  const [rideMode, setRideMode] = useState<RideMode>("economy");
  const [pickup, setPickup] = useState("Connaught Place, New Delhi");
  const [destination, setDestination] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState(180);
  const [estimatedTime, setEstimatedTime] = useState(12);
  const [assignedDriver, setAssignedDriver] = useState<Driver | null>(null);
  const [rideHistory, setRideHistory] = useState<Ride[]>([]);
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverEarnings, setDriverEarnings] = useState(1840);
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [userName, setUserName] = useState("Aarav");

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem("rideHistory");
      if (stored) setRideHistory(JSON.parse(stored));
    } catch {}
  };

  const addRideToHistory = async (ride: Ride) => {
    const updated = [ride, ...rideHistory].slice(0, 20);
    setRideHistory(updated);
    try {
      await AsyncStorage.setItem("rideHistory", JSON.stringify(updated));
    } catch {}
  };

  return (
    <AppContext.Provider
      value={{
        screen,
        setScreen,
        selectedVehicle,
        setSelectedVehicle,
        rideMode,
        setRideMode,
        pickup,
        setPickup,
        destination,
        setDestination,
        estimatedPrice,
        setEstimatedPrice,
        estimatedTime,
        setEstimatedTime,
        assignedDriver,
        setAssignedDriver,
        rideHistory,
        addRideToHistory,
        isDriverMode,
        setIsDriverMode,
        driverEarnings,
        setDriverEarnings,
        paymentMethod,
        setPaymentMethod,
        savedPlaces: SAVED_PLACES,
        userName,
        setUserName,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export { MOCK_DRIVERS };
