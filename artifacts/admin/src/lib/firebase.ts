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

export async function firebaseAdminLogin(email: string, password: string): Promise<string> {
  const cred = await signInWithEmailAndPassword(auth, email, password);

  if (!ADMIN_EMAILS.includes(cred.user.email ?? "")) {
    await signOut(auth);
    throw new Error("ACCESS_DENIED");
  }

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

  try {
    const res = await fetch(`${apiBase}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json() as { token: string };
      return data.token;
    }
  } catch {
  }

  const firebaseToken = await cred.user.getIdToken();
  return firebaseToken;
}

export async function firebaseAdminLogout(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };
