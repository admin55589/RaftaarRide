import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, driversTable, ridesTable } from "@workspace/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";
const ADMIN_EMAIL = "admin@raftaarride.com";
const ADMIN_PASSWORD = "admin123";

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

router.post("/admin/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }
  const token = jwt.sign({ role: "admin", email }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token, role: "admin" });
});

router.get("/admin/stats", authMiddleware, async (_req: Request, res: Response) => {
  const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const [totalDriversResult] = await db.select({ count: sql<number>`count(*)` }).from(driversTable);
  const [totalRidesResult] = await db.select({ count: sql<number>`count(*)` }).from(ridesTable);
  const [earningsResult] = await db.select({
    total: sql<number>`coalesce(sum(price::numeric), 0)`,
  }).from(ridesTable).where(eq(ridesTable.status, "completed"));

  const [activeDriversResult] = await db.select({ count: sql<number>`count(*)` })
    .from(driversTable)
    .where(eq(driversTable.status, "active"));

  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);

  const [ridesThisMonthResult] = await db.select({ count: sql<number>`count(*)` })
    .from(ridesTable)
    .where(gte(ridesTable.createdAt, thisMonthStart));

  const [earningsThisMonthResult] = await db.select({
    total: sql<number>`coalesce(sum(price::numeric), 0)`,
  }).from(ridesTable).where(
    and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, thisMonthStart))
  );

  const [avgRatingResult] = await db.select({
    avg: sql<number>`coalesce(avg(rating::numeric), 0)`,
  }).from(driversTable);

  res.json({
    totalRides: Number(totalRidesResult?.count ?? 0),
    totalUsers: Number(totalUsersResult?.count ?? 0),
    totalDrivers: Number(totalDriversResult?.count ?? 0),
    totalEarnings: Number(earningsResult?.total ?? 0),
    activeDrivers: Number(activeDriversResult?.count ?? 0),
    ridesThisMonth: Number(ridesThisMonthResult?.count ?? 0),
    earningsThisMonth: Number(earningsThisMonthResult?.total ?? 0),
    avgRating: Number(Number(avgRatingResult?.avg ?? 0).toFixed(1)),
  });
});

router.get("/admin/users", authMiddleware, async (_req: Request, res: Response) => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

  const usersWithRides = await Promise.all(
    users.map(async (user) => {
      const [ridesCount] = await db.select({ count: sql<number>`count(*)` })
        .from(ridesTable).where(eq(ridesTable.userId, user.id));
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        totalRides: Number(ridesCount?.count ?? 0),
        createdAt: user.createdAt.toISOString(),
      };
    })
  );

  res.json(usersWithRides);
});

router.get("/admin/drivers", authMiddleware, async (_req: Request, res: Response) => {
  const drivers = await db.select().from(driversTable).orderBy(desc(driversTable.createdAt));
  res.json(
    drivers.map((d) => ({
      id: d.id,
      name: d.name,
      email: d.email,
      phone: d.phone,
      vehicleType: d.vehicleType,
      vehicleNumber: d.vehicleNumber,
      rating: Number(d.rating),
      status: d.status,
      totalEarnings: Number(d.totalEarnings),
      totalRides: d.totalRides,
      createdAt: d.createdAt.toISOString(),
    }))
  );
});

router.get("/admin/rides", authMiddleware, async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };

  const rides = await db
    .select({
      id: ridesTable.id,
      userId: ridesTable.userId,
      driverId: ridesTable.driverId,
      userName: usersTable.name,
      driverName: driversTable.name,
      pickup: ridesTable.pickup,
      destination: ridesTable.destination,
      vehicleType: ridesTable.vehicleType,
      rideMode: ridesTable.rideMode,
      price: ridesTable.price,
      status: ridesTable.status,
      createdAt: ridesTable.createdAt,
    })
    .from(ridesTable)
    .leftJoin(usersTable, eq(ridesTable.userId, usersTable.id))
    .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
    .where(status ? eq(ridesTable.status, status) : undefined)
    .orderBy(desc(ridesTable.createdAt));

  res.json(
    rides.map((r) => ({
      id: r.id,
      userId: r.userId,
      driverId: r.driverId ?? null,
      userName: r.userName ?? "Unknown",
      driverName: r.driverName ?? null,
      pickup: r.pickup,
      destination: r.destination,
      vehicleType: r.vehicleType,
      rideMode: r.rideMode,
      price: Number(r.price),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.get("/admin/rides/recent", authMiddleware, async (_req: Request, res: Response) => {
  const rides = await db
    .select({
      id: ridesTable.id,
      userId: ridesTable.userId,
      driverId: ridesTable.driverId,
      userName: usersTable.name,
      driverName: driversTable.name,
      pickup: ridesTable.pickup,
      destination: ridesTable.destination,
      vehicleType: ridesTable.vehicleType,
      rideMode: ridesTable.rideMode,
      price: ridesTable.price,
      status: ridesTable.status,
      createdAt: ridesTable.createdAt,
    })
    .from(ridesTable)
    .leftJoin(usersTable, eq(ridesTable.userId, usersTable.id))
    .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
    .orderBy(desc(ridesTable.createdAt))
    .limit(10);

  res.json(
    rides.map((r) => ({
      id: r.id,
      userId: r.userId,
      driverId: r.driverId ?? null,
      userName: r.userName ?? "Unknown",
      driverName: r.driverName ?? null,
      pickup: r.pickup,
      destination: r.destination,
      vehicleType: r.vehicleType,
      rideMode: r.rideMode,
      price: Number(r.price),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.get("/admin/analytics/daily", authMiddleware, async (_req: Request, res: Response) => {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d;
  });

  const analytics = await Promise.all(
    days.map(async (date) => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const [ridesResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ridesTable)
        .where(and(gte(ridesTable.createdAt, start), sql`${ridesTable.createdAt} <= ${end}`));

      const [earningsResult] = await db
        .select({ total: sql<number>`coalesce(sum(price::numeric), 0)` })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.status, "completed"),
            gte(ridesTable.createdAt, start),
            sql`${ridesTable.createdAt} <= ${end}`
          )
        );

      const [newUsersResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(usersTable)
        .where(and(gte(usersTable.createdAt, start), sql`${usersTable.createdAt} <= ${end}`));

      return {
        date: date.toISOString().split("T")[0],
        rides: Number(ridesResult?.count ?? 0),
        earnings: Number(earningsResult?.total ?? 0),
        newUsers: Number(newUsersResult?.count ?? 0),
      };
    })
  );

  res.json(analytics);
});

router.patch("/admin/rides/:id/assign", authMiddleware, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { driverId } = req.body as { driverId: number };

  const [updated] = await db
    .update(ridesTable)
    .set({ driverId, status: "assigned" })
    .where(eq(ridesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ message: "Ride not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updated.userId));
  const driver = driverId
    ? (await db.select().from(driversTable).where(eq(driversTable.id, driverId)))[0]
    : null;

  res.json({
    id: updated.id,
    userId: updated.userId,
    driverId: updated.driverId ?? null,
    userName: user?.name ?? "Unknown",
    driverName: driver?.name ?? null,
    pickup: updated.pickup,
    destination: updated.destination,
    vehicleType: updated.vehicleType,
    rideMode: updated.rideMode,
    price: Number(updated.price),
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
