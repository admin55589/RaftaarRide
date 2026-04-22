# 🚖 RaftaarRide — Complete Project

Premium ride-hailing platform: 14-17% cheaper than Rapido, 6.7% admin commission.

---

## 📁 Folder Structure

```
RaftaarRide/
├── app/              ← Expo Mobile App (User + Driver)
├── admin/            ← React Admin Panel
├── backend/          ← Node.js API Server
├── database/         ← Drizzle ORM Schema
├── package.json      ← Monorepo root
└── pnpm-workspace.yaml
```

---

## ⚡ Quick Start

### 1. Install dependencies
```bash
pnpm install
```

### 2. Setup Database
```bash
cd database
pnpm run push
```

### 3. Set Environment Variables
Create a `.env` file in project root:
```env
DATABASE_URL=postgresql://user:pass@host:5432/raftaarride
SESSION_SECRET=any_random_long_string
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
FIREBASE_APP_CHECK_TOKEN=your_firebase_token
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyC1bBRw_CsD8y_nlI5szxYk4aFZBxOVjW8
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxx
```

### 4. Run All Services
```bash
# Backend API
pnpm --filter @workspace/api-server run dev

# Admin Panel
pnpm --filter @workspace/admin run dev

# Mobile App
pnpm --filter @workspace/mobile run dev
```

---

## 📱 Mobile App Features
- Phone OTP + Email login (Firebase Auth)
- Ride booking — Bike / Auto / Cab
- Real-time driver matching (Socket.IO)
- Razorpay LIVE payment integration
- Wallet system with transaction history
- Driver mode (online/offline, accept/reject rides)
- Ride completion via 4-digit PIN
- Dark / Light theme toggle
- Hindi / English language toggle
- Hindi Voice AI announcements
- Scheduled rides (future booking)
- KYC document upload (driver)
- Push notifications (FCM)

## 🖥️ Admin Panel Features
- Dashboard with revenue & ride analytics
- KYC approval / rejection with document preview
- Driver management (approve, block)
- User management
- Complete rides history
- Withdrawal request management

## ⚙️ Backend Features
- JWT Auth (separate for User & Driver)
- Socket.IO real-time ride matching
- Auto driver assignment + PIN generation
- 6.7% admin commission auto-calculation
- Razorpay payment verification
- Wallet credit/debit system
- OTP via Firebase (Fast2SMS fallback)
- Scheduled rides management

---

## 🔑 Firebase Setup (Android)
1. `app/google-services.json` — already configured for `com.raftaarride.app`
2. Replace with your own file from Firebase Console if needed
3. Firebase Project ID: `raftaarride-31847`

## 💳 Razorpay
- LIVE mode keys required
- Get from: https://dashboard.razorpay.com

## 📦 Build Android APK
```bash
cd app
npx eas build --platform android --profile preview
```

---

## 🗄️ Database Tables
| Table | Description |
|-------|-------------|
| users | Passenger accounts |
| drivers | Driver accounts |
| rides | All ride records |
| driver_kyc | KYC documents |
| scheduled_rides | Future bookings |
| wallet_transactions | All wallet activity |
| promo_codes | Discount codes |
| withdrawal_requests | Driver payout requests |

---

## 📞 Support
Built with: Expo • React Native • Node.js • Fastify • Socket.IO • Drizzle ORM • PostgreSQL • Razorpay • Firebase
