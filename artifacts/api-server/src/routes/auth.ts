import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const FIREBASE_API_KEY = "AIzaSyBE3Uy6XvWjtpccm92bPDVNK0YFRKmV4fI";

// Send OTP via Firebase Phone Auth REST API — returns sessionInfo on success
async function firebaseSendOtp(phone: string): Promise<string | null> {
  const appCheckToken = process.env.FIREBASE_APP_CHECK_TOKEN;
  if (!appCheckToken) return null;

  // Ensure E.164 format
  const e164 = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: e164, appCheckToken }),
      }
    );
    const data = (await res.json()) as { sessionInfo?: string; error?: { message: string } };
    if (data.sessionInfo) {
      console.log(`[OTP][Firebase] SMS sent to ${phone}`);
      return data.sessionInfo;
    }
    console.error("[OTP][Firebase] Failed:", data.error?.message);
  } catch (err) {
    console.error("[OTP][Firebase] Error:", err);
  }
  return null;
}

// Verify OTP via Firebase Phone Auth REST API
async function firebaseVerifyOtp(sessionInfo: string, code: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionInfo, code }),
      }
    );
    const data = (await res.json()) as { idToken?: string; error?: { message: string } };
    if (data.idToken) return true;
    console.error("[OTP][Firebase] Verify failed:", data.error?.message);
  } catch (err) {
    console.error("[OTP][Firebase] Verify error:", err);
  }
  return false;
}

async function sendSmsOtp(phone: string, otp: string): Promise<{ sent: boolean; dev: boolean; sessionInfo?: string }> {
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  const msg91Key = process.env.MSG91_API_KEY;
  const msg91Template = process.env.MSG91_TEMPLATE_ID;

  // 1. Try Firebase Phone Auth (real SMS via Google)
  const sessionInfo = await firebaseSendOtp(phone);
  if (sessionInfo) return { sent: true, dev: false, sessionInfo };

  // 2. Try Fast2SMS
  const digits = phone.replace(/^\+91/, "").replace(/^91/, "").replace(/\D/g, "");
  if (fast2smsKey) {
    try {
      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${fast2smsKey}&route=otp&variables_values=${otp}&numbers=${digits}`;
      const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
      const data = (await res.json()) as { return: boolean; message?: string[] };
      if (data.return) {
        console.log(`[OTP][Fast2SMS] Sent to ${phone}`);
        return { sent: true, dev: false };
      }
      console.error("[OTP][Fast2SMS] Failed:", data.message);
    } catch (err) {
      console.error("[OTP][Fast2SMS] Error:", err);
    }
  }

  // 3. Try MSG91
  if (msg91Key && msg91Template) {
    try {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { authkey: msg91Key, "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: msg91Template, short_url: "0", mobiles: `91${digits}`, otp }),
      });
      const data = (await res.json()) as { type: string };
      if (data.type === "success") {
        console.log(`[OTP][MSG91] Sent to ${phone}`);
        return { sent: true, dev: false };
      }
      console.error("[OTP][MSG91] Failed:", data);
    } catch (err) {
      console.error("[OTP][MSG91] Error:", err);
    }
  }

  // 4. Dev fallback
  console.log(`[OTP][DEV] Phone: ${phone} → OTP: ${otp}`);
  return { sent: false, dev: true };
}

router.post("/auth/register", async (req: Request, res: Response) => {
  const { name, phone, email, password, gender } = req.body as {
    name: string;
    phone: string;
    email?: string;
    password: string;
    gender?: string;
  };

  if (!name || !phone || !password) {
    res.status(400).json({ message: "Name, phone and password are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ message: "Password must be at least 6 characters" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ message: "Phone number already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db
      .insert(usersTable)
      .values({
        name,
        phone,
        email: email || null,
        passwordHash,
        gender: gender || null,
        isVerified: false,
        status: "active",
      })
      .returning();

    const token = jwt.sign(
      { userId: user.id, phone: user.phone, role: "user" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        photoUrl: user.photoUrl ?? null,
        gender: user.gender ?? null,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { phone, email, password } = req.body as {
    phone?: string;
    email?: string;
    password: string;
  };

  if ((!phone && !email) || !password) {
    res.status(400).json({ message: "Phone/email and password are required" });
    return;
  }

  try {
    const conditions = [];
    if (phone) conditions.push(eq(usersTable.phone, phone));
    if (email) conditions.push(eq(usersTable.email, email));

    const [user] = await db
      .select()
      .from(usersTable)
      .where(or(...conditions))
      .limit(1);

    if (!user || !user.passwordHash) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, phone: user.phone, role: "user" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        photoUrl: user.photoUrl ?? null,
        gender: user.gender ?? null,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/auth/send-otp", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone: string };

  if (!phone) {
    res.status(400).json({ message: "Phone number is required" });
    return;
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    const isNewUser = existing.length === 0;

    if (!isNewUser) {
      await db
        .update(usersTable)
        .set({ otpCode: otp, otpExpiresAt: expiresAt })
        .where(eq(usersTable.phone, phone));
    } else {
      await db.insert(usersTable).values({
        name: "User",
        phone,
        otpCode: otp,
        otpExpiresAt: expiresAt,
        isVerified: false,
        status: "active",
      });
    }

    const { sent, dev, sessionInfo } = await sendSmsOtp(phone, otp);

    // If Firebase sent SMS, overwrite otpCode with sessionInfo prefix
    if (sessionInfo) {
      await db.update(usersTable)
        .set({ otpCode: `firebase:${sessionInfo}`, otpExpiresAt: expiresAt })
        .where(eq(usersTable.phone, phone));
    }

    res.json({
      message: sent ? "OTP aapke phone pe bhej diya gaya" : "OTP ready (dev mode)",
      isNewUser,
      otp: dev ? otp : undefined,
      smsSent: sent,
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

router.post("/auth/verify-otp", async (req: Request, res: Response) => {
  const { phone, otp, name } = req.body as {
    phone: string;
    otp: string;
    name?: string;
  };

  if (!phone || !otp) {
    res.status(400).json({ message: "Phone and OTP are required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    if (!user || !user.otpCode) {
      res.status(400).json({ message: "OTP nahi mila. Dobara request karo." });
      return;
    }

    if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
      res.status(400).json({ message: "OTP expire ho gaya. Dobara request karo." });
      return;
    }

    // Firebase sessionInfo verification
    if (user.otpCode.startsWith("firebase:")) {
      const sessionInfo = user.otpCode.slice("firebase:".length);
      const valid = await firebaseVerifyOtp(sessionInfo, otp);
      if (!valid) {
        res.status(400).json({ message: "OTP galat hai" });
        return;
      }
    } else {
      // Custom OTP verification
      if (user.otpCode !== otp) {
        res.status(400).json({ message: "OTP galat hai" });
        return;
      }
    }

    await db
      .update(usersTable)
      .set({
        otpCode: null,
        otpExpiresAt: null,
        isVerified: true,
        name: name || user.name,
      })
      .where(eq(usersTable.phone, phone));

    const token = jwt.sign(
      { userId: user.id, phone: user.phone, role: "user" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);

    res.json({
      token,
      user: {
        id: freshUser?.id ?? user.id,
        name: name || freshUser?.name || user.name,
        phone: user.phone,
        email: freshUser?.email ?? user.email,
        photoUrl: freshUser?.photoUrl ?? null,
        gender: freshUser?.gender ?? null,
        isVerified: true,
      },
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ message: "OTP verification failed" });
  }
});

router.post("/auth/logout", (_req: Request, res: Response) => {
  res.json({ message: "Logged out successfully" });
});

export default router;
