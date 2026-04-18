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

export const paymentApi = {
  createOrder: async (amountInRupees: number): Promise<RazorpayOrder> => {
    const res = await fetch(`${BASE_URL}/payment/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountInRupees, currency: "INR" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Order creation failed");
    return data as RazorpayOrder;
  },

  verifyPayment: async (params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<PaymentVerifyResult> => {
    const res = await fetch(`${BASE_URL}/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data as PaymentVerifyResult;
  },
};
