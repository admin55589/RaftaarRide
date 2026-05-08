import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { ridesTable, driversTable, usersTable, walletTransactionsTable, promoCodesTable, surgeSettingsTable } from "@workspace/db/schema";
import { eq, desc, and, inArray, avg, isNotNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { emitRideUpdate, emitAdminUpdate, emitToDriver } from "../lib/socket";
import { sendPushNotification } from "../lib/expoPush";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET ?? "raftaarride-admin-secret-2024";

interface JwtPayload { userId: number; phone: string; role: string; }

async function userAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as JwtPayload;
    const [user] = await db.select({ id: usersTable.id, status: usersTable.status }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) { res.status(401).json({ success: false, error: "User not found" }); return; }
    if (user.status === "blocked") { res.status(403).json({ success: false, error: "Aapka account block kar diya gaya hai. Support se contact karein." }); return; }
    if (user.status === "suspended") { res.status(403).json({ success: false, error: "Aapka account suspend hai. Support se contact karein." }); return; }
    (req as any).userId = payload.userId;
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

/* flexAuth: accepts BOTH user JWT (userId) and driver JWT (driverId) */
interface FlexPayload { userId?: number; driverId?: number; phone?: string; role?: string; }
async function flexAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as FlexPayload;
    if (payload.userId) {
      const [user] = await db.select({ id: usersTable.id, status: usersTable.status })
        .from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
      if (!user || user.status === "blocked" || user.status === "suspended") {
        res.status(403).json({ success: false, error: "Access denied" }); return;
      }
      (req as any).userId = payload.userId;
      (req as any).callerType = "user";
    } else if (payload.driverId) {
      (req as any).driverId = payload.driverId;
      (req as any).callerType = "driver";
    } else {
      res.status(401).json({ success: false, error: "Invalid token" }); return;
    }
    next();
  } catch { res.status(401).json({ success: false, error: "Invalid token" }); }
}

interface GeoPoint { lat?: number; lng?: number; address: string; }

async function assignNearestDriver(vehicleType: string, pickupLat?: number, pickupLng?: number): Promise<{ driver: typeof driversTable.$inferSelect; etaMinutes: number } | null> {
  const availableDrivers = await db
    .select()
    .from(driversTable)
    .where(and(
      eq(driversTable.vehicleType, vehicleType),
      eq(driversTable.isOnline, true),
      eq(driversTable.status, "active")
    ))
    .limit(10);

  if (availableDrivers.length === 0) return null;

  const DEFAULT_ETA = 5;

  if (pickupLat && pickupLng) {
    let nearest = availableDrivers[0];
    let minDist = Infinity;
    for (const d of availableDrivers) {
      if (d.driverLat && d.driverLng) {
        const dLat = parseFloat(String(d.driverLat));
        const dLng = parseFloat(String(d.driverLng));
        /* Haversine approx — convert degree distance to km */
        const latDiff = dLat - pickupLat;
        const lngDiff = dLng - pickupLng;
        const avgLat = (dLat + pickupLat) / 2;
        const kmLat = latDiff * 111.0;
        const kmLng = lngDiff * 111.0 * Math.cos(avgLat * Math.PI / 180);
        const dist = Math.sqrt(kmLat * kmLat + kmLng * kmLng);
        if (dist < minDist) { minDist = dist; nearest = d; }
      }
    }
    /* ETA = distance / avg city speed (20 km/h), min 1 min, max 20 min */
    const etaMinutes = minDist === Infinity
      ? DEFAULT_ETA
      : Math.min(20, Math.max(1, Math.round(minDist / 20 * 60)));
    return { driver: nearest, etaMinutes };
  }

  const randomDriver = availableDrivers[Math.floor(Math.random() * availableDrivers.length)];
  return { driver: randomDriver, etaMinutes: DEFAULT_ETA };
}

router.post("/rides", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const {
    pickup, drop, destination, vehicleType, rideType, rideMode, price, fare, distanceKm,
    promoCode, discountAmount, originalPrice,
    senderName, receiverName, receiverPhone, itemWeight, packageDetails,
  } = req.body as {
    pickup: GeoPoint | string;
    drop?: GeoPoint | string;
    destination?: GeoPoint | string;
    vehicleType?: string; rideType?: string;
    rideMode?: string; price?: number; fare?: number; distanceKm?: number;
    promoCode?: string; discountAmount?: number; originalPrice?: number;
    senderName?: string; receiverName?: string; receiverPhone?: string;
    itemWeight?: string; packageDetails?: string;
  };

  const dropPoint = drop ?? destination;
  if (!pickup || !dropPoint) {
    res.status(400).json({ success: false, error: "pickup and drop are required" }); return;
  }

  const pickupAddress = typeof pickup === "string" ? pickup : pickup.address;
  const pickupLat    = typeof pickup === "object" ? (pickup.lat ? String(pickup.lat) : undefined) : undefined;
  const pickupLng    = typeof pickup === "object" ? (pickup.lng ? String(pickup.lng) : undefined) : undefined;
  const dropAddress  = typeof dropPoint === "string" ? dropPoint : (dropPoint as GeoPoint).address;
  const dropLat      = typeof dropPoint === "object" ? ((dropPoint as GeoPoint).lat ? String((dropPoint as GeoPoint).lat) : undefined) : undefined;
  const dropLng      = typeof dropPoint === "object" ? ((dropPoint as GeoPoint).lng ? String((dropPoint as GeoPoint).lng) : undefined) : undefined;

  const finalVehicleType = rideType ?? vehicleType;
  const finalPrice = fare ?? price;

  if (!pickupAddress || !dropAddress || !finalVehicleType || !finalPrice) {
    res.status(400).json({ success: false, error: "pickup, drop, vehicleType, price are required" }); return;
  }

  try {
    const driverResult = await assignNearestDriver(
      finalVehicleType,
      typeof pickup === "object" ? pickup.lat : undefined,
      typeof pickup === "object" ? pickup.lng : undefined
    );
    const matchedDriver = driverResult?.driver ?? null;
    const driverEta = driverResult?.etaMinutes ?? 5;

    const { paymentMethod: pmRaw } = req.body as { paymentMethod?: string };
    const finalPaymentMethod = (pmRaw && ["Cash","UPI","Card","RaftaarWallet"].includes(pmRaw)) ? pmRaw : "Cash";

    const [ride] = await db.insert(ridesTable).values({
      userId,
      pickup: pickupAddress, pickupLat, pickupLng,
      destination: dropAddress, dropLat, dropLng,
      vehicleType: finalVehicleType,
      rideMode: rideMode ?? "economy",
      price: String(finalPrice),
      distanceKm: distanceKm ? String(distanceKm) : undefined,
      status: matchedDriver ? "accepted" : "searching",
      driverId: matchedDriver?.id ?? undefined,
      paymentMethod: finalPaymentMethod,
      promoCode: promoCode?.toUpperCase().trim() ?? null,
      discountAmount: discountAmount ? String(discountAmount) : "0",
      originalPrice: originalPrice ? String(originalPrice) : String(finalPrice),
      senderName: senderName?.trim() ?? null,
      receiverName: receiverName?.trim() ?? null,
      receiverPhone: receiverPhone?.trim() ?? null,
      itemWeight: itemWeight ?? null,
      packageDetails: packageDetails ?? null,
    }).returning();

    /* Increment promo usedCount if a valid code was applied */
    if (promoCode) {
      const cleanCode = promoCode.toUpperCase().trim();
      const [existingPromo] = await db.select({ id: promoCodesTable.id, usedCount: promoCodesTable.usedCount })
        .from(promoCodesTable).where(eq(promoCodesTable.code, cleanCode)).limit(1);
      if (existingPromo) {
        await db.update(promoCodesTable)
          .set({ usedCount: existingPromo.usedCount + 1 })
          .where(eq(promoCodesTable.id, existingPromo.id))
          .catch((err: unknown) => { req.log.error({ err }, "[rides] promo usedCount update failed"); });
      }
    }

    if (matchedDriver) {
      await db.update(driversTable).set({ isOnline: false }).where(eq(driversTable.id, matchedDriver.id));
    }

    const vehicleEmojiMap: Record<string, string> = {
      bike: "🏍️", auto: "🛺", cab: "🚗", prime: "⭐🚗", suv: "🚐",
    };
    const driverPayload = matchedDriver ? {
      id: matchedDriver.id,
      name: matchedDriver.name,
      phone: matchedDriver.phone,
      photoUrl: matchedDriver.photoUrl ?? null,
      vehicleType: matchedDriver.vehicleType,
      vehicleNumber: matchedDriver.vehicleNumber,
      vehicle: vehicleEmojiMap[matchedDriver.vehicleType] ?? "🚗",
      rating: matchedDriver.rating,
      eta: driverEta,
    } : null;

    /* Generate PIN immediately when driver auto-assigned */
    let completionPin: number | null = null;
    if (matchedDriver) {
      completionPin = 1000 + Math.floor(Math.random() * 9000);
      await db.update(ridesTable).set({ completionPin }).where(eq(ridesTable.id, ride.id));
    }

    /* Fetch user name for driver's ride card */
    const [rideUser] = await db.select({ name: usersTable.name, pushToken: usersTable.pushToken })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    emitRideUpdate(ride.id, "ride:status", { rideId: ride.id, status: ride.status, driver: driverPayload });
    emitAdminUpdate("admin:ride:new", { ride, driver: driverPayload });

    /* Emit ride to driver's socket room (real-time card in driver app) */
    if (matchedDriver) {
      emitToDriver(matchedDriver.id, "driver:new_ride", {
        id: String(ride.id),
        rideId: ride.id,
        from: pickupAddress,
        to: dropAddress,
        distance: `${ride.distanceKm ?? "?"} km`,
        price: finalPrice,
        eta: driverPayload?.eta ?? 3,
        userName: rideUser?.name ?? "Passenger",
      });

      /* Emit PIN to ride room so passenger sees it immediately */
      if (completionPin) {
        emitRideUpdate(ride.id, "ride:pin", { rideId: ride.id, pin: completionPin });
      }

      /* Push PIN to user */
      if (rideUser?.pushToken && completionPin) {
        await sendPushNotification({
          to: rideUser.pushToken,
          title: "🔐 Aapka Ride PIN",
          body: `Driver ko yeh PIN batao ride complete karne ke liye: ${completionPin}`,
          data: { type: "ride_pin", rideId: ride.id, pin: completionPin },
        });
      }
    }

    /* Push notification to assigned driver */
    if (matchedDriver?.pushToken) {
      await sendPushNotification({
        to: matchedDriver.pushToken,
        title: "🚖 Naya Ride Request!",
        body: `${pickupAddress} → ${dropAddress} — ₹${finalPrice}`,
        data: { screen: "DriverMode", rideId: ride.id, type: "new_ride" },
        priority: "high",
      });
    }

    res.status(200).json({
      success: true,
      rideId: ride.id,
      message: matchedDriver ? "Driver found! Ride booked successfully" : "Ride booked, searching for driver...",
      ride,
      driver: driverPayload,
    });
  } catch (err) {
    req.log.error({ err }, "[rides] create error");
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/rides/my", userAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const rides = await db
      .select()
      .from(ridesTable)
      .where(eq(ridesTable.userId, userId))
      .orderBy(desc(ridesTable.createdAt))
      .limit(50);

    const driverIds = [...new Set(rides.filter((r) => r.driverId).map((r) => r.driverId!))] as number[];
    const drivers = driverIds.length > 0
      ? await db.select().from(driversTable).where(inArray(driversTable.id, driverIds))
      : [];

    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    const ridesWithDrivers = rides.map((r) => ({
      ...r,
      driver: r.driverId ? (driverMap.get(r.driverId) ?? null) : null,
    }));

    res.json({ success: true, rides: ridesWithDrivers });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.get("/rides/:id", flexAuth, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  try {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }

    /* Ownership check: user sees only their ride; driver sees only their assigned ride */
    const callUid = (req as any).userId as number | undefined;
    const callDid = (req as any).driverId as number | undefined;
    const callType = ((req as any).callerType ?? "user") as string;
    if (callType === "user" && ride.userId !== callUid) {
      res.status(403).json({ success: false, error: "Not your ride" }); return;
    }
    if (callType === "driver" && ride.driverId !== callDid) {
      res.status(403).json({ success: false, error: "Not your ride" }); return;
    }

    let driver = null;
    if (ride.driverId) {
      const [d] = await db.select().from(driversTable).where(eq(driversTable.id, ride.driverId)).limit(1);
      if (d) driver = { id: d.id, name: d.name, phone: d.phone, vehicleType: d.vehicleType, vehicleNumber: d.vehicleNumber, rating: d.rating };
    }
    res.json({ success: true, ride, driver });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

router.post("/rides/:id/cancel", userAuth, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const userId = (req as any).userId;
  try {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }
    if (ride.userId !== userId) { res.status(403).json({ success: false, error: "Not your ride" }); return; }
    if (["completed", "cancelled"].includes(ride.status)) {
      res.status(400).json({ success: false, error: `Cannot cancel a ${ride.status} ride` }); return;
    }

    const { cancelReason } = req.body as { cancelReason?: string };

    /* ── Cancellation Fee Logic ── */
    let cancelFee = 0;
    if (ride.status === "arrived")  cancelFee = 50; // driver was waiting at pickup
    else if (ride.status === "accepted") cancelFee = 30; // driver was on the way

    const [updated] = await db.update(ridesTable).set({
      status: "cancelled",
      cancelReason: cancelReason?.trim() || null,
      cancelledBy: "user",
      cancellationFee: String(cancelFee),
    }).where(eq(ridesTable.id, rideId)).returning();

    /* ── Cancellation Fee Deduction / Wallet Refund ── */
    const ridePrice = parseFloat(String(ride.price));
    const [rideUser] = await db.select({ walletBalance: usersTable.walletBalance, pushToken: usersTable.pushToken })
      .from(usersTable).where(eq(usersTable.id, ride.userId)).limit(1);

    if (rideUser) {
      const currentBal = parseFloat(String(rideUser.walletBalance ?? "0"));

      if (ride.paymentMethod === "RaftaarWallet") {
        /* Wallet was pre-charged — refund (price - cancelFee) */
        const refundAmt = parseFloat(Math.max(0, ridePrice - cancelFee).toFixed(2));
        const newBal = parseFloat((currentBal + refundAmt).toFixed(2));
        await db.update(usersTable).set({ walletBalance: String(newBal) }).where(eq(usersTable.id, ride.userId));
        if (refundAmt > 0) {
          await db.insert(walletTransactionsTable).values({
            userId: ride.userId,
            type: "refund",
            amount: String(refundAmt),
            description: cancelFee > 0
              ? `Ride #${rideId} cancel — ₹${refundAmt.toFixed(2)} wapas (₹${cancelFee} cancellation charge kaat ke)`
              : `Ride #${rideId} cancel — ₹${refundAmt.toFixed(2)} wallet mein wapas`,
          });
        }
        if (cancelFee > 0) {
          await db.insert(walletTransactionsTable).values({
            userId: ride.userId,
            type: "debit",
            amount: String(-cancelFee),
            description: `Ride #${rideId} cancellation charge — driver ${ride.status === "arrived" ? "aapka wait kar raha tha" : "aapke taraf aa raha tha"}`,
          });
        }
        if (rideUser.pushToken) {
          const msg = cancelFee > 0
            ? `₹${cancelFee} cancellation charge laga. ₹${refundAmt.toFixed(2)} wallet mein wapas.`
            : `₹${ridePrice.toFixed(2)} wallet mein wapas aa gaye`;
          await sendPushNotification({
            to: rideUser.pushToken,
            title: cancelFee > 0 ? "❌ Ride Cancel — Charge Laga" : "💰 Refund Ho Gaya!",
            body: msg,
            data: { type: "cancel_refund", rideId, cancelFee, refundAmt },
          });
        }
      } else if (cancelFee > 0) {
        /* Non-wallet payment — try to deduct cancelFee from wallet */
        if (currentBal >= cancelFee) {
          const newBal = parseFloat((currentBal - cancelFee).toFixed(2));
          await db.update(usersTable).set({ walletBalance: String(newBal) }).where(eq(usersTable.id, ride.userId));
          await db.insert(walletTransactionsTable).values({
            userId: ride.userId,
            type: "debit",
            amount: String(-cancelFee),
            description: `Ride #${rideId} cancellation charge — driver ${ride.status === "arrived" ? "wait kar raha tha" : "aa raha tha"}`,
          });
        }
        if (rideUser.pushToken) {
          await sendPushNotification({
            to: rideUser.pushToken,
            title: "❌ Cancellation Charge",
            body: `₹${cancelFee} cancellation fee lagi — driver aapke paas tha`,
            data: { type: "cancellation_fee", rideId, amount: cancelFee },
          });
        }
      }
    }

    /* ── Notify driver + set back online ── */
    if (ride.driverId) {
      await db.update(driversTable).set({ isOnline: true }).where(eq(driversTable.id, ride.driverId));
      const [drv] = await db.select({ pushToken: driversTable.pushToken })
        .from(driversTable).where(eq(driversTable.id, ride.driverId)).limit(1);
      if (drv?.pushToken) {
        await sendPushNotification({
          to: drv.pushToken,
          title: "❌ Ride Cancel Ho Gayi",
          body: cancelFee > 0
            ? `Passenger ne cancel kiya — ₹${cancelFee} cancellation charge apply hua.`
            : "Passenger ne ride cancel kar di. Aap ab online hain.",
          data: { type: "ride_cancelled", rideId },
        });
      }
    }

    emitRideUpdate(rideId, "ride:status", { rideId, status: "cancelled" });
    emitAdminUpdate("admin:ride:updated", { rideId, status: "cancelled" });

    res.json({
      success: true,
      ride: updated,
      cancellationFee: cancelFee,
      message: cancelFee > 0
        ? `Ride cancel ho gayi. ₹${cancelFee} cancellation charge laga.`
        : "Ride cancelled successfully",
    });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

const VALID_STATUSES = ["searching", "accepted", "arrived", "onRide", "completed", "cancelled"];

router.patch("/rides/:id/status", flexAuth, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const callerUserId: number | undefined = (req as any).userId;
  const callerDriverId: number | undefined = (req as any).driverId;
  const callerType: string = (req as any).callerType ?? "user";
  const { status, driverRating, paymentMethod: pmUpdate } = req.body as { status: string; driverRating?: number; paymentMethod?: string };

  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` }); return;
  }

  try {
    /* Fetch ride first — needed for ownership check + completionPin pre-check + wait time */
    const [existingRide] = await db.select({
      userId: ridesTable.userId, driverId: ridesTable.driverId, completionPin: ridesTable.completionPin,
      arrivedAt: ridesTable.arrivedAt, price: ridesTable.price, status: ridesTable.status,
    }).from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!existingRide) { res.status(404).json({ success: false, error: "Ride not found" }); return; }

    /* Ownership: user can only update their own ride; driver can only update their assigned ride */
    if (callerType === "user" && existingRide.userId !== callerUserId) {
      res.status(403).json({ success: false, error: "Not your ride" }); return;
    }
    if (callerType === "driver" && existingRide.driverId !== callerDriverId) {
      res.status(403).json({ success: false, error: "Not your ride" }); return;
    }

    const updateData: Record<string, any> = { status };
    if (pmUpdate && ["Cash","UPI","Card","RaftaarWallet"].includes(pmUpdate)) {
      updateData.paymentMethod = pmUpdate;
    }

    /* ── Arrived: record timestamp for wait-time tracking ── */
    if (status === "arrived") {
      updateData.arrivedAt = new Date();
    }

    /* ── onRide: calculate wait-time fee (₹3/min after first 3 free minutes) ── */
    let waitFee = 0;
    if (status === "onRide" && existingRide.arrivedAt) {
      const arrivedMs = new Date(existingRide.arrivedAt).getTime();
      const waitMinutes = (Date.now() - arrivedMs) / 60000;
      const chargeableMinutes = Math.max(0, waitMinutes - 3);
      waitFee = Math.round(chargeableMinutes * 3);
      if (waitFee > 0) {
        const basePrice = parseFloat(String(existingRide.price ?? "0"));
        updateData.waitTimeFee = String(waitFee);
        updateData.price = String(parseFloat((basePrice + waitFee).toFixed(2)));
      }
    }

    const [updated] = await db.update(ridesTable).set(updateData).where(eq(ridesTable.id, rideId)).returning();
    if (!updated) { res.status(404).json({ success: false, error: "Ride not found" }); return; }

    /* Generate 4-digit completion PIN when driver accepts — ONLY if PIN not already set (POST /rides may have set it) */
    if (status === "accepted" && !existingRide.completionPin) {
      const pin = 1000 + Math.floor(Math.random() * 9000);
      await db.update(ridesTable).set({ completionPin: pin }).where(eq(ridesTable.id, rideId));
      emitRideUpdate(rideId, "ride:pin", { rideId, pin });

      /* Push PIN to user */
      if (updated.userId) {
        const [rideUser] = await db
          .select({ pushToken: usersTable.pushToken })
          .from(usersTable)
          .where(eq(usersTable.id, updated.userId))
          .limit(1);
        if (rideUser?.pushToken) {
          await sendPushNotification({
            to: rideUser.pushToken,
            title: "🔐 Aapka Ride PIN",
            body: `Driver ko yeh PIN batao ride complete karne ke liye: ${pin}`,
            data: { type: "ride_pin", rideId, pin },
          });
        }
      }
    }

    if (status === "completed" && updated.driverId) {
      /* Skip if earnings already credited (e.g. via verify-pin route) */
      if (updated.driverEarning && parseFloat(String(updated.driverEarning)) > 0) {
        emitRideUpdate(rideId, "ride:status", { rideId, status });
        emitAdminUpdate("admin:ride:updated", { rideId, status });
        res.json({ success: true, ride: updated, driverRating });
        return;
      }
      const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, updated.driverId)).limit(1);
      if (driver) {
        const price = parseFloat(String(updated.price));
        const isCash = updated.paymentMethod === "Cash";

        /*
         * Business Model: 0% commission — driver earns full Ride Fare.
         * Platform earns via fixed Platform Fee (already included in total price):
         *   Bike ₹4 | Auto ₹6 | Cab/Prime ₹12 | SUV ₹15
         *
         * CASH: Driver physically collected full amount (rideFare + platformFee) from rider.
         *   → Debit platformFee from driver wallet so admin can collect it.
         *   → Driver's net earning = price - platformFee (already in hand as cash).
         *
         * ONLINE: Platform collected full amount from rider.
         *   → Credit rideFare (price - platformFee) to driver wallet.
         *   → Platform keeps platformFee.
         */
        const vt = String(updated.vehicleType ?? "cab").toLowerCase();
        const PLATFORM_FEE_MAP: Record<string, number> = {
          bike: 4, auto: 6, cab: 12, prime: 12, suv: 15,
        };
        const platformFee = PLATFORM_FEE_MAP[vt] ?? 12;
        const commission = 0;
        const earning = parseFloat((price - platformFee).toFixed(2));

        const currentBalance = parseFloat(String(driver.walletBalance ?? "0"));
        const newWalletBalance = isCash
          ? currentBalance - platformFee       // debit: driver owes platform fee to admin
          : currentBalance + earning;          // credit: driver gets ride fare (excl. platform fee)

        const totalEarningsNew = parseFloat(String(driver.totalEarnings ?? "0")) + earning;

        await db.update(driversTable).set({
          totalEarnings: String(totalEarningsNew.toFixed(2)),
          walletBalance: String(newWalletBalance.toFixed(2)),
          totalRides: (driver.totalRides ?? 0) + 1,
          isOnline: false,
        }).where(eq(driversTable.id, updated.driverId));

        await db.update(ridesTable).set({
          commissionAmount: String(commission),
          driverEarning: String(earning),
        }).where(eq(ridesTable.id, rideId));

        await db.insert(walletTransactionsTable).values({
          driverId: updated.driverId,
          type: isCash ? "commission_debit" : "earning",
          amount: String(isCash ? -platformFee : earning),
          description: isCash
            ? `Ride #${rideId} — Cash: aapne ₹${price.toFixed(2)} collect kiye. Platform fee ₹${platformFee} admin ko dena hai.`
            : `Ride #${rideId} — Ride fare ₹${earning.toFixed(2)} credit (0% commission, platform fee ₹${platformFee} admin ka).`,
        });
      }
    }

    emitRideUpdate(rideId, "ride:status", { rideId, status });
    emitAdminUpdate("admin:ride:updated", { rideId, status });

    res.json({ success: true, ride: updated, driverRating });
  } catch (err) { res.status(500).json({ success: false, error: String(err) }); }
});

/* POST /api/rides/:id/verify-pin — driver submits PIN to complete ride */
router.post("/rides/:id/verify-pin", async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

  try {
    const payload = jwt.verify(auth.split(" ")[1], JWT_SECRET) as { driverId: number };
    const driverId = payload.driverId;
    if (!driverId) { res.status(401).json({ success: false, error: "Driver token invalid" }); return; }

    const { pin } = req.body as { pin: string | number };
    if (!pin) { res.status(400).json({ success: false, error: "PIN dena zaroori hai" }); return; }

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) { res.status(404).json({ success: false, error: "Ride nahi mili" }); return; }
    if (ride.driverId !== driverId) { res.status(403).json({ success: false, error: "Yeh aapki ride nahi hai" }); return; }
    if (["completed", "cancelled"].includes(ride.status)) {
      res.status(400).json({ success: false, error: `Ride already ${ride.status} hai` }); return;
    }
    if (String(ride.completionPin) !== String(pin)) {
      res.status(400).json({ success: false, error: "❌ Galat PIN! Passenger se sahi 4-digit PIN lein" }); return;
    }

    /* Mark ride as completed */
    const [updated] = await db.update(ridesTable).set({ status: "completed" }).where(eq(ridesTable.id, rideId)).returning();

    /* Calculate earnings — 0% commission, platform fee model
       Guard: skip if PATCH /status already credited (e.g. race condition) */
    const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, driverId)).limit(1);
    if (driver && !(updated.driverEarning && parseFloat(String(updated.driverEarning)) > 0)) {
      const price = parseFloat(String(updated.price));
      const isCash = updated.paymentMethod === "Cash";

      const vt = String(updated.vehicleType ?? "cab").toLowerCase();
      const PLATFORM_FEE_MAP: Record<string, number> = {
        bike: 4, auto: 6, cab: 12, prime: 12, suv: 15,
      };
      const platformFee = PLATFORM_FEE_MAP[vt] ?? 12;
      const commission = 0;
      const earning = parseFloat((price - platformFee).toFixed(2));

      const currentBalance = parseFloat(String(driver.walletBalance ?? "0"));
      const newWalletBalance = isCash
        ? currentBalance - platformFee
        : currentBalance + earning;

      await db.update(driversTable).set({
        totalEarnings: String((parseFloat(String(driver.totalEarnings ?? "0")) + earning).toFixed(2)),
        walletBalance: String(newWalletBalance.toFixed(2)),
        totalRides: (driver.totalRides ?? 0) + 1,
        isOnline: false,
      }).where(eq(driversTable.id, driverId));

      await db.update(ridesTable).set({ commissionAmount: String(commission), driverEarning: String(earning), cashCollected: isCash })
        .where(eq(ridesTable.id, rideId));

      await db.insert(walletTransactionsTable).values({
        driverId,
        type: isCash ? "commission_debit" : "earning",
        amount: String(isCash ? -platformFee : earning),
        description: isCash
          ? `Ride #${rideId} — Cash: aapne ₹${price.toFixed(2)} collect kiye. Platform fee ₹${platformFee} admin ko dena hai.`
          : `Ride #${rideId} — Ride fare ₹${earning.toFixed(2)} credit (0% commission, platform fee ₹${platformFee} admin ka).`,
      });
    }

    /* Notify passenger: PIN confirmed → go to payment */
    emitRideUpdate(rideId, "ride:pin:confirmed", { rideId });
    emitRideUpdate(rideId, "ride:status", { rideId, status: "completed" });
    emitAdminUpdate("admin:ride:updated", { rideId, status: "completed" });

    /* Push notification to user */
    if (ride.userId) {
      const [rideUser] = await db.select({ pushToken: usersTable.pushToken }).from(usersTable)
        .where(eq(usersTable.id, ride.userId)).limit(1);
      if (rideUser?.pushToken) {
        await sendPushNotification({
          to: rideUser.pushToken,
          title: "✅ Ride Complete! Bhugtan karo",
          body: "Driver ne ride complete kar di — payment screen khulegi",
          data: { type: "ride_completed", rideId },
        });
      }
    }

    res.json({ success: true, message: "Ride complete ho gayi! 🎉" });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* POST /api/rides/:id/rate — user rates the driver after ride completion */
router.post("/rides/:id/rate", userAuth, async (req: Request, res: Response) => {
  const rideId = Number(req.params.id);
  const userId = (req as any).userId;
  const { rating } = req.body as { rating?: number };

  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ success: false, error: "Rating 1-5 ke beech honi chahiye" });
    return;
  }

  try {
    /* Verify ride belongs to this user */
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) { res.status(404).json({ success: false, error: "Ride nahi mili" }); return; }
    if (ride.userId !== userId) { res.status(403).json({ success: false, error: "Yeh aapki ride nahi hai" }); return; }
    if (ride.userRating) { res.status(400).json({ success: false, error: "Is ride ko aap pehle hi rate kar chuke hain" }); return; }

    /* Save rating on the ride */
    await db.update(ridesTable).set({ userRating: rating }).where(eq(ridesTable.id, rideId));

    /* Recalculate driver's average rating from all rated rides */
    if (ride.driverId) {
      const result = await db
        .select({ avgRating: avg(ridesTable.userRating) })
        .from(ridesTable)
        .where(and(eq(ridesTable.driverId, ride.driverId), isNotNull(ridesTable.userRating)));

      const newAvg = result[0]?.avgRating;
      if (newAvg) {
        await db
          .update(driversTable)
          .set({ rating: String(parseFloat(newAvg).toFixed(2)) })
          .where(eq(driversTable.id, ride.driverId));
      }

      /* Thank-you push to driver */
      const [driver] = await db
        .select({ pushToken: driversTable.pushToken, name: driversTable.name })
        .from(driversTable)
        .where(eq(driversTable.id, ride.driverId))
        .limit(1);

      if (driver?.pushToken) {
        const stars = "⭐".repeat(rating);
        await sendPushNotification({
          to: driver.pushToken,
          title: `${stars} Tumhe ${rating}-star rating mili!`,
          body: `Ek passenger ne aapki service ko ${rating}/5 diya — keep it up!`,
          data: { type: "rating_received", rideId },
        });
      }
    }

    res.json({ success: true, message: `${rating}-star rating save ho gayi!` });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/* GET /api/surge — public: current surge multiplier for mobile app */
router.get("/surge", async (_req: Request, res: Response) => {
  try {
    const [surge] = await db
      .select({ multiplier: surgeSettingsTable.multiplier, isActive: surgeSettingsTable.isActive, reason: surgeSettingsTable.reason })
      .from(surgeSettingsTable)
      .where(eq(surgeSettingsTable.isActive, true))
      .limit(1);
    res.json({
      isActive: !!surge,
      multiplier: surge ? parseFloat(String(surge.multiplier)) : 1.0,
      reason: surge?.reason ?? null,
    });
  } catch {
    res.json({ isActive: false, multiplier: 1.0, reason: null });
  }
});

export default router;
