import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { driversTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

router.post("/driver-auth/register", async (req: Request, res: Response) => {
  const { name, phone, email, password, vehicleType, vehicleNumber, licenseNumber } = req.body as {
    name: string;
    phone: string;
    email: string;
    password: string;
    vehicleType: string;
    vehicleNumber: string;
    licenseNumber?: string;
  };

  if (!name || !phone || !email || !password || !vehicleType || !vehicleNumber) {
    res.status(400).json({ message: "Saari details required hain" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ message: "Password kam se kam 6 characters ka hona chahiye" });
    return;
  }

  const validVehicles = ["bike", "auto", "prime", "suv"];
  if (!validVehicles.includes(vehicleType)) {
    res.status(400).json({ message: "Invalid vehicle type" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(driversTable)
      .where(or(eq(driversTable.phone, phone), eq(driversTable.email, email)))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ message: "Yeh phone/email already registered hai" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [driver] = await db
      .insert(driversTable)
      .values({
        name,
        phone,
        email,
        passwordHash,
        vehicleType,
        vehicleNumber,
        licenseNumber: licenseNumber || null,
        status: "active",
        isOnline: false,
      })
      .returning();

    const token = jwt.sign(
      { driverId: driver.id, phone: driver.phone, role: "driver" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      token,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        photoUrl: driver.photoUrl ?? null,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        rating: driver.rating,
        totalEarnings: driver.totalEarnings,
        totalRides: driver.totalRides,
        status: driver.status,
        isOnline: driver.isOnline,
      },
    });
  } catch (err) {
    console.error("Driver register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/driver-auth/login", async (req: Request, res: Response) => {
  const { phone, email, password } = req.body as {
    phone?: string;
    email?: string;
    password: string;
  };

  if ((!phone && !email) || !password) {
    res.status(400).json({ message: "Phone/email aur password required hain" });
    return;
  }

  try {
    const conditions = [];
    if (phone) conditions.push(eq(driversTable.phone, phone));
    if (email) conditions.push(eq(driversTable.email, email));

    const [driver] = await db
      .select()
      .from(driversTable)
      .where(or(...conditions))
      .limit(1);

    if (!driver || !driver.passwordHash) {
      res.status(401).json({ message: "Phone/email ya password galat hai" });
      return;
    }

    const valid = await bcrypt.compare(password, driver.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Phone/email ya password galat hai" });
      return;
    }

    const token = jwt.sign(
      { driverId: driver.id, phone: driver.phone, role: "driver" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        photoUrl: driver.photoUrl ?? null,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        rating: driver.rating,
        totalEarnings: driver.totalEarnings,
        totalRides: driver.totalRides,
        status: driver.status,
        isOnline: driver.isOnline,
      },
    });
  } catch (err) {
    console.error("Driver login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.get("/driver-auth/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token required" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ message: "Driver token required" });
      return;
    }

    const [driver] = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.id, payload.driverId))
      .limit(1);

    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    res.json({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      photoUrl: driver.photoUrl ?? null,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      rating: driver.rating,
      totalEarnings: driver.totalEarnings,
      totalRides: driver.totalRides,
      status: driver.status,
      isOnline: driver.isOnline,
    });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});

router.patch("/driver-auth/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token required" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { driverId: number; role: string };
    if (payload.role !== "driver") {
      res.status(403).json({ message: "Driver token required" });
      return;
    }

    const { name, photoUrl } = req.body as { name?: string; photoUrl?: string | null };

    const updates: Partial<{ name: string; photoUrl: string | null }> = {};
    if (name !== undefined && name.trim()) updates.name = name.trim();
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: "Kuch update karne ke liye do" });
      return;
    }

    const [updated] = await db
      .update(driversTable)
      .set(updates)
      .where(eq(driversTable.id, payload.driverId))
      .returning();

    if (!updated) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    res.json({
      success: true,
      driver: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        photoUrl: updated.photoUrl ?? null,
        vehicleType: updated.vehicleType,
        vehicleNumber: updated.vehicleNumber,
        rating: updated.rating,
        totalEarnings: updated.totalEarnings,
        totalRides: updated.totalRides,
        status: updated.status,
        isOnline: updated.isOnline,
      },
    });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
