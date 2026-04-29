const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface PaymentVerifyResult {
  success: boolean;
  paymentId?: string;
  message?: string;
}

async function safeFetch(url: string, options: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err: any) {
    const msg = err?.message ?? "";
    if (msg.includes("Network request failed") || msg.includes("Failed to fetch") || msg.includes("fetch failed")) {
      throw new Error("Internet connection check karein aur dobara try karein.");
    }
    throw new Error("Server se connect nahi ho pa raha. Dobara try karein.");
  }

  let text = "";
  try {
    text = await res.text();
  } catch {
    throw new Error("Server se response nahi mila. Dobara try karein.");
  }

  if (!text || !text.trim()) {
    throw new Error("Server khaali response de raha hai. Dobara try karein.");
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (res.status >= 500) throw new Error("Server error ho gayi. Thodi der baad try karein.");
    throw new Error("Server response invalid hai. Dobara try karein.");
  }

  return { data, ok: res.ok, status: res.status };
}

export const paymentApi = {
  createOrder: async (amountInRupees: number): Promise<RazorpayOrder> => {
    const { data, ok } = await safeFetch(`${BASE_URL}/payment/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountInRupees, currency: "INR" }),
    });
    if (!ok) throw new Error(data?.message || "Order creation failed");
    return data as RazorpayOrder;
  },

  verifyPayment: async (params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<PaymentVerifyResult> => {
    const { data } = await safeFetch(`${BASE_URL}/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return data as PaymentVerifyResult;
  },
};
