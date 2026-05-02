import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IndianRupee, TrendingUp, RefreshCw, Search, Download,
  CalendarDays, CreditCard, Bike, Car, ShoppingBag,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/apiBase";
import { VehicleBadge, formatDate } from "@/components/shared";

interface RevenueTransaction {
  id: number;
  driverId: number;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  vehicleNumber: string;
  planVehicleType: string;
  billing: string;
  amountRupees: number;
  razorpayPaymentId: string;
  createdAt: string;
}

interface RevenueData {
  summary: {
    totalRevenue: number;
    totalTransactions: number;
    todayRevenue: number;
    todayTransactions: number;
    monthRevenue: number;
    monthTransactions: number;
  };
  byVehicle: { vehicleType: string; total: number; count: number }[];
  byBilling: { billing: string; total: number; count: number }[];
  monthly: { month: string; total: number; count: number }[];
  recent: RevenueTransaction[];
}

const VEHICLE_EMOJI: Record<string, string> = {
  bike: "🏍️", auto: "🛺", cab: "🚗", prime: "🚗", suv: "🚙",
};
const VEHICLE_LABEL: Record<string, string> = {
  bike: "Bike", auto: "Auto", cab: "Cab", prime: "Prime", suv: "SUV",
};

const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
  n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n.toFixed(0)}`;

function SummaryCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-foreground truncate">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function MonthChart({ data }: { data: { month: string; total: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.total), 1);
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-yellow-500" />
        Monthly Plan Revenue (Last 6 Months)
      </h3>
      <div className="flex items-end gap-3 h-32">
        {data.map((d) => {
          const [year, mon] = d.month.split("-");
          const label = `${monthNames[parseInt(mon) - 1]} ${year?.slice(2)}`;
          const pct = (d.total / max) * 100;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-[10px] text-yellow-400 font-semibold">{fmt(d.total)}</div>
              <div className="w-full flex items-end" style={{ height: "80px" }}>
                <div
                  className="w-full rounded-t-md bg-yellow-500/70 hover:bg-yellow-500 transition-colors"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <div className="text-[9px] text-muted-foreground text-center leading-tight">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function downloadCsv(data: RevenueTransaction[]) {
  const headers = ["ID","Driver","Phone","Vehicle No","Plan Vehicle","Billing","Amount (₹)","Razorpay Payment ID","Date"];
  const rows = data.map((r) => [
    r.id, r.driverName, r.driverPhone, r.vehicleNumber,
    VEHICLE_LABEL[r.planVehicleType] ?? r.planVehicleType,
    r.billing, r.amountRupees, r.razorpayPaymentId,
    new Date(r.createdAt).toLocaleString("en-IN"),
  ].map((v) => JSON.stringify(v)).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `plan-revenue-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function PlanRevenuePage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [billingFilter, setBillingFilter] = useState("all");

  const { data, isLoading, refetch, isFetching } = useQuery<RevenueData>({
    queryKey: ["admin-plan-revenue"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/plan-revenue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 60000,
  });

  const filtered = useMemo(() => {
    if (!data?.recent) return [];
    return data.recent.filter((r) => {
      const q = search.toLowerCase();
      const matchSearch = r.driverName.toLowerCase().includes(q) || r.driverPhone.includes(q) || r.vehicleNumber.toLowerCase().includes(q) || r.razorpayPaymentId.toLowerCase().includes(q);
      const matchBilling = billingFilter === "all" || r.billing === billingFilter;
      return matchSearch && matchBilling;
    });
  }, [data, search, billingFilter]);

  const summary = data?.summary;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-yellow-500" />
            Plan Revenue
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Drivers dwara khareedey gaye plans se aaya revenue</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-muted/40 text-muted-foreground hover:bg-muted border border-border rounded-lg transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            CSV Export
          </button>
          <button
            onClick={() => { refetch(); toast({ title: "Refreshed" }); }}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-muted/40 text-muted-foreground hover:bg-muted border border-border rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SummaryCard
          icon={IndianRupee}
          label="Kul Plan Revenue (All Time)"
          value={fmt(summary?.totalRevenue ?? 0)}
          sub={`${summary?.totalTransactions ?? 0} transactions`}
          color="bg-yellow-500/10 text-yellow-400"
        />
        <SummaryCard
          icon={CalendarDays}
          label="Aaj ka Revenue"
          value={fmt(summary?.todayRevenue ?? 0)}
          sub={`${summary?.todayTransactions ?? 0} plans aaj biki`}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Is Mahine ka Revenue"
          value={fmt(summary?.monthRevenue ?? 0)}
          sub={`${summary?.monthTransactions ?? 0} plans is mahine`}
          color="bg-blue-500/10 text-blue-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly bar chart */}
        <div className="lg:col-span-2">
          {data?.monthly && <MonthChart data={data.monthly} />}
        </div>

        {/* Breakdown side cards */}
        <div className="space-y-3">
          {/* By Billing */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Daily vs Monthly
            </h3>
            {(data?.byBilling ?? []).map((b) => (
              <div key={b.billing} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${b.billing === "daily" ? "bg-orange-400" : "bg-blue-400"}`} />
                  <span className="text-sm font-medium text-foreground capitalize">{b.billing}</span>
                  <span className="text-xs text-muted-foreground">({b.count})</span>
                </div>
                <span className="text-sm font-bold text-foreground">₹{b.total.toLocaleString("en-IN")}</span>
              </div>
            ))}
            {!data?.byBilling?.length && (
              <p className="text-xs text-muted-foreground text-center py-2">Koi data nahi</p>
            )}
          </div>

          {/* By Vehicle */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5" />
              Vehicle Type se Revenue
            </h3>
            {(data?.byVehicle ?? []).map((v) => (
              <div key={v.vehicleType} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span>{VEHICLE_EMOJI[v.vehicleType] ?? "🚘"}</span>
                  <span className="text-sm font-medium text-foreground capitalize">{VEHICLE_LABEL[v.vehicleType] ?? v.vehicleType}</span>
                  <span className="text-xs text-muted-foreground">({v.count})</span>
                </div>
                <span className="text-sm font-bold text-foreground">₹{v.total.toLocaleString("en-IN")}</span>
              </div>
            ))}
            {!data?.byVehicle?.length && (
              <p className="text-xs text-muted-foreground text-center py-2">Koi data nahi</p>
            )}
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-yellow-500" />
            Recent Plan Purchases
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={billingFilter}
              onChange={(e) => setBillingFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-background border border-input text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Plans</option>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="search"
                placeholder="Driver / Payment ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-none w-48"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading revenue data...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <IndianRupee className="w-8 h-8 opacity-20" />
            <span className="text-sm">Koi transaction nahi mili</span>
            <span className="text-xs opacity-60">Jab drivers plan khareedenge, yahan dikhega</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Driver</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vehicle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-yellow-500 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Razorpay ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground whitespace-nowrap">{r.driverName}</div>
                      <div className="text-xs text-muted-foreground">{r.driverPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <VehicleBadge type={r.vehicleType} />
                      <div className="text-xs text-muted-foreground mt-0.5">{r.vehicleNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{VEHICLE_EMOJI[r.planVehicleType] ?? "🚘"}</span>
                        <div>
                          <div className="font-medium text-foreground capitalize text-xs">{VEHICLE_LABEL[r.planVehicleType] ?? r.planVehicleType}</div>
                          <div className={`text-[10px] font-semibold capitalize ${r.billing === "daily" ? "text-orange-400" : "text-blue-400"}`}>
                            {r.billing}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-yellow-400 whitespace-nowrap">
                        ₹{r.amountRupees.toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                        {r.razorpayPaymentId}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">
                      Filtered Total ({filtered.length} transactions)
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-yellow-400 whitespace-nowrap">
                        ₹{filtered.reduce((s, r) => s + r.amountRupees, 0).toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} shown
          </div>
        )}
      </div>
    </div>
  );
}
