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

/** Credential-related Firebase error codes that should fall through to API login */
const FIREBASE_CREDENTIAL_ERRORS = new Set([
  "auth/invalid-credential",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/invalid-email",
  "auth/user-disabled",
]);

export async function firebaseAdminLogin(email: string, password: string): Promise<string> {
  const apiBase = getApiBase();

  /* ── Try 1: Firebase auth → firebase-verify → API JWT ─────────────────
     Works when the admin Firebase account exists with the same password.
     Falls through on credential errors so the API login below always runs. */
  let firebaseSignedIn = false;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    if (!ADMIN_EMAILS.includes(cred.user.email ?? "")) {
      await signOut(auth);
      throw new Error("ACCESS_DENIED");
    }

    firebaseSignedIn = true;

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
    } catch {
      /* firebase-verify unreachable (CORS / network) — continue to API login */
    }
  } catch (err: unknown) {
    const code = (err as any)?.code ?? "";
    const msg = (err as any)?.message ?? "";

    /* Re-throw non-credential errors immediately */
    if (msg === "ACCESS_DENIED") throw err;
    if (code === "auth/too-many-requests") throw err;

    /* Credential errors: Firebase account may not exist or has different
       password — silently fall through to direct API login below */
    if (!FIREBASE_CREDENTIAL_ERRORS.has(code)) throw err;
  }

  /* ── Try 2: direct email+password → API JWT ────────────────────────────
     Always attempted when Firebase auth fails with credential errors,
     or when firebase-verify is unreachable. */
  try {
    const res = await fetch(`${apiBase}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json() as { token: string };
      if (data.token) return data.token;
    }
    const errData = await res.json().catch(() => ({})) as { message?: string };
    if (firebaseSignedIn) await signOut(auth).catch(() => {});
    throw new Error(errData.message ?? `Login failed (${res.status})`);
  } catch (networkErr: unknown) {
    if (firebaseSignedIn) await signOut(auth).catch(() => {});

    /* Re-throw our own error (not a network error) */
    if (!(networkErr instanceof TypeError)) throw networkErr;

    const isCors =
      networkErr.message.includes("Failed to fetch") ||
      networkErr.message.includes("NetworkError") ||
      networkErr.message.includes("CORS");

    if (isCors) {
      throw new Error(
        "API server allow nahi kar raha is domain ko (CORS). " +
        "Railway mein ALLOWED_ORIGINS=https://raftaarride.com add karo."
      );
    }
    throw new Error("Network error — internet connection check karo aur dobara try karo.");
  }
}

export async function firebaseAdminLogout(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };
