# RaftaarRide — Mobile App (Expo React Native)

## Setup

```bash
pnpm install
pnpm run dev
```

## Environment Variables
Create a `.env` file:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id
```

## Firebase (Android Build)
- `google-services.json` is already placed in this folder
- Replace with your own from Firebase Console if needed

## Build APK (EAS)
```bash
npx eas build --platform android --profile preview
```

## Features
- Phone OTP + Email Auth (Firebase)
- Ride booking (Bike / Auto / Cab)
- Real-time driver tracking (Socket.IO)
- Razorpay LIVE payments
- Wallet system
- Driver mode (accept/reject rides + PIN verify)
- Dark / Light theme
- Hindi / English language toggle
- Hindi Voice AI announcements
- Scheduled rides
- Push notifications
