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

async function sendSmsOtp(phone: string, otp: string): Promise<{ sent: boolean; dev: boolean }> {
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  const msg91Key = process.env.MSG91_API_KEY;
  const msg91Template = process.env.MSG91_TEMPLATE_ID;

  // Strip country code if present
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

  if (msg91Key && msg91Template) {
    try {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { authkey: msg91Key, "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: msg91Template,
          short_url: "0",
          mobiles: `91${digits}`,
          otp,
        }),
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

  // Dev fallback — no SMS key configured
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

    const { sent, dev } = await sendSmsOtp(phone, otp);

    res.json({
      message: sent ? "OTP aapke phone pe bhej diya gaya" : "OTP ready (dev mode)",
      isNewUser,
      // Return OTP only in dev mode (no SMS key configured)
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
      res.status(400).json({ message: "OTP not found. Please request again." });
      return;
    }

    if (user.otpCode !== otp) {
      res.status(400).json({ message: "Invalid OTP" });
      return;
    }

    if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
      res.status(400).json({ message: "OTP has expired. Please request again." });
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
