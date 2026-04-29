import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash"),
  photoUrl: text("photo_url"),
  gender: text("gender"),
  otpCode: text("otp_code"),
  otpExpiresAt: timestamp("otp_expires_at"),
  isVerified: boolean("is_verified").notNull().default(false),
  status: text("status").notNull().default("active"),
  walletBalance: numeric("wallet_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  preferredLanguage: text("preferred_language").notNull().default("hi"),
  pushToken: text("push_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  passwordHash: text("password_hash"),
  licenseNumber: text("license_number"),
  vehicleType: text("vehicle_type").notNull(),
  vehicleNumber: text("vehicle_number").notNull(),
  photoUrl: text("photo_url"),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("4.5"),
  status: text("status").notNull().default("pending"),
  kycStatus: text("kyc_status").notNull().default("pending"),
  isOnline: boolean("is_online").notNull().default(false),
  driverLat: numeric("driver_lat", { precision: 10, scale: 6 }),
  driverLng: numeric("driver_lng", { precision: 10, scale: 6 }),
  totalEarnings: numeric("total_earnings", { precision: 10, scale: 2 }).notNull().default("0"),
  walletBalance: numeric("wallet_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  totalRides: integer("total_rides").notNull().default(0),
  preferredLanguage: text("preferred_language").notNull().default("hi"),
  pushToken: text("push_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertDriver = typeof driversTable.$inferInsert;
export type Driver = typeof driversTable.$inferSelect;

export const ridesTable = pgTable("rides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  driverId: integer("driver_id").references(() => driversTable.id),
  pickup: text("pickup").notNull(),
  pickupLat: numeric("pickup_lat", { precision: 10, scale: 6 }),
  pickupLng: numeric("pickup_lng", { precision: 10, scale: 6 }),
  destination: text("destination").notNull(),
  dropLat: numeric("drop_lat", { precision: 10, scale: 6 }),
  dropLng: numeric("drop_lng", { precision: 10, scale: 6 }),
  vehicleType: text("vehicle_type").notNull(),
  rideMode: text("ride_mode").notNull().default("economy"),
  price: numeric("price", { precision: 8, scale: 2 }).notNull(),
  distanceKm: numeric("distance_km", { precision: 6, scale: 2 }),
  status: text("status").notNull().default("searching"),
  scheduledAt: timestamp("scheduled_at"),
  isScheduled: boolean("is_scheduled").notNull().default(false),
  paymentMethod: text("payment_method").notNull().default("Cash"),
  cashCollected: boolean("cash_collected").notNull().default(false),
  commissionAmount: numeric("commission_amount", { precision: 8, scale: 2 }).default("0"),
  driverEarning: numeric("driver_earning", { precision: 8, scale: 2 }).default("0"),
  userRating: integer("user_rating"),
  completionPin: integer("completion_pin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InsertRide = typeof ridesTable.$inferInsert;
export type Ride = typeof ridesTable.$inferSelect;

export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountPct: integer("discount_pct").notNull().default(10),
  maxUses: integer("max_uses").notNull().default(100),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type PromoCode = typeof promoCodesTable.$inferSelect;

export const driverKycTable = pgTable("driver_kyc", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id),
  aadhaarFront: text("aadhaar_front"),
  aadhaarBack: text("aadhaar_back"),
  licenseFront: text("license_front"),
  licenseBack: text("license_back"),
  rcFront: text("rc_front"),
  selfie: text("selfie"),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: text("verified_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type DriverKyc = typeof driverKycTable.$inferSelect;

export const scheduledRidesTable = pgTable("scheduled_rides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  pickup: text("pickup").notNull(),
  destination: text("destination").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  rideMode: text("ride_mode").notNull().default("economy"),
  price: numeric("price", { precision: 8, scale: 2 }).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type ScheduledRide = typeof scheduledRidesTable.$inferSelect;

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  driverId: integer("driver_id").references(() => driversTable.id),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  rideId: integer("ride_id").references(() => ridesTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(),
  accountDetails: text("account_details").notNull(),
  status: text("status").notNull().default("pending"),
  processedAt: timestamp("processed_at"),
  processedBy: text("processed_by"),
  rejectionReason: text("rejection_reason"),
  transactionRef: text("transaction_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;
