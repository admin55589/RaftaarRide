# RaftaarRide — API Server (Node.js + Fastify)

## Setup

```bash
pnpm install
pnpm run dev
```

## Environment Variables
Set these in your environment:
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SESSION_SECRET=your_random_secret_string
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
FIREBASE_APP_CHECK_TOKEN=your_firebase_token
FAST2SMS_API_KEY=your_fast2sms_key   # optional, fallback OTP used in dev
```

## Database Setup
```bash
cd ../../lib/db
pnpm run push
```

## API Routes
| Route | Description |
|-------|-------------|
| POST /api/auth/send-otp | Send OTP to phone |
| POST /api/auth/verify-otp | Verify OTP |
| POST /api/rides | Book a ride |
| PATCH /api/rides/:id/status | Update ride status |
| POST /api/driver-auth/login | Driver login |
| GET /api/driver-auth/rides/active | Active ride for driver |
| POST /api/payment/order | Create Razorpay order |
| GET /api/admin/stats | Admin dashboard stats |

## Socket Events
| Event | Direction | Description |
|-------|-----------|-------------|
| driver:new_ride | Server → Driver | New ride request |
| ride:pin | Server → Passenger | PIN for ride completion |
| ride:status_update | Server → Both | Ride status changed |

## Commission
- Admin commission: **6.7%** per ride
- Driver earning: **93.3%** per ride
