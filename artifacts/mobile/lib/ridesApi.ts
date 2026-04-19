const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
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

export interface CreateRideParams {
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleType: string;
  rideMode: string;
  price: number;
  distanceKm?: number;
}

export type RideStatus = "searching" | "accepted" | "arrived" | "onRide" | "completed" | "cancelled";

export const ridesApi = {
  async createRide(token: string, params: CreateRideParams): Promise<{ rideId: number; ride: RideRecord }> {
    return authFetch<{ success: boolean; rideId: number; ride: RideRecord }>("/rides", token, {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  async updateStatus(
    token: string,
    rideId: number,
    status: RideStatus,
    driverRating?: number
  ): Promise<RideRecord> {
    const data = await authFetch<{ success: boolean; ride: RideRecord }>(`/rides/${rideId}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status, driverRating }),
    });
    return data.ride;
  },

  async getMyRides(token: string): Promise<RideRecord[]> {
    const data = await authFetch<{ success: boolean; rides: RideRecord[] }>("/rides/my", token, {
      method: "GET",
    });
    return data.rides;
  },
};
