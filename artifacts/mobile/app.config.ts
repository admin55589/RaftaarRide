/**
 * app.config.ts — Dynamic Expo config
 *
 * Reads GOOGLE_MAPS_API_KEY from env at build time so the key is never
 * committed to git. Set it in your CI/EAS secrets before building.
 *
 * Google Cloud Console restrictions to apply to this key:
 *   Android: Restrict by SHA-1 fingerprint + package "com.raftaarride.app"
 *   iOS:     Restrict by bundle ID "com.raftaarride.app"
 *   APIs:    Maps SDK for Android, Maps SDK for iOS, Maps JavaScript API ONLY
 *   Quota:   Set daily limit to cap spend (e.g. ₹500/day = ~5000 map loads)
 *
 * For server-side calls (Directions, Geocoding), use a SEPARATE key:
 *   GOOGLE_MAPS_SERVER_KEY — restrict to "Directions API" + "Geocoding API" only.
 *   This key NEVER goes to the client.
 */

import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "RaftaarRide",
  slug: "mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/app-logo.jpg",
  scheme: "mobile",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/app-logo.jpg",
    resizeMode: "contain",
    backgroundColor: "#F5A623",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.raftaarride.app",
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
    },
  },
  android: {
    package: "com.raftaarride.app",
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      foregroundImage: "./assets/images/app-logo.jpg",
      backgroundColor: "#F5A623",
    },
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
      },
    },
  },
  web: {
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    [
      "expo-router",
      {
        origin: "https://replit.com/",
      },
    ],
    "expo-font",
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
