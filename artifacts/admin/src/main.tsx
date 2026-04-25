import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

const REPLIT_API_URL = "https://68e41a5f-c1bd-4337-9c0e-5f9c6dd535e1-00-3rxx9zjx78ze2.janeway.replit.dev";

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.DEV ? undefined : REPLIT_API_URL);

if (apiUrl) {
  setBaseUrl(apiUrl.replace(/\/+$/, ""));
}

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
