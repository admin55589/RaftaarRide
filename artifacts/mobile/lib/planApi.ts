import { BASE_URL } from "@/lib/api";

export interface DriverPlanStatus {
  planType: string | null;
  planBilling: string | null;
  planStartAt: string | null;
  planEndAt: string | null;
  isTrial: boolean;
  trialUsed: boolean;
  isActive: boolean;
  daysLeft: number;
  canGoOnline: boolean;
}

async function safeFetch(url: string, options: RequestInit): Promise<{ data: any; ok: boolean; status: number }> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err: any) {
    throw new Error("Internet connection check karein aur dobara try karein.");
  }
  let text = "";
  try { text = await res.text(); } catch { throw new Error("Server se response nahi mila."); }
  if (!text.trim()) throw new Error("Server khaali response de raha hai.");
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Server response invalid hai."); }
  return { data, ok: res.ok, status: res.status };
}

export const planApi = {
  getPlan: async (token: string): Promise<DriverPlanStatus> => {
    const { data, ok } = await safeFetch(`${BASE_URL}driver-auth/plan`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!ok) throw new Error(data?.message || "Plan info nahi mili");
    return data as DriverPlanStatus;
  },

  startTrial: async (token: string): Promise<{ success: boolean; plan: DriverPlanStatus }> => {
    const { data, ok } = await safeFetch(`${BASE_URL}driver-auth/plan/start-trial`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!ok) throw new Error(data?.message || "Trial shuru nahi ho saka");
    return data;
  },

  subscribe: async (
    token: string,
    vehicleType: string,
    billing: "daily" | "monthly"
  ): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> => {
    const { data, ok } = await safeFetch(`${BASE_URL}driver-auth/plan/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleType, billing }),
    });
    if (!ok) throw new Error(data?.message || "Order create nahi hua");
    return data;
  },

  activate: async (
    token: string,
    params: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      vehicleType: string;
      billing: "daily" | "monthly";
    }
  ): Promise<{ success: boolean; plan: DriverPlanStatus }> => {
    const { data, ok } = await safeFetch(`${BASE_URL}driver-auth/plan/activate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!ok) throw new Error(data?.message || "Plan activate nahi hua");
    return data;
  },
};
