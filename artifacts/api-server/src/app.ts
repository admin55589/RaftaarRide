import express, { type Express } from "express";
import cors from "cors";
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

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

app.use("/api", globalRateLimiter);

// OTP bhejne wale sab endpoints — phone ke hisaab se 3/10min
app.post("/api/auth/send-otp", otpRateLimiter);
app.post("/api/auth/forgot-password", otpRateLimiter);
app.post("/api/driver-auth/forgot-password", otpRateLimiter);

// OTP verify — brute-force se bachao (IP + 10 attempts/15min)
app.post("/api/auth/verify-otp", loginRateLimiter);
app.post("/api/auth/reset-password", loginRateLimiter);
app.post("/api/driver-auth/reset-password", loginRateLimiter);

// Login — IP ke hisaab se 10 attempts/15min
app.post("/api/auth/login", loginRateLimiter);
app.post("/api/driver-auth/login", loginRateLimiter);

// Registration — IP ke hisaab se 5/hour
app.post("/api/auth/register", registerRateLimiter);
app.post("/api/driver-auth/register", registerRateLimiter);

// Admin login — sabse strict: 5 attempts/hour per IP
app.post("/api/admin/login", adminLoginRateLimiter);
app.post("/api/admin/firebase-verify", adminLoginRateLimiter);

app.use("/api/assets", express.static(path.join(process.cwd(), "public")));
app.use("/api", router);

export default app;
