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

async function getFirebaseAuth() {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");

  const firebaseConfig = {
    apiKey: FIREBASE_API_KEY,
    authDomain: "raftaarride.com",
    projectId: "raftaarride-31846",
    storageBucket: "raftaarride-31846.firebasestorage.app",
    messagingSenderId: "212026126564",
    appId: "1:212026126564:android:2be23488c5423224407cf1",
  };

  const app =
    getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  return getAuth(app);
}

async function firebaseRegister(params: {
  name: string;
  email: string;
  password: string;
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
  await updateProfile(cred.user, { displayName: params.name });
  const token = await cred.user.getIdToken();
  return {
    token,
    user: {
      id: cred.user.uid,
      name: params.name,
      phone: "",
      email: params.email,
      isVerified: cred.user.emailVerified,
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
  }): Promise<AuthResponse> => {
    if (isFirebaseReady && body.email) {
      try {
        return await firebaseRegister({
          name: body.name,
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
    post<{ message: string; otp?: string }>("/auth/send-otp", { phone }),

  verifyOtp: (body: { phone: string; otp: string; name?: string }) =>
    post<AuthResponse>("/auth/verify-otp", body),

  firebaseLogout,
};
