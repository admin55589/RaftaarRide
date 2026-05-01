export const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api/`;
  return "https://workspaceapi-server-production-2e22.up.railway.app/api/";
})();
