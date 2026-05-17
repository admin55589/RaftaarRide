import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? "",
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
});

if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET environment variable is required");
const JWT_SECRET = process.env.SESSION_SECRET;

/* Minimal auth guard — ensures caller has a valid JWT (user or driver) */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch { res.status(401).json({ success: false, message: "Invalid token" }); }
}

router.post("/payment/create-order", requireAuth, async (req: Request, res: Response) => {
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
    req.log.error({ err }, "[Razorpay] create-order error");
    res.status(500).json({ message: "Order creation failed", error: err?.message });
  }
});

router.post("/payment/verify", requireAuth, (req: Request, res: Response) => {
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
