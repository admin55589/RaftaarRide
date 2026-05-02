const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "https://workspaceapi-server-production-2e22.up.railway.app/api";
})();

async function authFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data as T;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  address: string;
}

export interface RideRecord {
  id: number;
  userId: number;
  driverId: number | null;
  pickup: string;
  pickupLat: string | null;
  pickupLng: string | null;
  destination: string;
  dropLat: string | null;
  dropLng: string | null;
  vehicleType: string;
  rideMode: string;
  price: string;
  distanceKm: string | null;
  status: string;
  createdAt: string;
}

export type PaymentMethod = "Cash" | "UPI" | "Card" | "RaftaarWallet";

export interface CreateRideParams {
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleType: string;
  rideMode: string;
  price: number;
  distanceKm?: number;
  paymentMethod?: PaymentMethod;
  promoCode?: string;
  discountAmount?: number;
  originalPrice?: number;
}

export type RideStatus = "searching" | "accepted" | "arrived" | "onRide" | "completed" | "cancelled";

export interface DriverInfo {
  id: number;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  rating: string | number;
  eta?: number;
}

export const ridesApi = {
  async createRide(token: string, params: CreateRideParams): Promise<{ rideId: number; ride: RideRecord; driver: DriverInfo | null; message: string }> {
    return authFetch<{ success: boolean; rideId: number; ride: RideRecord; driver: DriverInfo | null; message: string }>("/rides", token, {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  async getRide(token: string, rideId: number): Promise<{ ride: RideRecord; driver: DriverInfo | null }> {
    return authFetch<{ success: boolean; ride: RideRecord; driver: DriverInfo | null }>(`/rides/${rideId}`, token, {
      method: "GET",
    });
  },

  async cancelRide(token: string, rideId: number, cancelReason?: string): Promise<{ ride: RideRecord }> {
    return authFetch<{ success: boolean; ride: RideRecord }>(`/rides/${rideId}/cancel`, token, {
      method: "POST",
      body: JSON.stringify({ cancelReason }),
    });
  },

  async updateStatus(token: string, rideId: number, status: RideStatus, driverRating?: number, paymentMethod?: PaymentMethod): Promise<RideRecord> {
    const data = await authFetch<{ success: boolean; ride: RideRecord }>(`/rides/${rideId}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status, driverRating, paymentMethod }),
    });
    return data.ride;
  },

  async getMyRides(token: string): Promise<RideRecord[]> {
    const data = await authFetch<{ success: boolean; rides: RideRecord[] }>("/rides/my", token, { method: "GET" });
    return data.rides;
  },
};
