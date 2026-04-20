import { useState } from "react";
import { Loader2 } from "lucide-react";
import { adminLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin.raftaarride@gmail.com");
  const [password, setPassword] = useState("Luck@12345RR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminLogin({ email, password });
      login(res.token);
    } catch {
      setError("Invalid credentials. Please check your email and password.");
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
                placeholder="admin@raftaarride.com"
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
          Demo credentials pre-filled above
        </p>
      </div>
    </div>
  );
}
