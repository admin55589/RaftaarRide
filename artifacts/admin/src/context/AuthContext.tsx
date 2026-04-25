import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { firebaseAdminLogout } from "@/lib/firebase";
import { setGlobalLogout } from "./logout";

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "raftaar_admin_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

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

  const login = (newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    tokenRef.current = newToken;
    setToken(newToken);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
