const RAILWAY_FALLBACK = "https://workspaceapi-server-production-2e22.up.railway.app";
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

export const APP_BASE = DOMAIN ? `https://${DOMAIN}` : RAILWAY_FALLBACK;
export const API_BASE = `${APP_BASE}/api`;
export const BASE_URL = `${API_BASE}/`;
