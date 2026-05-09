import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Users, TrendingUp, RefreshCw, Phone, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/apiBase";

interface ReferralStats {
  totalUsers: number;
  usersWithReferralCode: number;
  usersReferredByOthers: number;
  conversionRate: string;
}

interface TopReferrer {
  id: number;
  name: string;
  phone: string;
  referralCode: string;
  referredCount: number;
  joinedAt: string;
}

interface ReferralData {
  success: boolean;
  stats: ReferralStats;
  topReferrers: TopReferrer[];
}

interface ReferralConfig {
  enabled: boolean;
  bonusAmount: number;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function ReferralPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [bonusInput, setBonusInput] = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useQuery<ReferralData>({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/referrals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch referral data");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: configData, isLoading: configLoading } = useQuery<{ success: boolean; config: ReferralConfig }>({
    queryKey: ["admin-referral-config"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/referral/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch referral config");
      return res.json();
    },
    enabled: !!token,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`${API_BASE}/api/admin/referral/config`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-referral-config"] }),
  });

  const bonusMutation = useMutation({
    mutationFn: async (bonusAmount: number) => {
      const res = await fetch(`${API_BASE}/api/admin/referral/config`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bonusAmount }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referral-config"] });
      setBonusInput("");
    },
  });

  const config = configData?.config;
  const isEnabled = config?.enabled ?? true;
  const stats = data?.stats;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            🎁 Referral Program
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Users jo dusron ko invite kar rahe hain — aur admin control
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

      {/* ── Admin Control Card ── */}
      <div className={`rounded-xl border-2 p-5 transition-all ${isEnabled ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              {isEnabled ? "🟢" : "🔴"} Referral Program — {isEnabled ? "Active" : "Disabled"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEnabled
                ? "Mobile app mein referral section dikh raha hai. Users invite kar sakte hain."
                : "Referral section mobile app se completely hat gaya hai. Users ko koi invite UI nahi dikhega."}
            </p>
          </div>
          <button
            onClick={() => toggleMutation.mutate(!isEnabled)}
            disabled={toggleMutation.isPending || configLoading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md ${
              isEnabled
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-green-500 hover:bg-green-600 text-white"
            }`}
          >
            {isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {toggleMutation.isPending ? "Updating..." : isEnabled ? "Turn OFF" : "Turn ON"}
          </button>
        </div>

        {!isEnabled && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400 font-medium">
              ⚠️ Referral program OFF hai — mobile app mein kisi ko bhi referral card, code, ya invite feature nahi dikhega.
            </p>
          </div>
        )}
      </div>

      {/* ── Bonus Amount Config ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-3">💰 Bonus Amount Config</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
            <span className="text-sm text-muted-foreground">Current bonus (per referral):</span>
            <span className="text-xl font-bold text-amber-400">₹{config?.bonusAmount ?? 50}</span>
            <span className="text-xs text-muted-foreground">(dono ko milega)</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={500}
              value={bonusInput}
              onChange={e => setBonusInput(e.target.value)}
              placeholder="New amount (₹)"
              className="w-36 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => {
                const v = parseInt(bonusInput);
                if (!isNaN(v) && v >= 0 && v <= 500) bonusMutation.mutate(v);
              }}
              disabled={bonusMutation.isPending || !bonusInput}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {bonusMutation.isPending ? "Saving..." : "Update"}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Range: ₹0 – ₹500 per referral. Dono (referrer + new user) ko same amount milega.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Loading referral data...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Users}
              label="Total Users"
              value={stats?.totalUsers ?? 0}
              color="bg-blue-500/10 text-blue-400"
            />
            <StatCard
              icon={Gift}
              label="Users with Referral Code"
              value={stats?.usersWithReferralCode ?? 0}
              sub="Can invite others"
              color="bg-purple-500/10 text-purple-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Referred Users"
              value={stats?.usersReferredByOthers ?? 0}
              sub="Joined via referral"
              color="bg-green-500/10 text-green-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Conversion Rate"
              value={`${stats?.conversionRate ?? 0}%`}
              sub="Users joined via referral"
              color="bg-amber-500/10 text-amber-400"
            />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Top Referrers</h2>
              <span className="text-xs text-muted-foreground">
                Sabse zyada logon ko invite karne wale users
              </span>
            </div>

            {!data?.topReferrers?.length ? (
              <div className="p-8 text-center text-muted-foreground">
                <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Abhi koi referral nahi hua</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b border-border">
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">User</th>
                      <th className="text-left p-3 font-medium">Phone</th>
                      <th className="text-left p-3 font-medium">Referral Code</th>
                      <th className="text-center p-3 font-medium">Invited</th>
                      <th className="text-left p-3 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topReferrers.map((u, i) => (
                      <tr key={u.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="p-3 text-muted-foreground font-mono text-xs">#{i + 1}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {u.name?.charAt(0)?.toUpperCase() ?? "U"}
                            </div>
                            <span className="font-medium text-foreground">{u.name ?? "User"}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span className="font-mono text-xs">{u.phone}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <code className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono font-bold">
                            {u.referralCode}
                          </code>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                            u.referredCount > 0
                              ? "bg-green-500/15 text-green-400"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {u.referredCount}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{formatDate(u.joinedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-semibold text-foreground mb-3">💡 Referral Program Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Referrer Bonus</p>
                <p className="text-lg font-bold text-green-400">₹{config?.bonusAmount ?? 50}</p>
                <p className="text-xs text-muted-foreground">Jab koi unka code use kare</p>
              </div>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">New User Bonus</p>
                <p className="text-lg font-bold text-blue-400">₹{config?.bonusAmount ?? 50}</p>
                <p className="text-xs text-muted-foreground">Referral code lagane par wallet mein</p>
              </div>
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Code Format</p>
                <p className="text-lg font-bold text-purple-400">RR + 6 chars</p>
                <p className="text-xs text-muted-foreground">Auto-generated on registration</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
