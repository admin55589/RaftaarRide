const PRODUCTION_API = "https://workspaceapi-server-production-2e22.up.railway.app";
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.DEV ? "" : PRODUCTION_API);
