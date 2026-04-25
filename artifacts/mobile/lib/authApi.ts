const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const isFirebaseReady =
  !!FIREBASE_API_KEY && FIREBASE_API_KEY !== "GOOGLE_API_KEY";

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string | number;
    name: string;
    phone: string;
    email?: string | null;
    isVerified: boolean;
    isFirebase?: boolean;
  };
}

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: "raftaarride-31847.firebaseapp.com",
  projectId: "raftaarride-31847",
  storageBucket: "raftaarride-31847.firebasestorage.app",
  messagingSenderId: "796255910809",
  appId: "1:796255910809:android:d7d981dbe6a67f5e1eb108",
};

async function getFirebaseApp() {
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

async function getFirebaseAuth() {
  const { getAuth } = await import("firebase/auth");
  const app = await getFirebaseApp();
  return getAuth(app);
}

async function getFirebaseFirestore() {
  const { getFirestore } = await import("firebase/firestore");
  const app = await getFirebaseApp();
  return getFirestore(app);
}

async function firebaseRegister(params: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<AuthResponse> {
  const { createUserWithEmailAndPassword, updateProfile } = await import(
    "firebase/auth"
  );

  const auth = await getFirebaseAuth();

  const cred = await createUserWithEmailAndPassword(
    auth,
    params.email,
    params.password
  );
  const user = cred.user;

  await updateProfile(user, { displayName: params.name });

  // Save user profile to Firestore "users" collection (doc ID = Firebase uid)
  await saveUserToFirestore({
    docId: user.uid,
    uid: user.uid,
    name: params.name,
    email: params.email,
    phone: params.phone ?? "",
    role: "user",
  });

  const token = await user.getIdToken();
  return {
    token,
    user: {
      id: user.uid,
      name: params.name,
      phone: params.phone ?? "",
      email: params.email,
      isVerified: user.emailVerified,
      isFirebase: true,
    },
  };
}

async function firebaseLogin(params: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(
    auth,
    params.email,
    params.password
  );
  const token = await cred.user.getIdToken();
  return {
    token,
    user: {
      id: cred.user.uid,
      name: cred.user.displayName ?? "User",
      phone: cred.user.phoneNumber ?? "",
      email: cred.user.email,
      isVerified: cred.user.emailVerified,
      isFirebase: true,
    },
  };
}

// ─── Driver Firestore save (separate "drivers" collection) ────────
export async function saveDriverToFirestore(params: {
  docId: string;
  uid?: string;
  name: string;
  email?: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber?: string;
}) {
  if (!isFirebaseReady) return;
  try {
    const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
    const db = await getFirebaseFirestore();
    await setDoc(
      doc(db, "drivers", params.docId),
      {
        uid: params.uid ?? params.docId,
        name: params.name,
        email: params.email ?? "",
        phone: params.phone,
        role: "driver",
        vehicleType: params.vehicleType,
        vehicleNumber: params.vehicleNumber,
        licenseNumber: params.licenseNumber ?? "",
        isOnline: false,
        rating: 0,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("[Firestore] saveDriverToFirestore failed:", e);
  }
}

// ─── Firebase Auth + Firestore for Driver ─────────────────────────
export async function firebaseDriverRegister(params: {
  name: string;
  email: string;
  password: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber?: string;
}): Promise<{ uid: string; token: string }> {
  const { createUserWithEmailAndPassword, updateProfile } = await import(
    "firebase/auth"
  );
  const auth = await getFirebaseAuth();

  // 1. Firebase Authentication account banao
  const cred = await createUserWithEmailAndPassword(
    auth,
    params.email,
    params.password
  );
  const user = cred.user;

  // 2. Display name set karo
  await updateProfile(user, { displayName: params.name });

  // 3. Firestore "drivers" collection mein save karo (uid = doc ID)
  await saveDriverToFirestore({
    docId: user.uid,
    uid: user.uid,
    name: params.name,
    email: params.email,
    phone: params.phone,
    vehicleType: params.vehicleType,
    vehicleNumber: params.vehicleNumber,
    licenseNumber: params.licenseNumber,
  });

  const token = await user.getIdToken();
  return { uid: user.uid, token };
}

// ─── Shared Firestore save helper (users collection) ──────────────
export async function saveUserToFirestore(params: {
  docId: string;
  uid?: string;
  name: string;
  email?: string | null;
  phone: string;
  role?: string;
  extraFields?: Record<string, string | boolean | number | null>;
}) {
  if (!isFirebaseReady) return;
  try {
    const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
    const db = await getFirebaseFirestore();
    await setDoc(
      doc(db, "users", params.docId),
      {
        uid: params.uid ?? params.docId,
        name: params.name,
        email: params.email ?? "",
        phone: params.phone,
        role: params.role ?? "user",
        createdAt: serverTimestamp(),
        ...(params.extraFields ?? {}),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("[Firestore] saveUserToFirestore failed:", e);
  }
}

async function firebaseLogout() {
  if (!isFirebaseReady) return;
  try {
    const { signOut } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await signOut(auth);
  } catch {}
}

function mapFirebaseError(code: string): string | null {
  switch (code) {
    case "auth/email-already-in-use":
      return "Yeh email already registered hai";
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "Email ya password galat hai";
    case "auth/weak-password":
      return "Password kam se kam 6 characters ka hona chahiye";
    default:
      return null;
  }
}

export const authApi = {
  register: async (body: {
    name: string;
    phone: string;
    email?: string;
    password: string;
    gender?: string;
  }): Promise<AuthResponse> => {
    if (isFirebaseReady && body.email) {
      try {
        return await firebaseRegister({
          name: body.name,
          email: body.email,
          password: body.password,
          phone: body.phone,
        });
      } catch (err: any) {
        const mapped = mapFirebaseError(err?.code ?? "");
        if (mapped) throw new Error(mapped);
        if (
          err?.code === "auth/invalid-api-key" ||
          err?.code === "auth/configuration-not-found"
        ) {
          return post<AuthResponse>("/auth/register", body);
        }
        throw err;
      }
    }
    return post<AuthResponse>("/auth/register", body);
  },

  login: async (body: {
    phone?: string;
    email?: string;
    password: string;
  }): Promise<AuthResponse> => {
    if (isFirebaseReady && body.email) {
      try {
        return await firebaseLogin({
          email: body.email,
          password: body.password,
        });
      } catch (err: any) {
        const mapped = mapFirebaseError(err?.code ?? "");
        if (mapped) throw new Error(mapped);
        if (
          err?.code === "auth/invalid-api-key" ||
          err?.code === "auth/configuration-not-found"
        ) {
          return post<AuthResponse>("/auth/login", body);
        }
        throw err;
      }
    }
    return post<AuthResponse>("/auth/login", body);
  },

  sendOtp: (phone: string) =>
    post<{ message: string; otp?: string; isNewUser?: boolean; smsSent?: boolean }>("/auth/send-otp", { phone }),

  verifyOtp: async (body: { phone: string; otp: string; name?: string }): Promise<AuthResponse> => {
    const res = await post<AuthResponse>("/auth/verify-otp", body);
    // Phone OTP signup — save to Firestore (doc ID = "phone_<number>")
    const docId = `phone_${res.user.phone.replace(/\D/g, "")}`;
    await saveUserToFirestore({
      docId,
      name: res.user.name || body.name || "",
      email: res.user.email ?? "",
      phone: res.user.phone,
      role: "user",
    });
    return res;
  },

  firebaseLogout,
};
