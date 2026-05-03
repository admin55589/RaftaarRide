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

// 2Factor.in se OTP SMS bhejo (cheapest — ₹0.12-0.18/SMS)
async function twoFactorSendOtp(phone: string, otp: string): Promise<boolean> {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) return false;
  const cleanPhone = phone.replace(/\D/g, "").slice(-10);
  try {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${cleanPhone}/${otp}`;
    const res = await fetch(url);
    const data = (await res.json()) as { Status: string; Details: string };
    if (data.Status === "Success") {
      console.log(`[OTP][2Factor] SMS sent to ${cleanPhone}, SessionId: ${data.Details}`);
      return true;
    }
    console.error("[OTP][2Factor] Failed:", JSON.stringify(data));
  } catch (err) {
    console.error("[OTP][2Factor] Error:", err);
  }
  return false;
}

// OTP bhejo — 2Factor.in primary, dev console fallback
async function sendSmsOtp(phone: string, otp: string): Promise<{ sent: boolean; dev: boolean }> {
  const sent = await twoFactorSendOtp(phone, otp);
  if (sent) return { sent: true, dev: false };

  // Dev fallback — OTP console mein dikhao
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

    if (user.status === "blocked") {
      res.status(403).json({ message: "Aapka account block kar diya gaya hai. Support se contact karein." });
      return;
    }
    if (user.status === "suspended") {
      res.status(403).json({ message: "Aapka account suspend hai. Support se contact karein." });
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
      const existingUser = existing[0];
      if (existingUser.status === "blocked") {
        res.status(403).json({ message: "Aapka account block kar diya gaya hai. Support se contact karein." });
        return;
      }
      if (existingUser.status === "suspended") {
        res.status(403).json({ message: "Aapka account suspend hai. Support se contact karein." });
        return;
      }
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

    const { sent, dev } = await sendSmsOtp(phone, otp);

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

    if (user.status === "blocked") {
      res.status(403).json({ message: "Aapka account block kar diya gaya hai. Support se contact karein." });
      return;
    }
    if (user.status === "suspended") {
      res.status(403).json({ message: "Aapka account suspend hai. Support se contact karein." });
      return;
    }

    if (user.otpCode !== otp) {
      res.status(400).json({ message: "OTP galat hai" });
      return;
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
