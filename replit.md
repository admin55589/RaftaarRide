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
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server exec tsx src/seed.ts` — seed the database

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### RaftaarRide Mobile App (`artifacts/mobile`)
- Expo React Native app, dark premium UI (#0A0A0F bg, #F5A623 primary)
- 7 screens: Home (map), Booking, Searching, Driver Assigned, Live Tracking, Payment, Driver Mode
- AsyncStorage persistence, Inter fonts, glass morphism cards, react-native-reanimated animations

### RaftaarRide Admin Panel (`artifacts/admin`)
- React + Vite web app at `/admin/`
- Dark theme matching mobile design tokens
- Pages: Login, Dashboard, Users, Drivers, Rides
- JWT auth (admin@raftaarride.com / admin123)
- Charts: Area (rides), Bar (earnings) using Recharts
- Uses generated React Query hooks from `@workspace/api-client-react`

### API Server (`artifacts/api-server`)
- Express 5, serves at `/api`
- Admin endpoints: login, stats, users, drivers, rides, analytics, assign driver
- JWT-based auth middleware for admin routes
- jsonwebtoken package for token signing/verification

## Database Schema (`lib/db/src/schema/index.ts`)

Tables:
- `users` (id, name, email, phone, status, created_at)
- `drivers` (id, name, email, phone, vehicle_type, vehicle_number, rating, status, total_earnings, total_rides, created_at)
- `rides` (id, user_id, driver_id, pickup, destination, vehicle_type, ride_mode, price, status, created_at)

Seeded with 10 users, 6 drivers, 80 rides.

## orval.config.ts Note
The codegen script post-processes `lib/api-zod/src/index.ts` after orval runs to only export from `./generated/api` (avoids duplicate name conflict between Zod schemas and TS interfaces).
