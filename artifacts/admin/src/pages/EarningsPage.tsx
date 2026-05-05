import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, IndianRupee, Car, RefreshCw, Download } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/apiBase";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const PM_COLORS: Record<string, string> = {
  Cash: "bg-green-500/15 text-green-400",
  UPI: "bg-blue-500/15 text-blue-400",
  Card: "bg-purple-500/15 text-purple-400",
  RaftaarWallet: "bg-orange-500/15 text-orange-400",
};

export function EarningsPage() {
  const { token } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-earnings", from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to, limit: "200" });
      const res = await fetch(`${API_BASE}/api/admin/earnings?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch earnings");
      return res.json();
    },
    enabled: !!token,
  });

  const summary = data?.summary;
  const rides = data?.rides ?? [];

  const PRESETS = [
    { label: "Today", from: today, to: today },
    { label: "This Week", from: new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0], to: today },
    { label: "This Month", from: monthStart, to: today },
    { label: "Last 3 Months", from: new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split("T")[0], to: today },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-green-400" /> Earnings Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Platform revenue aur ride earnings ka detailed breakdown</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-accent">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Date filter */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${from === p.from && to === p.to ? "bg-primary/15 border-primary/40 text-primary font-semibold" : "bg-muted border-border text-muted-foreground hover:bg-accent"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground font-medium">From:</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground font-medium">To:</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading earnings data...
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total Rides", value: summary?.totalRides ?? 0, icon: Car, color: "text-blue-400", bg: "bg-blue-500/10", isCount: true },
              { label: "Gross Revenue", value: summary?.totalRevenue ?? 0, icon: IndianRupee, color: "text-green-400", bg: "bg-green-500/10" },
              { label: "Platform Fees", value: summary?.totalPlatformFees ?? 0, icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
              { label: "Driver Earnings", value: summary?.totalDriverEarnings ?? 0, icon: IndianRupee, color: "text-orange-400", bg: "bg-orange-500/10" },
            ].map(card => (
              <div key={card.label} className="bg-card border border-border rounded-xl p-4">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {card.isCount ? card.value.toLocaleString("en-IN") : fmt(card.value as number)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Breakdown grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment method breakdown */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                💳 By Payment Method
              </h3>
              {!summary?.byPaymentMethod || Object.keys(summary.byPaymentMethod).length === 0 ? (
                <p className="text-muted-foreground text-sm">No data</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(summary.byPaymentMethod as Record<string, { count: number; revenue: number }>).map(([method, stats]) => (
                    <div key={method} className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${PM_COLORS[method] ?? "bg-muted text-muted-foreground"}`}>{method}</span>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{fmt(stats.revenue)}</p>
                        <p className="text-xs text-muted-foreground">{stats.count} rides</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vehicle type breakdown */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                🚗 By Vehicle Type
              </h3>
              {!summary?.byVehicle || Object.keys(summary.byVehicle).length === 0 ? (
                <p className="text-muted-foreground text-sm">No data</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(summary.byVehicle as Record<string, { count: number; revenue: number }>)
                    .sort((a, b) => b[1].revenue - a[1].revenue)
                    .map(([vt, stats]) => (
                      <div key={vt} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground capitalize">{vt}</span>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{fmt(stats.revenue)}</p>
                          <p className="text-xs text-muted-foreground">{stats.count} rides</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Rides table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">Completed Rides ({rides.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Ride ID", "Date", "Vehicle", "Payment", "Fare", "Platform Fee", "Driver Earned"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rides.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Is period mein koi completed ride nahi</td>
                    </tr>
                  ) : (
                    rides.map((r: any) => {
                      const fare = parseFloat(r.price ?? 0);
                      const driverEarning = parseFloat(r.driverEarning ?? 0);
                      const platformFee = fare - driverEarning;
                      return (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-foreground">#{r.id}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                          <td className="px-4 py-3 capitalize text-foreground">{r.vehicleType ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${PM_COLORS[r.paymentMethod] ?? "bg-muted text-muted-foreground"}`}>
                              {r.paymentMethod ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-foreground">₹{fare.toFixed(0)}</td>
                          <td className="px-4 py-3 text-purple-400 font-semibold">₹{platformFee > 0 ? platformFee.toFixed(0) : "—"}</td>
                          <td className="px-4 py-3 text-green-400 font-semibold">₹{driverEarning > 0 ? driverEarning.toFixed(0) : "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
