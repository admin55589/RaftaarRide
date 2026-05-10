import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  globalRateLimiter,
  otpRateLimiter,
  loginRateLimiter,
  adminLoginRateLimiter,
  registerRateLimiter,
} from "./middlewares/rateLimiter";

const app: Express = express();

const IS_DEV = process.env.NODE_ENV !== "production";

/* ─── CORS ──────────────────────────────────────────────────────────────
 * Dev  : allow everything (localhost, Replit preview, Expo)
 * Prod : BUILT_IN_ORIGINS (always allowed) + ALLOWED_ORIGINS env var.
 *        Add custom domains in Railway:
 *        ALLOWED_ORIGINS=https://admin.raftaarride.com
 *
 * NOTE: React Native mobile app is NOT a browser — it is never
 *       subject to CORS. Only the web admin panel needs this.
 * ─────────────────────────────────────────────────────────────────────── */

/** These origins are always allowed in production — no env var needed. */
const BUILT_IN_ORIGINS = [
  "https://raftaar-ride.vercel.app",
  "https://raftaarride-admin.vercel.app",
];

function buildCorsOrigin(): cors.CorsOptions["origin"] {
  if (IS_DEV) return true;

  const raw = process.env.ALLOWED_ORIGINS ?? "";
  const envList = raw.split(",").map((o) => o.trim()).filter(Boolean);
  const allowList = [...new Set([...BUILT_IN_ORIGINS, ...envList])];

  if (!raw.trim()) {
    logger.info({ allowList }, "ALLOWED_ORIGINS not set — using built-in default origins. Add custom domains via ALLOWED_ORIGINS on Railway.");
  }

  return (origin, callback) => {
    if (!origin) { callback(null, true); return; }
    if (allowList.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin }, "[CORS] Blocked request from unknown origin");
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    }
  };
}

/* ─── Helmet — Security Headers ─────────────────────────────────────────
 * Adds: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
 *       Strict-Transport-Security (HSTS), Referrer-Policy, etc.
 * Customised: Razorpay + Google Maps scripts allowed in CSP
 * ─────────────────────────────────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://checkout.razorpay.com",
          "https://maps.googleapis.com",
          "https://maps.gstatic.com",
        ],
        frameSrc: ["'self'", "https://api.razorpay.com"],
        imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com"],
        connectSrc: [
          "'self'",
          "https://exp.host",
          "https://api.razorpay.com",
          "https://maps.googleapis.com",
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ origin: buildCorsOrigin(), credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

/* ─── Rate Limiters (applied BEFORE router — cannot be bypassed) ──────── */
app.use("/api", globalRateLimiter);

app.post("/api/auth/send-otp",             otpRateLimiter);
app.post("/api/auth/forgot-password",      otpRateLimiter);
app.post("/api/driver-auth/forgot-password", otpRateLimiter);

app.post("/api/auth/verify-otp",           loginRateLimiter);
app.post("/api/auth/reset-password",       loginRateLimiter);
app.post("/api/driver-auth/reset-password", loginRateLimiter);

app.post("/api/auth/login",                loginRateLimiter);
app.post("/api/driver-auth/login",         loginRateLimiter);

app.post("/api/auth/register",             registerRateLimiter);
app.post("/api/driver-auth/register",      registerRateLimiter);

app.post("/api/admin/login",               adminLoginRateLimiter);
app.post("/api/admin/firebase-verify",     adminLoginRateLimiter);

/* ─── CORS error handler ─────────────────────────────────────────────── */
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err.message?.startsWith("CORS:")) {
    res.status(403).json({ error: "CORS policy violation", message: err.message });
    return;
  }
  next(err);
});

app.use("/api/assets", express.static(path.join(process.cwd(), "public")));
app.use("/api", router);

export default app;
