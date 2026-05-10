import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ridesApi, type RideRecord } from "@/lib/ridesApi";
import { API_BASE } from "@/lib/api";

/* Haversine straight-line distance (km) */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* Calculate road distance & time from two coordinate pairs */
export function calcRealDistance(
  pickupCoords: { lat: number; lng: number } | null,
  dropCoords: { lat: number; lng: number } | null
): { distanceKm: number; timeMin: number } | null {
  if (!pickupCoords || !dropCoords) return null;
  const straightLine = haversineKm(pickupCoords.lat, pickupCoords.lng, dropCoords.lat, dropCoords.lng);
  const roadFactor = 1.28; // Indian roads typically 25-35% longer than straight line (lower = less overestimate on short routes)
  const distanceKm = parseFloat((straightLine * roadFactor).toFixed(1));
  const avgSpeedKmh = 26; // avg urban speed Delhi/NCR
  const timeMin = Math.max(3, Math.round((distanceKm / avgSpeedKmh) * 60));
  return { distanceKm, timeMin };
}

export type RideMode = "economy" | "fast" | "premium";
export type VehicleType = "bike" | "auto" | "cab" | "prime" | "suv";
export type AppScreen =
  | "home"
  | "booking"
  | "searching"
  | "driver_assigned"
  | "live_tracking"
  | "payment"
  | "payment_success"
  | "driver_mode"
  | "profile"
  | "dispute_report"
  | "package_booking"
  | "support"
  | "raftaarPass";

export interface PassStatus {
  active: boolean;
  plan?: string;
  expiresAt?: string;
  freeCancelsUsed?: number;
  freeCancelsLimit?: number;
  freeCancelsRemaining?: number;
  passId?: number;
}

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
  bike:  { name: "Raj Kumar",    vehicle: "Honda Activa",  vehicleNumber: "DL 4C AB 1234", photo: "RK", rating: 4.8 },
  auto:  { name: "Suresh Yadav", vehicle: "Bajaj Auto",    vehicleNumber: "DL 8S XY 5678", photo: "SY", rating: 4.9 },
  cab:   { name: "Arjun Sharma", vehicle: "Swift Dzire",   vehicleNumber: "DL 2C PQ 9012", photo: "AS", rating: 4.7 },
  prime: { name: "Arjun Sharma", vehicle: "Swift Dzire",   vehicleNumber: "DL 2C PQ 9012", photo: "AS", rating: 4.7 },
  suv:   { name: "Vikram Singh", vehicle: "Toyota Innova", vehicleNumber: "DL 5C RS 3456", photo: "VS", rating: 4.8 },
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
        vehicle: vType === "bike" ? "Honda Activa" : vType === "auto" ? "Bajaj Auto" : vType === "suv" ? "Toyota Innova" : "Swift Dzire",
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
  isDistanceLoading: boolean;
  setIsDistanceLoading: (b: boolean) => void;
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
  finalPaymentPrice: number;
  setFinalPaymentPrice: (p: number) => void;
  fareBreakdown: { rideFare: number; platformFee: number; promoDiscount: number; promoCode: string; distanceKm: number; distanceCharge: number; waitingCharge: number } | null;
  setFareBreakdown: (b: { rideFare: number; platformFee: number; promoDiscount: number; promoCode: string; distanceKm: number; distanceCharge: number; waitingCharge: number } | null) => void;
  lastCompletedRideId: number | null;
  setLastCompletedRideId: (id: number | null) => void;
  lastCompletedDriverId: string | null;
  setLastCompletedDriverId: (id: string | null) => void;
  lastPaymentMethod: string;
  setLastPaymentMethod: (m: string) => void;
  surgeMultiplier: number;
  surgeReason: string | null;
  pendingDisputeRideId: number | null;
  setPendingDisputeRideId: (id: number | null) => void;
  referralEnabled: boolean;
  passStatus: PassStatus | null;
  refreshPassStatus: (token: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const MOCK_DRIVERS: Driver[] = [
  { id: "1", name: "Raj Kumar", rating: 4.8, vehicle: "Honda Activa", vehicleNumber: "DL 4C AB 1234", vehicleType: "bike", eta: 3, photo: "RK" },
  { id: "2", name: "Suresh Yadav", rating: 4.9, vehicle: "Bajaj Auto", vehicleNumber: "DL 8S XY 5678", vehicleType: "auto", eta: 5, photo: "SY" },
  { id: "3", name: "Arjun Sharma", rating: 4.7, vehicle: "Swift Dzire", vehicleNumber: "DL 2C PQ 9012", vehicleType: "prime", eta: 7, photo: "AS" },
];

const SAVED_PLACES: SavedPlace[] = [
  { id: "1", name: "Office", address: "Connaught Place, New Delhi", icon: "briefcase" },
  { id: "2", name: "Home", address: "Sector 62, Noida", icon: "home" },
  { id: "3", name: "Gym", address: "DLF Cyber Hub, Gurgaon", icon: "activity" },
];

const HISTORY_CACHE_KEY = "rideHistory_v2";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("prime");
  const [rideMode, setRideMode] = useState<RideMode>("economy");
  const [pickup, setPickup] = useState("Connaught Place, New Delhi");
  const [pickupCoords, setPickupCoords] = useState<GeoCoords | null>(null);
  const [destination, setDestination] = useState("");
  const [dropCoords, setDropCoords] = useState<GeoCoords | null>(null);
  const [currentLocationAddress, setCurrentLocationAddress] = useState("Connaught Place, New Delhi");
  const [estimatedPrice, setEstimatedPrice] = useState(180);
  const [estimatedTime, setEstimatedTime] = useState(12);
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState(8.2);
  const [isDistanceLoading, setIsDistanceLoading] = useState(false);
  
  const [assignedDriver, setAssignedDriver] = useState<Driver | null>(null);
  const [rideHistory, setRideHistory] = useState<Ride[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [driverEarnings, setDriverEarnings] = useState(1840);
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [userName, setUserName] = useState("Aarav");
  const [currentRideId, setCurrentRideId] = useState<number | null>(null);
  const [finalPaymentPrice, setFinalPaymentPrice] = useState<number>(0);
  const [fareBreakdown, setFareBreakdown] = useState<{ rideFare: number; platformFee: number; promoDiscount: number; promoCode: string; distanceKm: number; distanceCharge: number; waitingCharge: number } | null>(null);
  const [lastCompletedRideId, setLastCompletedRideId] = useState<number | null>(null);
  const [lastCompletedDriverId, setLastCompletedDriverId] = useState<string | null>(null);
  const [lastPaymentMethod, setLastPaymentMethod] = useState<string>("UPI");
  const [surgeMultiplier, setSurgeMultiplier] = useState<number>(1.0);
  const [surgeReason, setSurgeReason] = useState<string | null>(null);
  const [pendingDisputeRideId, setPendingDisputeRideId] = useState<number | null>(null);
  const [referralEnabled, setReferralEnabled] = useState<boolean>(true);
  const [passStatus, setPassStatus] = useState<PassStatus | null>(null);

  /* Fetch surge multiplier from API on mount */
  useEffect(() => {
    fetch(`${API_BASE}/surge`)
      .then(r => r.json())
      .then((d: { isActive: boolean; multiplier: number; reason: string | null }) => {
        if (d.isActive && d.multiplier > 1) {
          setSurgeMultiplier(d.multiplier);
          setSurgeReason(d.reason);
        }
      })
      .catch(() => {/* surge fetch fail = default 1x */});
  }, []);

  /* Fetch referral program config on mount — admin can toggle on/off */
  useEffect(() => {
    fetch(`${API_BASE}/auth/referral-config`)
      .then(r => r.json())
      .then((d: { enabled: boolean }) => { setReferralEnabled(d.enabled); })
      .catch(() => {/* referral config fetch fail = keep default true */});
  }, []);

  /* Auto-calculate real distance when both pickup + drop coords are available */
  useEffect(() => {
    if (!pickupCoords || !dropCoords) return;
    setIsDistanceLoading(true);
    /* Abort previous fetch if coords change rapidly */
    const controller = new AbortController();
    /* Safety net: never block the Book button for more than 10 seconds */
    const loadingTimeout = setTimeout(() => setIsDistanceLoading(false), 10000);
    /* Try Google Maps Directions API via server proxy (key never in client) */
    const origin = `${pickupCoords.lat},${pickupCoords.lng}`;
    const destination = `${dropCoords.lat},${dropCoords.lng}`;
    const url = `${API_BASE}/maps/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { routes?: Array<{ legs?: Array<{ distance?: { value: number }; duration?: { value: number } }> }> }) => {
        const leg = data?.routes?.[0]?.legs?.[0];
        if (leg?.distance?.value && leg?.duration?.value) {
          /* Always accept Directions API result — it is the authoritative road distance.
             BookingScreen shows a warning banner if distance looks suspiciously large. */
          const distKm = parseFloat((leg.distance.value / 1000).toFixed(1));
          const timeMin = Math.ceil(leg.duration.value / 60);
          setEstimatedDistanceKm(distKm);
          setEstimatedTime(timeMin);
        } else {
          /* No route found — fall back to haversine estimate */
          const result = calcRealDistance(pickupCoords, dropCoords);
          if (result) {
            setEstimatedDistanceKm(result.distanceKm);
            setEstimatedTime(result.timeMin);
          }
        }
        clearTimeout(loadingTimeout);
        setIsDistanceLoading(false);
      })
      .catch((err: unknown) => {
        /* Ignore aborted fetches (rapid coord changes) */
        if (err instanceof Error && err.name === "AbortError") return;
        /* Network/API error — fall back to haversine estimate */
        const result = calcRealDistance(pickupCoords, dropCoords);
        if (result) {
          setEstimatedDistanceKm(result.distanceKm);
          setEstimatedTime(result.timeMin);
        }
        clearTimeout(loadingTimeout);
        setIsDistanceLoading(false);
      });
    return () => {
      controller.abort();
      clearTimeout(loadingTimeout);
    };
  }, [pickupCoords, dropCoords]);

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

  const refreshPassStatus = async (token: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/pass/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as PassStatus & { success: boolean };
      if (data.success) setPassStatus(data);
    } catch {/* ignore — pass status is non-critical */}
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
        isDistanceLoading, setIsDistanceLoading,
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
        finalPaymentPrice, setFinalPaymentPrice,
        fareBreakdown, setFareBreakdown,
        lastCompletedRideId, setLastCompletedRideId,
        lastCompletedDriverId, setLastCompletedDriverId,
        lastPaymentMethod, setLastPaymentMethod,
        surgeMultiplier, surgeReason,
        pendingDisputeRideId, setPendingDisputeRideId,
        referralEnabled,
        passStatus,
        refreshPassStatus,
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
