import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { ridesTable, driversTable, usersTable, walletTransactionsTable, promoCodesTable, surgeSettingsTable } from "@workspace/db/schema";
import { eq, desc, and, inArray, avg, isNotNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { emitRideUpdate, emitAdminUpdate } from "../lib/socket";
import { sendPushNotification } from "../lib/expoPush";
import { startRideBroadcast, cancelQueue } from "../lib/rideQueue";

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

  const { paymentMethod: pmRaw } = req.body as { paymentMethod?: string };
  const finalPaymentMethod = (pmRaw && ["Cash","UPI","Card","RaftaarWallet"].includes(pmRaw)) ? pmRaw : "Cash";

  try {
    /* ── Create ride in "searching" state — driver NOT assigned yet ──
     * rideQueue will find nearest driver and offer them the ride.
     * Driver must explicitly accept before being assigned in DB.        */
    const [ride] = await db.insert(ridesTable).values({
      userId,
      pickup: pickupAddress, pickupLat, pickupLng,
      destination: dropAddress, dropLat, dropLng,
      vehicleType: finalVehicleType,
      rideMode: rideMode ?? "economy",
      price: String(finalPrice),
      distanceKm: distanceKm ? String(distanceKm) : undefined,
      status: "searching",
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

    /* Increment promo usedCount */
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

    emitAdminUpdate("admin:ride:new", { ride, driver: null });

    /* ── Start re-broadcast queue — tries up to 5 nearest drivers ── */
    startRideBroadcast(ride.id, {
      vehicleType: finalVehicleType,
      pickupLat: typeof pickup === "object" ? pickup.lat : undefined,
      pickupLng: typeof pickup === "object" ? pickup.lng : undefined,
      pickupAddress,
      dropAddress,
      price: finalPrice,
      userId,
      distanceKm: distanceKm ? String(distanceKm) : undefined,
    }).catch((err: unknown) => req.log.error({ err, rideId: ride.id }, "[rides] startRideBroadcast error"));

    res.status(200).json({
      success: true,
      rideId: ride.id,
      message: "Ride booked! Nearest driver dhundh rahe hain...",
      ride,
      driver: null,
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

    /* ── Cancellation Fee Logic (2-min grace period for "accepted") ── */
    const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes
    let cancelFee = 0;
    let withinGrace = false;
    if (ride.status === "arrived") {
      cancelFee = 50; // driver waiting at pickup — no grace
    } else if (ride.status === "accepted") {
      const acceptedAt = ride.acceptedAt ? new Date(ride.acceptedAt).getTime() : null;
      const elapsedMs = acceptedAt ? Date.now() - acceptedAt : GRACE_PERIOD_MS + 1;
      withinGrace = elapsedMs <= GRACE_PERIOD_MS;
      cancelFee = withinGrace ? 0 : 30;
    }

    /* Stop re-broadcast queue if ride was still searching */
    cancelQueue(rideId);

    const [updated] = await db.update(ridesTable).set({
      status: "cancelled",
      cancelReason: cancelReason?.trim() || null,
      cancelledBy: "user",
      cancellationFee: String(cancelFee),
    }).where(eq(ridesTable.id, rideId)).returning();

    /* ── Cancellation Fee Deduction / Wallet Refund ── */
    const ridePrice = parseFloat(String(ride.price));
    const [rideUser] = await db.select({
      walletBalance: usersTable.walletBalance,
      pendingCancellationFee: usersTable.pendingCancellationFee,
      pushToken: usersTable.pushToken,
    }).from(usersTable).where(eq(usersTable.id, ride.userId)).limit(1);

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
        /* Non-wallet payment — deduct cancelFee from wallet; if insufficient, track as pending */
        const deducted = Math.min(currentBal, cancelFee);
        const pendingAmt = parseFloat((cancelFee - deducted).toFixed(2));
        const newBal = parseFloat((currentBal - deducted).toFixed(2));
        const existingPending = parseFloat(String(rideUser.pendingCancellationFee ?? "0"));
        const newPending = parseFloat((existingPending + pendingAmt).toFixed(2));

        await db.update(usersTable).set({
          walletBalance: String(newBal),
          pendingCancellationFee: String(newPending),
          pendingCancellationDriverId: pendingAmt > 0 ? (ride.driverId ?? null) : null,
        }).where(eq(usersTable.id, ride.userId));

        if (deducted > 0) {
          await db.insert(walletTransactionsTable).values({
            userId: ride.userId,
            type: "debit",
            amount: String(-deducted),
            description: `Ride #${rideId} cancellation charge — driver ${ride.status === "arrived" ? "wait kar raha tha" : "aa raha tha"}${pendingAmt > 0 ? ` (₹${pendingAmt.toFixed(2)} pending — next topup se katega)` : ""}`,
          });
        }

        if (rideUser.pushToken) {
          const pushBody = pendingAmt > 0
            ? `₹${deducted.toFixed(2)} wallet se kata + ₹${pendingAmt.toFixed(2)} pending — next topup se automatically katega`
            : `₹${cancelFee} cancellation fee wallet se kat gayi`;
          await sendPushNotification({
            to: rideUser.pushToken,
            title: "❌ Cancellation Charge",
            body: pushBody,
            data: { type: "cancellation_fee", rideId, amount: cancelFee, deducted, pendingAmt },
          });
        }
      }
    }

    /* ── Credit cancellation fee to driver wallet (if applicable) ── */
    if (ride.driverId && cancelFee > 0) {
      const [drv] = await db.select({ walletBalance: driversTable.walletBalance, totalEarnings: driversTable.totalEarnings, pushToken: driversTable.pushToken })
        .from(driversTable).where(eq(driversTable.id, ride.driverId)).limit(1);
      if (drv) {
        /* Only credit what was actually deducted from user right now (not pending) */
        const deductedNow = rideUser
          ? (ride.paymentMethod === "RaftaarWallet"
              ? cancelFee
              : Math.min(parseFloat(String(rideUser.walletBalance ?? "0")), cancelFee))
          : 0;
        if (deductedNow > 0) {
          const drvNewWallet = parseFloat((parseFloat(String(drv.walletBalance ?? "0")) + deductedNow).toFixed(2));
          const drvNewEarning = parseFloat((parseFloat(String(drv.totalEarnings ?? "0")) + deductedNow).toFixed(2));
          await db.update(driversTable).set({
            walletBalance: String(drvNewWallet),
            totalEarnings: String(drvNewEarning),
          }).where(eq(driversTable.id, ride.driverId));
          await db.insert(walletTransactionsTable).values({
            driverId: ride.driverId,
            type: "credit",
            amount: String(deductedNow),
            description: `Ride #${rideId} cancellation compensation — passenger ne cancel kiya (${ride.status === "arrived" ? "driver wait kar raha tha" : "driver raste mein tha"})`,
          });
          if (drv.pushToken) {
            await sendPushNotification({
              to: drv.pushToken,
              title: "💰 Cancellation Compensation Mila!",
              body: `₹${deductedNow.toFixed(2)} aapke wallet mein — passenger ne cancel kiya tha`,
              data: { type: "cancellation_compensation", rideId, amount: deductedNow },
            });
          }
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
            ? `Passenger ne cancel kiya — aap wapas online hain.`
            : "Passenger ne ride cancel kar di. Aap ab online hain.",
          data: { type: "ride_cancelled", rideId },
        });
      }
    }

    emitRideUpdate(rideId, "ride:status", { rideId, status: "cancelled" });
    emitAdminUpdate("admin:ride:updated", { rideId, status: "cancelled" });

    /* ── Build fee summary for mobile ── */
    let feeDeducted = 0;
    let feePending = 0;
    if (rideUser && cancelFee > 0) {
      const currentBal = parseFloat(String(rideUser.walletBalance ?? "0"));
      if (ride.paymentMethod === "RaftaarWallet") {
        feeDeducted = cancelFee;
      } else {
        feeDeducted = Math.min(currentBal, cancelFee);
        feePending = parseFloat((cancelFee - feeDeducted).toFixed(2));
      }
    }

    res.json({
      success: true,
      ride: updated,
      cancellationFee: cancelFee,
      feeDeducted,
      feePending,
      withinGrace,
      message: cancelFee === 0
        ? withinGrace ? "Ride cancel ho gayi — grace period mein tha, koi charge nahi." : "Ride cancelled successfully"
        : feePending > 0
          ? `Ride cancel ho gayi. ₹${feeDeducted.toFixed(2)} wallet se kata + ₹${feePending.toFixed(2)} pending (next topup se katega).`
          : `Ride cancel ho gayi. ₹${cancelFee} cancellation charge wallet se kat gaya.`,
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

    /* ── Accepted: record timestamp for grace-period tracking ── */
    if (status === "accepted") {
      updateData.acceptedAt = new Date();
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
        const earning = parseFloat((price - platformFee).toFixed(2));

        const currentBalance = parseFloat(String(driver.walletBalance ?? "0"));
        const currentPending = parseFloat(String(driver.pendingCommission ?? "0"));

        /* Cash Commission Logic:
         * If driver wallet has enough → deduct platformFee immediately (collected)
         * If not enough → flag as pending, add to pendingCommission counter */
        let newWalletBalance: number;
        let newPendingCommission = currentPending;
        let commissionStatusValue: string | null = null;

        if (isCash) {
          const hasSufficientBalance = currentBalance >= platformFee;
          commissionStatusValue = hasSufficientBalance ? "collected" : "pending";
          if (hasSufficientBalance) {
            newWalletBalance = currentBalance - platformFee;
          } else {
            newWalletBalance = currentBalance;
            newPendingCommission = parseFloat((currentPending + platformFee).toFixed(2));
          }
        } else {
          /* Online ride: credit earning, then auto-recover any pending commission */
          const creditedBalance = currentBalance + earning;
          if (currentPending > 0) {
            const autoDeduct = parseFloat(Math.min(currentPending, creditedBalance).toFixed(2));
            newWalletBalance = parseFloat((creditedBalance - autoDeduct).toFixed(2));
            newPendingCommission = parseFloat((currentPending - autoDeduct).toFixed(2));
          } else {
            newWalletBalance = creditedBalance;
          }
        }

        const totalEarningsNew = parseFloat(String(driver.totalEarnings ?? "0")) + earning;

        await db.update(driversTable).set({
          totalEarnings: String(totalEarningsNew.toFixed(2)),
          walletBalance: String(newWalletBalance.toFixed(2)),
          pendingCommission: String(newPendingCommission.toFixed(2)),
          totalRides: (driver.totalRides ?? 0) + 1,
          isOnline: false,
        }).where(eq(driversTable.id, updated.driverId));

        await db.update(ridesTable).set({
          commissionAmount: String(platformFee),
          commissionStatus: commissionStatusValue,
          driverEarning: String(earning),
          cashCollected: isCash,
        }).where(eq(ridesTable.id, rideId));

        /* Wallet transaction(s) */
        if (isCash) {
          await db.insert(walletTransactionsTable).values({
            driverId: updated.driverId,
            type: commissionStatusValue === "collected" ? "commission_debit" : "commission_pending",
            amount: String(-platformFee),
            description: commissionStatusValue === "collected"
              ? `Ride #${rideId} — Cash ₹${price.toFixed(2)}: Platform fee ₹${platformFee} wallet se kaata gaya ✅`
              : `Ride #${rideId} — Cash ₹${price.toFixed(2)}: Platform fee ₹${platformFee} PENDING (wallet balance kam tha) ⚠️`,
            rideId,
          });
        } else {
          /* Online earning credit */
          await db.insert(walletTransactionsTable).values({
            driverId: updated.driverId,
            type: "earning",
            amount: String(earning),
            description: `Ride #${rideId} — Online fare ₹${earning.toFixed(2)} wallet mein credit hua.`,
            rideId,
          });
          /* Auto-recover pending commission if any was deducted */
          const autoDeducted = parseFloat((currentPending - newPendingCommission).toFixed(2));
          if (autoDeducted > 0) {
            await db.insert(walletTransactionsTable).values({
              driverId: updated.driverId,
              type: "commission_debit",
              amount: String(-autoDeducted),
              description: `Pending commission ₹${autoDeducted.toFixed(2)} is ride ke earning se auto-recover ki gaya ✅`,
              rideId,
            });
            /* Mark now-cleared pending rides as auto_collected */
            if (newPendingCommission === 0) {
              await db.update(ridesTable)
                .set({ commissionStatus: "auto_collected" })
                .where(and(eq(ridesTable.driverId, updated.driverId!), eq(ridesTable.commissionStatus, "pending")));
            }
          }
        }

        /* Push notification if commission is pending */
        if (isCash && commissionStatusValue === "pending") {
          const [driverForPush] = await db.select({ pushToken: driversTable.pushToken })
            .from(driversTable).where(eq(driversTable.id, updated.driverId)).limit(1);
          if (driverForPush?.pushToken) {
            await sendPushNotification({
              to: driverForPush.pushToken,
              title: "⚠️ Platform Fee Pending",
              body: `Ride #${rideId} ki platform fee ₹${platformFee} pending hai. Agla online ride aane par auto-clear ho jaayega.`,
              data: { type: "commission_pending", rideId },
            });
          }
        }
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
      const earning = parseFloat((price - platformFee).toFixed(2));

      const currentBalance = parseFloat(String(driver.walletBalance ?? "0"));
      const currentPending = parseFloat(String(driver.pendingCommission ?? "0"));

      let newWalletBalance: number;
      let newPendingCommission = currentPending;
      let commissionStatusValue: string | null = null;

      if (isCash) {
        const hasSufficientBalance = currentBalance >= platformFee;
        commissionStatusValue = hasSufficientBalance ? "collected" : "pending";
        if (hasSufficientBalance) {
          newWalletBalance = currentBalance - platformFee;
        } else {
          newWalletBalance = currentBalance;
          newPendingCommission = parseFloat((currentPending + platformFee).toFixed(2));
        }
      } else {
        /* Online ride: credit earning, then auto-recover any pending commission */
        const creditedBalance = currentBalance + earning;
        if (currentPending > 0) {
          const autoDeduct = parseFloat(Math.min(currentPending, creditedBalance).toFixed(2));
          newWalletBalance = parseFloat((creditedBalance - autoDeduct).toFixed(2));
          newPendingCommission = parseFloat((currentPending - autoDeduct).toFixed(2));
        } else {
          newWalletBalance = creditedBalance;
        }
      }

      await db.update(driversTable).set({
        totalEarnings: String((parseFloat(String(driver.totalEarnings ?? "0")) + earning).toFixed(2)),
        walletBalance: String(newWalletBalance.toFixed(2)),
        pendingCommission: String(newPendingCommission.toFixed(2)),
        totalRides: (driver.totalRides ?? 0) + 1,
        isOnline: false,
      }).where(eq(driversTable.id, driverId));

      await db.update(ridesTable).set({
        commissionAmount: String(platformFee),
        commissionStatus: commissionStatusValue,
        driverEarning: String(earning),
        cashCollected: isCash,
      }).where(eq(ridesTable.id, rideId));

      /* Wallet transaction(s) */
      if (isCash) {
        await db.insert(walletTransactionsTable).values({
          driverId,
          type: commissionStatusValue === "collected" ? "commission_debit" : "commission_pending",
          amount: String(-platformFee),
          description: commissionStatusValue === "collected"
            ? `Ride #${rideId} — Cash ₹${price.toFixed(2)}: Platform fee ₹${platformFee} wallet se kaata gaya ✅`
            : `Ride #${rideId} — Cash ₹${price.toFixed(2)}: Platform fee ₹${platformFee} PENDING (wallet balance kam tha) ⚠️`,
          rideId,
        });
      } else {
        await db.insert(walletTransactionsTable).values({
          driverId,
          type: "earning",
          amount: String(earning),
          description: `Ride #${rideId} — Online fare ₹${earning.toFixed(2)} wallet mein credit hua.`,
          rideId,
        });
        const autoDeducted = parseFloat((currentPending - newPendingCommission).toFixed(2));
        if (autoDeducted > 0) {
          await db.insert(walletTransactionsTable).values({
            driverId,
            type: "commission_debit",
            amount: String(-autoDeducted),
            description: `Pending commission ₹${autoDeducted.toFixed(2)} is ride ke earning se auto-recover ki gaya ✅`,
            rideId,
          });
          if (newPendingCommission === 0) {
            await db.update(ridesTable)
              .set({ commissionStatus: "auto_collected" })
              .where(and(eq(ridesTable.driverId, driverId), eq(ridesTable.commissionStatus, "pending")));
          }
        }
      }

      if (isCash && commissionStatusValue === "pending" && driver.pushToken) {
        await sendPushNotification({
          to: driver.pushToken,
          title: "⚠️ Platform Fee Pending",
          body: `Ride #${rideId} ki platform fee ₹${platformFee} pending hai. Agla online ride aane par auto-clear ho jaayega.`,
          data: { type: "commission_pending", rideId },
        });
      }
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
