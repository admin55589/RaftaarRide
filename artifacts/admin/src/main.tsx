import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

const PRODUCTION_API_URL = "https://workspaceapi-server-production-2e22.up.railway.app";

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.DEV ? undefined : PRODUCTION_API_URL);

if (apiUrl) {
  setBaseUrl(apiUrl.replace(/\/+$/, ""));
}

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
