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
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data as T;
}

export interface RideRecord {
  id: number;
  userId: number;
  driverId: number | null;
  pickup: string;
  destination: string;
  vehicleType: string;
  rideMode: string;
  price: string;
  status: string;
  createdAt: string;
}

export interface CreateRideParams {
  pickup: string;
  destination: string;
  vehicleType: string;
  rideMode: string;
  price: number;
}

export const ridesApi = {
  async createRide(token: string, params: CreateRideParams): Promise<RideRecord> {
    const data = await authFetch<{ ride: RideRecord }>("/rides", token, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return data.ride;
  },

  async updateStatus(
    token: string,
    rideId: number,
    status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled",
    driverRating?: number
  ): Promise<RideRecord> {
    const data = await authFetch<{ ride: RideRecord }>(`/rides/${rideId}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status, driverRating }),
    });
    return data.ride;
  },

  async getMyRides(token: string): Promise<RideRecord[]> {
    const data = await authFetch<{ rides: RideRecord[] }>("/rides/my", token, {
      method: "GET",
    });
    return data.rides;
  },
};
