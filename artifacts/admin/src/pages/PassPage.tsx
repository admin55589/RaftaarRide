import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Shield, TrendingUp, Users, IndianRupee, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/apiBase";

interface PassRecord {
  id: number;
  userId: number;
  plan: string;
  amount: string;
  status: string;
  isCurrentlyActive: boolean;
  startsAt: string;
  expiresAt: string;
  freeCancelsUsed: number;
  freeCancelsLimit: number;
  createdAt: string;
  userName: string | null;
  userPhone: string | null;
  userEmail: string | null;
}

interface PassStats {
  total: number;
  active: number;
  revenueTotal: number;
  thisMonth: number;
  freeCancelsSaved: number;
}

interface PassData {
  success: boolean;
  passes: PassRecord[];
  stats: PassStats;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function PassPage() {
  const { token } = useAuth();

  const { data, isLoading, refetch, isFetching } = useQuery<PassData>({
    queryKey: ["admin-passes"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/passes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 30 * 1000,
  });

  const passes = data?.passes ?? [];
  const stats = data?.stats;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            🛡️ RaftaarPass Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monthly pass subscribers — ₹149/month
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-card border border-yellow-500/30 rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Active Passes</p>
            <p className="text-3xl font-bold text-yellow-400">{stats.active}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Right now</p>
          </div>
          <div className="bg-card border border-green-500/20 rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-3xl font-bold text-green-400">₹{stats.revenueTotal.toLocaleString("en-IN")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">From active passes</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="text-3xl font-bold text-foreground">{stats.thisMonth}</p>
            <p className="text-xs text-muted-foreground mt-0.5">New subscribers</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">All Time</p>
            <p className="text-3xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total passes sold</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Free Cancels Used</p>
            <p className="text-3xl font-bold text-foreground">{stats.freeCancelsSaved}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Across all passes</p>
          </div>
        </div>
      )}

      {/* Value card */}
      {stats && stats.active > 0 && (
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-4 flex flex-wrap gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Monthly Recurring Revenue (MRR)</p>
            <p className="text-2xl font-bold text-yellow-400">
              ₹{(stats.active * 149).toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Revenue / Pass</p>
            <p className="text-2xl font-bold text-foreground">₹149</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Retention (if all renew)</p>
            <p className="text-2xl font-bold text-green-400">₹{(stats.active * 149 * 12).toLocaleString("en-IN")}/yr</p>
          </div>
        </div>
      )}

      {/* Pass Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Loading subscribers...
        </div>
      ) : passes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
          <Shield className="w-12 h-12 opacity-20 mb-3" />
          <p className="text-lg font-medium">Abhi koi pass subscriber nahi</p>
          <p className="text-sm mt-1">Jab users subscribe karenge, yahan dikhega</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">User</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Valid Till</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Free Cancels</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Subscribed</th>
              </tr>
            </thead>
            <tbody>
              {passes.map((pass) => (
                <tr key={pass.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{pass.userName ?? "User #" + pass.userId}</p>
                    <p className="text-xs text-muted-foreground">{pass.userPhone}</p>
                  </td>
                  <td className="px-4 py-3">
                    {pass.isCurrentlyActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold">
                        ✅ Active · {daysLeft(pass.expiresAt)}d left
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 text-xs font-semibold">
                        <XCircle className="w-3 h-3" />
                        Expired
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">{formatDate(pass.expiresAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-500 rounded-full"
                          style={{
                            width: `${((pass.freeCancelsLimit - pass.freeCancelsUsed) / pass.freeCancelsLimit) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {pass.freeCancelsLimit - pass.freeCancelsUsed}/{pass.freeCancelsLimit}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    ₹{pass.amount}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDate(pass.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
