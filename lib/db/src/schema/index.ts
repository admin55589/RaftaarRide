import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash"),
  otpCode: text("otp_code"),
  otpExpiresAt: timestamp("otp_expires_at"),
  isVerified: boolean("is_verified").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  vehicleNumber: text("vehicle_number").notNull(),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("4.5"),
  status: text("status").notNull().default("active"),
  totalEarnings: numeric("total_earnings", { precision: 10, scale: 2 }).notNull().default("0"),
  totalRides: integer("total_rides").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRideSchema = createInsertSchema(ridesTable).omit({ id: true, createdAt: true });
export type InsertRide = z.infer<typeof insertRideSchema>;
export type Ride = typeof ridesTable.$inferSelect;
