import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC1bBRw_CsD8y_nlI5szxYk4aFZBxOVjW8",
  authDomain: "raftaarride-31847.firebaseapp.com",
  projectId: "raftaarride-31847",
  storageBucket: "raftaarride-31847.firebasestorage.app",
  messagingSenderId: "796255910809",
  appId: "1:796255910809:web:d7d981dbe6a67f5e1eb108",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

const ADMIN_EMAILS = ["admin.raftaarride@gmail.com"];

const PRODUCTION_API_URL = "https://workspaceapi-server-production-2e22.up.railway.app";

function getApiBase(): string {
  return ((import.meta.env.VITE_API_URL as string | undefined) ??
    (import.meta.env.DEV ? "" : PRODUCTION_API_URL)).replace(/\/+$/, "");
}

export async function firebaseAdminLogin(email: string, password: string): Promise<string> {
  const cred = await signInWithEmailAndPassword(auth, email, password);

  if (!ADMIN_EMAILS.includes(cred.user.email ?? "")) {
    await signOut(auth);
    throw new Error("ACCESS_DENIED");
  }

  const apiBase = getApiBase();

  /* ── Try 1: firebase-verify (exchanges Firebase ID token for API JWT) ── */
  try {
    const firebaseToken = await cred.user.getIdToken();
    const res = await fetch(`${apiBase}/api/admin/firebase-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: firebaseToken }),
    });
    if (res.ok) {
      const data = await res.json() as { token: string };
      if (data.token) return data.token;
    }
    /* Non-ok but reachable (e.g. 403 wrong admin) — fall through to login */
  } catch {
    /* Network / CORS error on firebase-verify — try the direct login path */
  }

  /* ── Try 2: direct email+password login → API JWT ── */
  let apiLoginError = "API server se connect nahi ho pa raha.";
  try {
    const res2 = await fetch(`${apiBase}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res2.ok) {
      const data = await res2.json() as { token: string };
      if (data.token) return data.token;
    }
    /* Server responded but login failed */
    const errData = await res2.json().catch(() => ({})) as { message?: string };
    apiLoginError = errData.message ?? `Login failed (${res2.status})`;
  } catch (networkErr: unknown) {
    /* Network / CORS error — surface a clear message instead of silently
       falling back to the Firebase token (which the API cannot verify and
       would cause an immediate 401-logout loop). */
    await signOut(auth).catch(() => {});

    const isCors =
      networkErr instanceof TypeError &&
      (networkErr.message.includes("Failed to fetch") ||
        networkErr.message.includes("NetworkError") ||
        networkErr.message.includes("CORS"));

    if (isCors) {
      throw new Error(
        "API server allow nahi kar raha is domain ko (CORS). " +
        "Railway mein ALLOWED_ORIGINS=https://raftaarride.com add karo."
      );
    }
    throw new Error("Network error — internet connection check karo aur dobara try karo.");
  }

  /* Both tries reached the server but neither returned a token */
  await signOut(auth).catch(() => {});
  throw new Error(apiLoginError);
}

export async function firebaseAdminLogout(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };
