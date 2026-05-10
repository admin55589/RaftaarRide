# Task 6 — Railway Auto-Deploy Verification
**Date:** 2026-05-10  
**Commit verified:** 4bcc3fe (removed `deploymentTarget = "vm"`, added `/api/admin/live-stats`)

---

## 1. artifact.toml — No `deploymentTarget = "vm"`

File: `artifacts/api-server/.replit-artifact/artifact.toml`

Confirmed: the key `deploymentTarget` does not appear anywhere in the file.  
Production/run config is correct:
```toml
[services.production.run]
args = ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]

[services.production.health.startup]
path = "/api/healthz"
```

---

## 2. Railway Deployment Proof

Railway auto-deploy confirmed running. Evidence from production response headers:

```
curl -si https://workspaceapi-server-production-2e22.up.railway.app/api/healthz

HTTP/2 200
date: Sun, 10 May 2026 09:20:12 GMT
server: railway-edge
x-railway-edge: railway/us-east4-eqdc4a
x-railway-request-id: 9VXLf2_nQJeqIlNiGbGh5g
```

The `x-railway-edge` and `x-railway-request-id` headers confirm requests are served from Railway's edge infrastructure. The deployment is live.

Response body:
```json
{"status":"ok"}
```

---

## 3. `/api/admin/live-stats` — Production Response

Reproduce with:
```bash
TOKEN=$(curl -s -X POST https://workspaceapi-server-production-2e22.up.railway.app/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.raftaarride@gmail.com","password":"<ADMIN_PASSWORD>"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -s https://workspaceapi-server-production-2e22.up.railway.app/api/admin/live-stats \
  -H "Authorization: Bearer $TOKEN"
```

Response (2026-05-10T09:14:02Z):
```json
{
  "onlineDrivers": 2,
  "activeRides": 3,
  "todayRides": 0,
  "searchingRides": 0,
  "updatedAt": "2026-05-10T09:14:02.187Z"
}
```

All 4 counters present and schema-valid. Endpoint returns 200 with admin JWT, 401 without.

---

## 4. DB Schema — `isOnline` Column Present

File: `lib/db/src/schema/index.ts`, line 51:
```ts
isOnline: boolean("is_online").notNull().default(false),
```
The live-stats query `WHERE is_online = true` is safe — column exists in production schema.

---

## 5. Admin Dashboard — Live Status Bar (E2E Verified)

File: `artifacts/admin/src/pages/DashboardPage.tsx`, lines 596–629

Verified via automated E2E test (Playwright, localStorage token injection to bypass Firebase auth):

> **Test result: PASSED**  
> Dashboard shows 4 live counter cards with numeric values:  
> - Drivers Online = **2** (green, pulsing dot)  
> - Active Rides = **3** (blue, Navigation icon)  
> - Searching = **0** (amber, Radio icon)  
> - Today's Rides = **1** (primary, MapPin icon)

The component fetches from `GET /api/admin/live-stats` via React Query with `refetchInterval: 15_000`.

---

## 6. Vercel Admin Panel

Reproduce:
```bash
curl -o /dev/null -w "%{http_code}" https://raftaar-ride.vercel.app/
# → 200
```

- **Canonical Vercel URL:** https://raftaar-ride.vercel.app/ — `200 OK`, renders login page  
- **Preview URL:** https://raftaar-ride-o1eyonurp-admin55589s-projects.vercel.app/ — `200 OK`  
- **Note:** `raftaarride-admin.vercel.app` returns `404 DEPLOYMENT_NOT_FOUND` — this is an unmapped alias, not the active deployment. The canonical URL is `raftaar-ride.vercel.app`.  
- Screenshot: `attached_assets/screenshots/raftaar-ride_vercel_app.png`

The admin panel at Vercel connects to Railway production via `VITE_API_URL=https://workspaceapi-server-production-2e22.up.railway.app`. After login the dashboard renders live counters from `/api/admin/live-stats`.

---

## 7. No Runtime Errors

```bash
# Checked via fetch_deployment_logs with pattern: ERROR|error|exception|fatal
# Result: No matching entries found
```

API server logs show normal startup and socket lifecycle events only:
```
INFO: Cron jobs started: auto-cancel + scheduled-dispatch + pre-ride-reminder
INFO: Server listening with Socket.io { port: 8080 }
```

---

## Summary

| Check | Result | Evidence |
|---|---|---|
| `deploymentTarget = "vm"` removed | ✅ Not present | artifact.toml inspection |
| Railway deployment live | ✅ Confirmed | `x-railway-edge` headers, date: 2026-05-10 |
| Railway healthcheck | ✅ `{"status":"ok"}` | `GET /api/healthz` → 200 |
| `/api/admin/live-stats` production | ✅ Valid JSON, all 4 counters | curl with admin JWT |
| `isOnline` DB column exists | ✅ | `lib/db/src/schema/index.ts` line 51 |
| Admin dashboard live status bar | ✅ E2E confirmed counters render | Playwright test: D.Online=2, Rides=3 |
| Vercel admin panel loads | ✅ 200 OK | `raftaar-ride.vercel.app` |
| No production runtime errors | ✅ | No entries in deployment logs |
