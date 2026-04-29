import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { ridesApi, type RideRecord } from "@/lib/ridesApi";

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
  phone?: string;
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
  status?: string;
}

export interface GeoCoords {
  lat: number;
  lng: number;
}

const VEHICLE_DEFAULTS: Record<VehicleType, { name: string; vehicle: string; vehicleNumber: string; photo: string; rating: number }> = {
  bike: { name: "Raj Kumar", vehicle: "Honda Activa", vehicleNumber: "DL 4C AB 1234", photo: "RK", rating: 4.8 },
  auto: { name: "Suresh Yadav", vehicle: "Bajaj Auto", vehicleNumber: "DL 8S XY 5678", photo: "SY", rating: 4.9 },
  cab:  { name: "Arjun Sharma", vehicle: "Swift Dzire", vehicleNumber: "DL 2C PQ 9012", photo: "AS", rating: 4.7 },
};

function serverRideToLocal(record: RideRecord & { driver?: any }): Ride {
  const vType = (record.vehicleType as VehicleType) || "cab";
  const defaults = VEHICLE_DEFAULTS[vType] ?? VEHICLE_DEFAULTS.cab;
  const d = record.driver;

  const driver: Driver = d
    ? {
        id: String(d.id),
        name: d.name ?? defaults.name,
        phone: d.phone ?? undefined,
        rating: d.rating != null
          ? (typeof d.rating === "number" ? d.rating : parseFloat(String(d.rating)) || defaults.rating)
          : defaults.rating,
        vehicle: vType === "bike" ? "Honda Activa" : vType === "auto" ? "Bajaj Auto" : "Swift Dzire",
        vehicleNumber: d.vehicleNumber ?? defaults.vehicleNumber,
        vehicleType: (d.vehicleType as VehicleType) ?? vType,
        eta: 5,
        photo: d.name
          ? d.name.split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase()
          : defaults.photo,
      }
    : { id: "0", ...defaults, vehicleType: vType, eta: 5 };

  const distKm = record.distanceKm ? parseFloat(record.distanceKm) : 8;

  return {
    id: String(record.id),
    pickup: record.pickup,
    destination: record.destination,
    vehicleType: vType,
    rideMode: (record.rideMode as RideMode) || "economy",
    price: parseFloat(record.price) || 0,
    duration: Math.max(5, Math.round(distKm * 3)),
    distance: `${distKm.toFixed(1)} km`,
    date: record.createdAt,
    driver,
    status: record.status,
  };
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
  pickupCoords: GeoCoords | null;
  setPickupCoords: (c: GeoCoords | null) => void;
  destination: string;
  setDestination: (d: string) => void;
  dropCoords: GeoCoords | null;
  setDropCoords: (c: GeoCoords | null) => void;
  currentLocationAddress: string;
  setCurrentLocationAddress: (addr: string) => void;
  estimatedPrice: number;
  setEstimatedPrice: (p: number) => void;
  estimatedTime: number;
  setEstimatedTime: (t: number) => void;
  estimatedDistanceKm: number;
  setEstimatedDistanceKm: (d: number) => void;
  assignedDriver: Driver | null;
  setAssignedDriver: (d: Driver | null) => void;
  rideHistory: Ride[];
  addRideToHistory: (r: Ride) => void;
  refreshHistoryFromServer: (token: string) => Promise<void>;
  isHistoryLoading: boolean;
  isDriverMode: boolean;
  setIsDriverMode: (v: boolean) => void;
  driverEarnings: number;
  setDriverEarnings: (e: number) => void;
  paymentMethod: string;
  setPaymentMethod: (m: string) => void;
  savedPlaces: SavedPlace[];
  userName: string;
  setUserName: (n: string) => void;
  currentRideId: number | null;
  setCurrentRideId: (id: number | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const MOCK_DRIVERS: Driver[] = [
  { id: "1", name: "Raj Kumar", rating: 4.8, vehicle: "Honda Activa", vehicleNumber: "DL 4C AB 1234", vehicleType: "bike", eta: 3, photo: "RK" },
  { id: "2", name: "Suresh Yadav", rating: 4.9, vehicle: "Bajaj Auto", vehicleNumber: "DL 8S XY 5678", vehicleType: "auto", eta: 5, photo: "SY" },
  { id: "3", name: "Arjun Sharma", rating: 4.7, vehicle: "Swift Dzire", vehicleNumber: "DL 2C PQ 9012", vehicleType: "cab", eta: 7, photo: "AS" },
];

const SAVED_PLACES: SavedPlace[] = [
  { id: "1", name: "Office", address: "Connaught Place, New Delhi", icon: "briefcase" },
  { id: "2", name: "Home", address: "Sector 62, Noida", icon: "home" },
  { id: "3", name: "Gym", address: "DLF Cyber Hub, Gurgaon", icon: "activity" },
];

const HISTORY_CACHE_KEY = "rideHistory_v2";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("cab");
  const [rideMode, setRideMode] = useState<RideMode>("economy");
  const [pickup, setPickup] = useState("Connaught Place, New Delhi");
  const [pickupCoords, setPickupCoords] = useState<GeoCoords | null>(null);
  const [destination, setDestination] = useState("");
  const [dropCoords, setDropCoords] = useState<GeoCoords | null>(null);
  const [currentLocationAddress, setCurrentLocationAddress] = useState("Connaught Place, New Delhi");
  const [estimatedPrice, setEstimatedPrice] = useState(180);
  const [estimatedTime, setEstimatedTime] = useState(12);
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState(8.2);
  const [assignedDriver, setAssignedDriver] = useState<Driver | null>(null);
  const [rideHistory, setRideHistory] = useState<Ride[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverEarnings, setDriverEarnings] = useState(1840);
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [userName, setUserName] = useState("Aarav");
  const [currentRideId, setCurrentRideId] = useState<number | null>(null);

  useEffect(() => {
    loadCachedHistory();
  }, []);

  const loadCachedHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_CACHE_KEY);
      if (stored) setRideHistory(JSON.parse(stored));
    } catch {}
  };

  const refreshHistoryFromServer = async (token: string) => {
    if (!token) return;
    setIsHistoryLoading(true);
    try {
      const records = await ridesApi.getMyRides(token) as (RideRecord & { driver?: any })[];
      const mapped = records
        .filter((r) => ["completed", "accepted", "onRide", "arrived", "cancelled", "searching"].includes(r.status))
        .map(serverRideToLocal);
      setRideHistory(mapped);
      await AsyncStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(mapped));
    } catch {
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const addRideToHistory = async (ride: Ride) => {
    const updated = [ride, ...rideHistory.filter((r) => r.id !== ride.id)].slice(0, 50);
    setRideHistory(updated);
    try {
      await AsyncStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(updated));
    } catch {}
  };

  return (
    <AppContext.Provider
      value={{
        screen, setScreen,
        selectedVehicle, setSelectedVehicle,
        rideMode, setRideMode,
        pickup, setPickup,
        pickupCoords, setPickupCoords,
        destination, setDestination,
        dropCoords, setDropCoords,
        currentLocationAddress, setCurrentLocationAddress,
        estimatedPrice, setEstimatedPrice,
        estimatedTime, setEstimatedTime,
        estimatedDistanceKm, setEstimatedDistanceKm,
        assignedDriver, setAssignedDriver,
        rideHistory,
        addRideToHistory,
        refreshHistoryFromServer,
        isHistoryLoading,
        isDriverMode, setIsDriverMode,
        driverEarnings, setDriverEarnings,
        paymentMethod, setPaymentMethod,
        savedPlaces: SAVED_PLACES,
        userName, setUserName,
        currentRideId, setCurrentRideId,
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
