import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { firebaseAdminLogout } from "@/lib/firebase";
import { setGlobalLogout } from "./logout";

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  tokenExpiresAt: Date | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "raftaar_admin_token";

function getJwtExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp) return new Date(payload.exp * 1000);
  } catch { }
  return null;
}

function isTokenExpired(token: string): boolean {
  const exp = getJwtExpiry(token);
  if (!exp) return false;
  return exp <= new Date();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && isTokenExpired(stored)) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return stored;
  });

  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  const tokenExpiresAt = token ? getJwtExpiry(token) : null;

  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
    return () => setAuthTokenGetter(null);
  }, []);

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    tokenRef.current = null;
    try { await firebaseAdminLogout(); } catch { }
  };

  useEffect(() => {
    setGlobalLogout(logout);
    return () => setGlobalLogout(null);
  });

  useEffect(() => {
    if (!token) return;
    const exp = getJwtExpiry(token);
    if (!exp) return;
    const msUntilExpiry = exp.getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(() => {
      logout();
    }, msUntilExpiry);
    return () => clearTimeout(timer);
  }, [token]);

  const login = (newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    tokenRef.current = newToken;
    setToken(newToken);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token, tokenExpiresAt }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
