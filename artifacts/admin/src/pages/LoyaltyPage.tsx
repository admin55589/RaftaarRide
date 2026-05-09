import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, Star, IndianRupee, Users, RefreshCw, AlertTriangle, ToggleLeft, ToggleRight, Save, TrendingDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/apiBase";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface LoyaltyData {
  stats: {
    totalExpense: number;
    totalRedemptions: number;
    totalActivePoints: number;
    potentialLiability: number;
    activeUsers: number;
    avgPointsPerActiveUser: number;
    effectiveCashbackPct: string;
  };
  config: {
    enabled: boolean;
    ptsPerRupee10: number;
    redemptionPts: number;
    redemptionRupees: number;
  };
  recentRedemptions: Array<{
    id: number;
    userId: number | null;
    amount: string;
    description: string;
    createdAt: string;
    user: { name: string; phone: string } | null;
  }>;
}

export function LoyaltyPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<LoyaltyData>({
    queryKey: ["admin-loyalty"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/loyalty`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json().then(d => d);
    },
    enabled: !!token,
  });

  const [configForm, setConfigForm] = useState<null | { ptsPerRupee10: string; redemptionPts: string; redemptionRupees: string }>(null);
  const cfg = data?.config;

  const updateConfig = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch(`${API_BASE}/api/admin/loyalty/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-loyalty"] });
      setConfigForm(null);
      toast({ title: "✅ Config Update Ho Gaya", description: "Loyalty program settings save ho gaye" });
    },
    onError: () => toast({ title: "Error", description: "Config update nahi hua", variant: "destructive" }),
  });

  const toggleEnabled = () => {
    if (!cfg) return;
    updateConfig.mutate({ enabled: !cfg.enabled });
  };

  const saveConfig = () => {
    if (!configForm) return;
    const ptsPerRupee10 = Number(configForm.ptsPerRupee10);
    const redemptionPts = Number(configForm.redemptionPts);
    const redemptionRupees = Number(configForm.redemptionRupees);
    if (!ptsPerRupee10 || !redemptionPts || !redemptionRupees) {
      toast({ title: "Galat Values", description: "Sab fields sahi se bharo", variant: "destructive" });
      return;
    }
    updateConfig.mutate({ ptsPerRupee10, redemptionPts, redemptionRupees });
  };

  const stats = data?.stats;
  const redemptions = data?.recentRedemptions ?? [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Loyalty Program Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            RaftaarPoints — user rewards ka full control aur expense tracking
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">Loading loyalty data...</div>
      ) : (
        <>
          {/* ── Stats Grid ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <IndianRupee className="w-4 h-4 text-red-400" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Expense</span>
              </div>
              <div className="text-2xl font-bold text-red-400">{fmt(stats?.totalExpense ?? 0)}</div>
              <div className="text-xs text-muted-foreground mt-1">Platform ne diya users ko</div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active Points</span>
              </div>
              <div className="text-2xl font-bold text-yellow-400">{(stats?.totalActivePoints ?? 0).toLocaleString("en-IN")}</div>
              <div className="text-xs text-muted-foreground mt-1">
                ≈ {fmt(stats?.potentialLiability ?? 0)} potential liability
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active Users</span>
              </div>
              <div className="text-2xl font-bold text-blue-400">{stats?.activeUsers ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Avg {stats?.avgPointsPerActiveUser ?? 0} pts/user
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Redemptions</span>
              </div>
              <div className="text-2xl font-bold text-orange-400">{stats?.totalRedemptions ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">Total redemptions till date</div>
            </div>
          </div>

          {/* ── Business Impact Banner ── */}
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex flex-wrap items-center gap-4">
            <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-300">Platform Cost Analysis</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Effective cashback rate: <span className="text-orange-300 font-bold">{stats?.effectiveCashbackPct}</span> per rupee spent.
                Abhi tak diya: <span className="text-red-400 font-bold">{fmt(stats?.totalExpense ?? 0)}</span>.
                Abhi bhi {(stats?.totalActivePoints ?? 0).toLocaleString("en-IN")} points active hain — agar sab ek baar mein redeem karein to
                platform ko aur <span className="text-red-400 font-bold">{fmt(stats?.potentialLiability ?? 0)}</span> dena hoga.
              </p>
            </div>
          </div>

          {/* ── Program Configuration ── */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Program Settings</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Exchange rate aur program enable/disable karo</p>
              </div>
              <button
                onClick={toggleEnabled}
                disabled={updateConfig.isPending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  cfg?.enabled
                    ? "bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30"
                    : "bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30"
                }`}
              >
                {cfg?.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {cfg?.enabled ? "Program ACTIVE" : "Program DISABLED"}
              </button>
            </div>

            {/* Config Display + Edit */}
            {configForm === null ? (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Points per ₹10 fare", value: cfg?.ptsPerRupee10 ?? 1, desc: `User ko ₹10 karch karne par ${cfg?.ptsPerRupee10 ?? 1} point milta hai` },
                  { label: "Points to Redeem", value: `${cfg?.redemptionPts ?? 100} pts`, desc: `${cfg?.redemptionPts ?? 100} points collect karne par redeem kar sakte hain` },
                  { label: "Redemption Value", value: fmt(cfg?.redemptionRupees ?? 10), desc: `${cfg?.redemptionPts ?? 100} points = ₹${cfg?.redemptionRupees ?? 10} wallet credit` },
                ].map(item => (
                  <div key={item.label} className="rounded-lg border border-border bg-background p-4">
                    <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                    <div className="text-xl font-bold text-foreground">{item.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
                  </div>
                ))}
                <div className="col-span-3 flex justify-end">
                  <button
                    onClick={() => setConfigForm({
                      ptsPerRupee10: String(cfg?.ptsPerRupee10 ?? 1),
                      redemptionPts: String(cfg?.redemptionPts ?? 100),
                      redemptionRupees: String(cfg?.redemptionRupees ?? 10),
                    })}
                    className="px-4 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
                  >
                    ✏️ Rate Change Karo
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: "ptsPerRupee10" as const, label: "Points per ₹10 fare", hint: "Range: 0–10 (0 = disabled)", min: 0, max: 10 },
                    { key: "redemptionPts" as const, label: "Points needed to Redeem", hint: "Range: 10–1000", min: 10, max: 1000 },
                    { key: "redemptionRupees" as const, label: "Wallet Credit (₹)", hint: "Range: ₹1–₹500", min: 1, max: 500 },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-muted-foreground mb-1.5">{f.label}</label>
                      <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        value={configForm[f.key]}
                        onChange={e => setConfigForm(prev => prev ? { ...prev, [f.key]: e.target.value } : prev)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{f.hint}</p>
                    </div>
                  ))}
                </div>

                {/* Preview of new cashback rate */}
                {(() => {
                  const newPts = Number(configForm.ptsPerRupee10);
                  const newRedPts = Number(configForm.redemptionPts);
                  const newRedRupees = Number(configForm.redemptionRupees);
                  if (!newPts || !newRedPts || !newRedRupees) return null;
                  const cashback = ((newPts / newRedPts) * newRedRupees * 10).toFixed(2);
                  const rupeesPer1000 = ((newPts * 100 / newRedPts) * newRedRupees).toFixed(0);
                  return (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-300">
                      <strong>Preview:</strong> User ko ₹1000 karch karne par ≈ <strong>₹{rupeesPer1000}</strong> wapas milenge ({cashback}% cashback).
                      Naya rate: {newPts} pt per ₹10, {newRedPts} pts = ₹{newRedRupees}.
                    </div>
                  );
                })()}

                <div className="flex gap-3 justify-end">
                  <button onClick={() => setConfigForm(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveConfig}
                    disabled={updateConfig.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {updateConfig.isPending ? "Saving..." : "Save Config"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── How It Works (for admin reference) ── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground mb-4">💡 System Kaise Kaam Karta Hai</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="space-y-1.5">
                <div className="font-semibold text-yellow-400">1️⃣ Points Kaise Milte Hain</div>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  Jab driver ride complete karta hai aur PIN verify karta hai, user ko automatically points milte hain.
                  Current rate: har <strong className="text-foreground">₹10</strong> fare par <strong className="text-foreground">{cfg?.ptsPerRupee10 ?? 1} point</strong>.
                  Example: ₹150 ki ride → 15 points.
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="font-semibold text-green-400">2️⃣ Redemption Flow</div>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  User WalletScreen se redeem karta hai. <strong className="text-foreground">{cfg?.redemptionPts ?? 100} points</strong> collect hone par
                  <strong className="text-foreground"> ₹{cfg?.redemptionRupees ?? 10}</strong> automatically user ke wallet mein credit ho jaata hai.
                  Koi admin approval required nahi — fully automatic.
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="font-semibold text-red-400">3️⃣ Admin Expense</div>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  Yeh ₹{cfg?.redemptionRupees ?? 10} platform ki taraf se credit hoti hai (driver ki earning se nahi kaata).
                  Har ride ka platform fee (₹4–₹15) platform ka revenue hota hai — loyalty expense usi mein se aati hai.
                  Monitor karo: "Total Expense" = ab tak diya, "Potential Liability" = agar sab redeem karein.
                </div>
              </div>
            </div>
          </div>

          {/* ── Recent Redemptions Table ── */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Recent Redemptions</h2>
              <span className="text-xs text-muted-foreground">Last 25 transactions</span>
            </div>
            {redemptions.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                Abhi tak koi redemption nahi hui
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground uppercase">
                      <th className="text-left px-5 py-3">User</th>
                      <th className="text-left px-5 py-3">Phone</th>
                      <th className="text-right px-5 py-3">Amount</th>
                      <th className="text-left px-5 py-3">Description</th>
                      <th className="text-right px-5 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {redemptions.map(r => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">
                          {r.user?.name ?? `User #${r.userId}`}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">
                          {r.user?.phone ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-green-400 font-semibold">
                            +{fmt(Math.abs(Number(r.amount)))}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs truncate">
                          {r.description}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                          {fmtDate(r.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
