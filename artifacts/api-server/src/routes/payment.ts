import { Router, type IRouter, type Request, type Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";

const router: IRouter = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? "",
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
});

router.post("/payment/create-order", async (req: Request, res: Response) => {
  const { amount, currency = "INR", receipt } = req.body as {
    amount: number;
    currency?: string;
    receipt?: string;
  };

  if (!amount || amount <= 0) {
    res.status(400).json({ message: "Valid amount is required (in paise)" });
    return;
  }

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt: receipt ?? `rcpt_${Date.now()}`,
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    console.error("[Razorpay] create-order error:", err);
    res.status(500).json({ message: "Order creation failed", error: err?.message });
  }
});

router.post("/payment/verify", (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ success: false, message: "Missing payment fields" });
    return;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSig = crypto.createHmac("sha256", secret).update(body).digest("hex");

  if (expectedSig === razorpay_signature) {
    res.json({ success: true, paymentId: razorpay_payment_id });
  } else {
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
});

export default router;
