import { useState } from "react";
import { Loader2 } from "lucide-react";
import { firebaseAdminLogin } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await firebaseAdminLogin(email, password);
      login(token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "ACCESS_DENIED") {
        setError("Yeh account admin nahi hai. Sirf admin email se login karo.");
      } else if (
        msg.includes("auth/invalid-credential") ||
        msg.includes("auth/wrong-password") ||
        msg.includes("auth/user-not-found")
      ) {
        setError("Email ya password galat hai. Dobara check karo.");
      } else if (msg.includes("auth/too-many-requests")) {
        setError("Bahut zyada attempts. Thodi der baad try karo.");
      } else {
        setError("Login failed. Check your email and password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-primary/20 mx-auto mb-4">
            <img src="/admin/app-logo.jpg" alt="RaftaarRide" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">RaftaarRide Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to your admin account</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
                placeholder="admin@raftaarride.com"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <p className="text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Firebase Authentication — RaftaarRide Admin
        </p>
      </div>
    </div>
  );
}
