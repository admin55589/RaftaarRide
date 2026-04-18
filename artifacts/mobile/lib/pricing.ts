export const ADMIN_COMMISSION_RATE = 0.067;
export const WAITING_CHARGE_PER_MIN = 0.5;

export interface VehiclePricing {
  baseFare: number;
  perKm: number;
  perMin: number;
  minFare: number;
  rapidoBaseFare: number;
  rapidoPerKm: number;
  label: string;
  emoji: string;
}

export const VEHICLE_PRICING: Record<string, VehiclePricing> = {
  bike: {
    baseFare: 12,
    perKm: 3.0,
    perMin: WAITING_CHARGE_PER_MIN,
    minFare: 25,
    rapidoBaseFare: 15,
    rapidoPerKm: 3.5,
    label: "Bike",
    emoji: "🏍️",
  },
  auto: {
    baseFare: 18,
    perKm: 9.0,
    perMin: WAITING_CHARGE_PER_MIN,
    minFare: 40,
    rapidoBaseFare: 20,
    rapidoPerKm: 11.0,
    label: "Auto",
    emoji: "🛺",
  },
  cab: {
    baseFare: 35,
    perKm: 12.0,
    perMin: WAITING_CHARGE_PER_MIN,
    minFare: 80,
    rapidoBaseFare: 45,
    rapidoPerKm: 15.0,
    label: "Cab",
    emoji: "🚗",
  },
};

export function calculateFare(
  vehicleType: string,
  distanceKm: number,
  waitingMinutes: number = 0,
  rideModeMultiplier: number = 1
): {
  baseFare: number;
  distanceCharge: number;
  waitingCharge: number;
  subtotal: number;
  adminCommission: number;
  driverEarning: number;
  total: number;
  rapidoPrice: number;
  savings: number;
  savingsPct: number;
} {
  const pricing = VEHICLE_PRICING[vehicleType] ?? VEHICLE_PRICING.cab;

  const baseFare = pricing.baseFare;
  const distanceCharge = pricing.perKm * distanceKm;
  const waitingCharge = pricing.perMin * waitingMinutes;
  const subtotal = Math.max(
    Math.round((baseFare + distanceCharge + waitingCharge) * rideModeMultiplier),
    pricing.minFare
  );

  const adminCommission = Math.round(subtotal * ADMIN_COMMISSION_RATE);
  const driverEarning = subtotal - adminCommission;

  const rapidoPrice = Math.round(pricing.rapidoBaseFare + pricing.rapidoPerKm * distanceKm);
  const savings = rapidoPrice - subtotal;
  const savingsPct = Math.round((savings / rapidoPrice) * 100);

  return {
    baseFare,
    distanceCharge: Math.round(distanceCharge),
    waitingCharge: Math.round(waitingCharge),
    subtotal,
    adminCommission,
    driverEarning,
    total: subtotal,
    rapidoPrice,
    savings,
    savingsPct,
  };
}

export function getRideModeMultiplier(rideMode: string): number {
  switch (rideMode) {
    case "economy": return 1.0;
    case "fast": return 1.25;
    case "premium": return 1.55;
    default: return 1.0;
  }
}

export const DEFAULT_DISTANCE_KM = 8.2;
