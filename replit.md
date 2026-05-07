# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run push-force` — force push (skip interactive prompts)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server exec tsx src/seed.ts` — seed the database
- `pnpm --filter @workspace/scripts run db-export > export.sql` — export all DB data as SQL (for migration)

## Replit Independence / External Deployment

The project is fully portable — no Replit-specific code. To deploy externally:

**API Server (Railway)** — `railway.json` uses Dockerfile builder. `nixpacks.toml` also present as fallback.
Required Railway env vars: DATABASE_URL, SESSION_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, TWOFACTOR_API_KEY, FAST2SMS_API_KEY, PORT (auto-set by Railway).
Health check: GET /api/healthz

**Admin Panel (Vercel)** — `vercel.json` at root. Builds `artifacts/admin` → outputs to `artifacts/admin/dist/public`.
Required Vercel env var: `VITE_API_URL=https://workspaceapi-server-production-2e22.up.railway.app`

**Database** — Currently on Replit internal PostgreSQL (host: helium). Must migrate to Neon before cancelling Replit:
1. Export: `pnpm --filter @workspace/scripts run db-export > export.sql`
2. Push schema to Neon: `DATABASE_URL=<neon_url> pnpm --filter @workspace/db run push`
3. Import data: `psql <neon_url> < export.sql`
4. Set `DATABASE_URL=<neon_url>` in Railway dashboard

**GitHub** — No GitHub remote configured yet. To connect:
```
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
After pushing: Railway and Vercel auto-deploy via GitHub integration.

**CI** — `.github/workflows/ci.yml` runs typecheck + build checks on every push.

**API URL** — all mobile/admin files use a single central source:
- Mobile: `artifacts/mobile/lib/api.ts` → env var `EXPO_PUBLIC_DOMAIN`
- Admin: `artifacts/admin/src/lib/apiBase.ts` → env var `VITE_API_URL`
- Fallback for both: `https://workspaceapi-server-production-2e22.up.railway.app`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## SMS / OTP Integration Note

Real SMS OTP delivery via 2Factor API (TWOFACTOR_API_KEY secret). Falls back to dev-mode log if key missing.
Fast2SMS also integrated (FAST2SMS_API_KEY). OTP returned in `res.otp` in dev mode only.

## Artifacts

### RaftaarRide Mobile App (`artifacts/mobile`)
- Expo React Native app, dark premium UI (#0A0A0F bg, #F5A623 primary)
- Screens: Login, Signup, OTP Verify, Home, Booking, Searching, Driver Assigned, Live Tracking, Payment, PaymentSuccess, DriverKYC, DriverEarnings, DriverPlans, ScheduledRides, RideHistory, **Profile, DisputeReport**
- Auth flow: AuthGuard in _layout.tsx → redirects to /auth/login if not logged in
- AuthContext: JWT stored in AsyncStorage, user session persisted across app restarts
- Voice AI (expo-speech): Hindi announcements
- LanguageContext: hi/en toggle, persists to AsyncStorage + loads from user profile's preferredLanguage
- AppContext: surgeMultiplier fetched from GET /api/surge on mount, exposed globally

### RaftaarRide Admin Panel (`artifacts/admin`)
- React + Vite web app at `/admin/`
- Dark theme matching mobile design tokens
- Pages: Login, Dashboard, Users, Drivers, Rides, KYC, Withdrawals, PromoCodes, DriverPlans, PlanRevenue, Referrals, **Disputes, SurgePricing, EarningsReport**, LiveMap, ChatHistory, Broadcast
- Admin credentials: admin.raftaarride@gmail.com / Luck@12345RR

### API Server (`artifacts/api-server`)
- Express 5, serves at `/api`
- User auth: POST /api/auth/register, /api/auth/login, /api/auth/send-otp, /api/auth/verify-otp
- Rides: GET/POST /api/rides, PATCH /api/rides/:id/status (flexAuth ownership), PATCH /api/rides/:id/verify-pin
- Wallet: POST /api/wallet/topup (Razorpay HMAC-SHA256 server-side verify + idempotency)
- Driver: GET /api/driver-auth/earnings, PATCH /api/driver-auth/profile
- Disputes: POST /api/disputes, GET/PATCH /api/admin/disputes/:id
- Surge: GET /api/surge (public), GET/POST /api/admin/surge (admin)
- Earnings: GET /api/admin/earnings (date filter, summary, breakdown)
- JWT-based auth middleware (userAuth / driverAuth / flexAuth / authMiddleware)

## Database Schema (`lib/db/src/schema/index.ts`)

Tables:
- `users` (id, name, email, phone, wallet_balance, preferred_language, referral_code, status, created_at)
- `drivers` (id, name, email, phone, vehicle_type, vehicle_number, rating, wallet_balance, driver_earning, preferred_language, plan_type, status, created_at)
- `rides` (id, user_id, driver_id, pickup_address, drop_address, vehicle_type, price, driver_earning, commission_amount, payment_method, status, completion_pin, created_at)
- `driver_kyc` (id, driver_id, documents, status, created_at)
- `scheduled_rides` (id, user_id, pickup, destination, scheduled_at, vehicle_type, status)
- `wallet_transactions` (id, user_id, driver_id, type, amount, payment_id, created_at)
- `withdrawal_requests` (id, driver_id, amount, method, account_details, status, created_at)
- `plan_transactions` (id, driver_id, plan_type, billing, amount, status, created_at)
- `chat_messages` (id, ride_id, sender_role, sender_id, message, created_at)
- `disputes` (id, ride_id, user_id, driver_id, issue, description, status, admin_note, resolved_at, created_at)
- `surge_settings` (id, multiplier, is_active, reason, updated_by, updated_at)

## orval.config.ts Note
The codegen script post-processes `lib/api-zod/src/index.ts` after orval runs to only export from `./generated/api` (avoids duplicate name conflict between Zod schemas and TS interfaces).
