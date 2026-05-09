import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";

function tooManyMsg(retryAfterMinutes: number) {
  return `Bahut zyada requests aa rahi hain. ${retryAfterMinutes} minute baad try karein.`;
}

function getIpKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? "127.0.0.1");
}

/**
 * OTP Rate Limiter — phone number ke hisaab se
 * Rule: ek phone pe 10 minute mein sirf 3 OTP
 * Covers: POST /auth/send-otp, /auth/forgot-password, /driver-auth/forgot-password
 */
export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  keyGenerator: (req: Request) => {
    const phone: string =
      (req.body as { phone?: string })?.phone?.replace(/\D/g, "").slice(-10) ?? "";
    if (phone.length === 10) return `otp:phone:${phone}`;
    return `otp:ip:${getIpKey(req)}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      message: "Bahut zyada OTP requests. 10 minute baad dobara try karein.",
      retryAfter: 10,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

/**
 * Login Rate Limiter — IP ke hisaab se
 * Rule: ek IP se 15 minute mein sirf 10 login/verify attempts
 * Covers: /auth/login, /driver-auth/login, /auth/verify-otp, /auth/reset-password
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => `login:${getIpKey(req)}`,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      message: tooManyMsg(15),
      retryAfter: 15,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

/**
 * Admin Login Rate Limiter — IP ke hisaab se (sabse strict)
 * Rule: ek IP se 1 ghante mein sirf 5 admin login attempts
 */
export const adminLoginRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: Request) => `admin-login:${getIpKey(req)}`,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      message: "Bahut zyada login attempts. 1 ghante baad try karein.",
      retryAfter: 60,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

/**
 * Registration Rate Limiter — IP ke hisaab se
 * Rule: ek IP se 1 ghante mein sirf 5 new accounts
 * Spam account creation se bachao
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: Request) => `register:${getIpKey(req)}`,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      message: "Bahut zyada registration attempts. 1 ghante baad try karein.",
      retryAfter: 60,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

/**
 * Global API Rate Limiter — sab endpoints ke liye
 * Rule: ek IP se 1 minute mein sirf 120 requests
 * General abuse se bachao
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req: Request) => `global:${getIpKey(req)}`,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      message: tooManyMsg(1),
      retryAfter: 1,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: (req: Request) => req.path === "/healthz",
});
