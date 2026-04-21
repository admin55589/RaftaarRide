-- =====================================================
-- RaftaarRide — Full Database Migration Backup
-- Generated: 2026-04-21
-- Database: PostgreSQL (Drizzle ORM)
-- Tables: 8 (users, drivers, rides, scheduled_rides,
--          driver_kyc, promo_codes, wallet_transactions,
--          withdrawal_requests)
-- =====================================================

-- =====================================================
-- TABLE 1: users
-- =====================================================
CREATE TABLE IF NOT EXISTS "users" (
  "id"                 serial PRIMARY KEY NOT NULL,
  "name"               text NOT NULL,
  "email"              text,
  "phone"              text NOT NULL,
  "password_hash"      text,
  "photo_url"          text,
  "gender"             text,
  "otp_code"           text,
  "otp_expires_at"     timestamp,
  "is_verified"        boolean DEFAULT false NOT NULL,
  "status"             text DEFAULT 'active' NOT NULL,
  "wallet_balance"     numeric(10, 2) DEFAULT '0' NOT NULL,
  "preferred_language" text DEFAULT 'hi' NOT NULL,
  "created_at"         timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email"),
  CONSTRAINT "users_phone_unique" UNIQUE("phone")
);

-- =====================================================
-- TABLE 2: drivers
-- =====================================================
CREATE TABLE IF NOT EXISTS "drivers" (
  "id"                 serial PRIMARY KEY NOT NULL,
  "name"               text NOT NULL,
  "email"              text NOT NULL,
  "phone"              text NOT NULL,
  "password_hash"      text,
  "license_number"     text,
  "vehicle_type"       text NOT NULL,
  "vehicle_number"     text NOT NULL,
  "photo_url"          text,
  "rating"             numeric(3, 2)  DEFAULT '4.5' NOT NULL,
  "status"             text DEFAULT 'pending' NOT NULL,
  "kyc_status"         text DEFAULT 'pending' NOT NULL,
  "is_online"          boolean DEFAULT false NOT NULL,
  "driver_lat"         numeric(10, 6),
  "driver_lng"         numeric(10, 6),
  "total_earnings"     numeric(10, 2) DEFAULT '0' NOT NULL,
  "wallet_balance"     numeric(10, 2) DEFAULT '0' NOT NULL,
  "total_rides"        integer DEFAULT 0 NOT NULL,
  "preferred_language" text DEFAULT 'hi' NOT NULL,
  "created_at"         timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "drivers_email_unique" UNIQUE("email")
);

-- =====================================================
-- TABLE 3: rides
-- =====================================================
CREATE TABLE IF NOT EXISTS "rides" (
  "id"               serial PRIMARY KEY NOT NULL,
  "user_id"          integer NOT NULL,
  "driver_id"        integer,
  "pickup"           text NOT NULL,
  "pickup_lat"       numeric(10, 6),
  "pickup_lng"       numeric(10, 6),
  "destination"      text NOT NULL,
  "drop_lat"         numeric(10, 6),
  "drop_lng"         numeric(10, 6),
  "vehicle_type"     text NOT NULL,
  "ride_mode"        text DEFAULT 'economy' NOT NULL,
  "price"            numeric(8, 2) NOT NULL,
  "distance_km"      numeric(6, 2),
  "status"           text DEFAULT 'searching' NOT NULL,
  "scheduled_at"     timestamp,
  "is_scheduled"     boolean DEFAULT false NOT NULL,
  "commission_amount" numeric(8, 2) DEFAULT '0',
  "driver_earning"   numeric(8, 2) DEFAULT '0',
  "created_at"       timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rides_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "rides_driver_id_drivers_id_fk"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
);

-- =====================================================
-- TABLE 4: scheduled_rides
-- =====================================================
CREATE TABLE IF NOT EXISTS "scheduled_rides" (
  "id"           serial PRIMARY KEY NOT NULL,
  "user_id"      integer NOT NULL,
  "pickup"       text NOT NULL,
  "destination"  text NOT NULL,
  "vehicle_type" text NOT NULL,
  "ride_mode"    text DEFAULT 'economy' NOT NULL,
  "price"        numeric(8, 2) NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "status"       text DEFAULT 'pending' NOT NULL,
  "notes"        text,
  "created_at"   timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "scheduled_rides_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
);

-- =====================================================
-- TABLE 5: driver_kyc
-- =====================================================
CREATE TABLE IF NOT EXISTS "driver_kyc" (
  "id"               serial PRIMARY KEY NOT NULL,
  "driver_id"        integer NOT NULL,
  "aadhaar_front"    text,
  "aadhaar_back"     text,
  "license_front"    text,
  "license_back"     text,
  "rc_front"         text,
  "selfie"           text,
  "status"           text DEFAULT 'pending' NOT NULL,
  "rejection_reason" text,
  "verified_at"      timestamp,
  "verified_by"      text,
  "created_at"       timestamp DEFAULT now() NOT NULL,
  "updated_at"       timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "driver_kyc_driver_id_drivers_id_fk"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
);

-- =====================================================
-- TABLE 6: promo_codes
-- =====================================================
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id"          serial PRIMARY KEY NOT NULL,
  "code"        text NOT NULL,
  "discount_pct" integer DEFAULT 10 NOT NULL,
  "max_uses"    integer DEFAULT 100 NOT NULL,
  "used_count"  integer DEFAULT 0 NOT NULL,
  "expires_at"  timestamp,
  "is_active"   boolean DEFAULT true NOT NULL,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);

-- =====================================================
-- TABLE 7: wallet_transactions
-- =====================================================
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id"          serial PRIMARY KEY NOT NULL,
  "user_id"     integer,
  "driver_id"   integer,
  "type"        text NOT NULL,
  "amount"      numeric(10, 2) NOT NULL,
  "description" text NOT NULL,
  "ride_id"     integer,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "wallet_transactions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "wallet_transactions_driver_id_drivers_id_fk"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id"),
  CONSTRAINT "wallet_transactions_ride_id_rides_id_fk"
    FOREIGN KEY ("ride_id") REFERENCES "rides"("id")
);

-- =====================================================
-- TABLE 8: withdrawal_requests
-- =====================================================
CREATE TABLE IF NOT EXISTS "withdrawal_requests" (
  "id"                serial PRIMARY KEY NOT NULL,
  "driver_id"         integer NOT NULL,
  "amount"            numeric(10, 2) NOT NULL,
  "method"            text NOT NULL,
  "account_details"   text NOT NULL,
  "status"            text DEFAULT 'pending' NOT NULL,
  "processed_at"      timestamp,
  "processed_by"      text,
  "rejection_reason"  text,
  "transaction_ref"   text,
  "created_at"        timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "withdrawal_requests_driver_id_drivers_id_fk"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
);

-- =====================================================
-- NOTES
-- To apply on a fresh PostgreSQL database:
--   psql -U <user> -d <dbname> -f MIGRATION_BACKUP.sql
--
-- To re-generate via Drizzle:
--   cd lib/db && pnpm exec drizzle-kit generate
--
-- To push schema directly to DB (safe, no SQL needed):
--   cd lib/db && pnpm exec drizzle-kit push
-- =====================================================
