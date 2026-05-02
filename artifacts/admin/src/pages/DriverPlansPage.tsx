import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard, Search, RefreshCw, CalendarClock, CheckCircle2,
  XCircle, AlertTriangle, ChevronDown, Plus, TrendingUp,
  IndianRupee, Car, ArrowUpDown, Download,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/apiBase";
import { VehicleBadge, formatDate } from "@/components/shared";

interface DriverPlanRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  vehicleType: string;
  vehicleNumber: string;
  status: string;
  planType: string | null;
  planBilling: string | null;
  planStartAt: string | null;
  planEndAt: string | null;
  isTrial: boolean | null;
  trialUsed: boolean;
  isActive: boolean;
  daysLeft: number;
  planStatus: "active" | "trial" | "expired" | "no_plan";
  totalEarnings: string | null;
  walletBalance: string | null;
  totalRides: number;
}

const PLAN_STATUS_CONFIG = {
  active:  { label: "Active",     color: "text-green-400",        bg: "bg-green-500/10 border-green-500/20",   icon: CheckCircle2 },
  trial:   { label: "Free Trial", color: "text-yellow-400",       bg: "bg-yellow-500/10 border-yellow-500/20", icon: CalendarClock },
  expired: { label: "Expired",    color: "text-red-400",          bg: "bg-red-500/10 border-red-500/20",       icon: XCircle },
  no_plan: { label: "No Plan",    color: "text-muted-foreground", bg: "bg-muted/40 border-border",             icon: AlertTriangle },
};

const VEHICLE_LABEL: Record<string, string> = {
  bike: "Bike", auto: "Auto", cab: "Cab", prime: "Prime", suv: "SUV",
};

const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
  n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n.toFixed(0)}`;

function PlanStatusBadge({ status }: { status: DriverPlanRow["planStatus"] }) {
  const cfg = PLAN_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
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

function ExtendPlanModal({ driver, onClose, onSuccess }: {
  driver: DriverPlanRow; onClose: () => void; onSuccess: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  const handleExtend = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/driver-plans/${driver.id}/extend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `✅ ${driver.name} ka plan ${days} din badha diya` });
        onSuccess(); onClose();
      } else {
        toast({ title: data.message ?? "Error", variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-base font-bold text-foreground mb-1">Plan Extend Karo</h3>
        <p className="text-sm text-muted-foreground mb-4">
          <span className="font-medium text-foreground">{driver.name}</span> — {driver.vehicleNumber}
          {driver.planEndAt && <span className="block text-xs mt-1">Current end: {formatDate(driver.planEndAt)}</span>}
        </p>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Kitne din add karein?</label>
        <div className="flex items-center gap-2 mb-4">
          {[7, 15, 30, 60, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${days === d ? "bg-yellow-500 border-yellow-500 text-black" : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"}`}>
              {d}d
            </button>
          ))}
        </div>
        <input type="number" min={1} max={365} value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
          className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-4"
          placeholder="Custom days" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-medium bg-muted/40 text-muted-foreground hover:bg-muted border border-border transition-colors">Cancel</button>
          <button onClick={handleExtend} disabled={loading}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-yellow-500 text-black hover:bg-yellow-400 transition-colors disabled:opacity-60">
            {loading ? "Extending..." : `+${days} Din Add Karo`}
          </button>
        </div>
      </div>
    </div>
  );
}

type FilterType = "all" | "active" | "trial" | "expired" | "no_plan";
type SortKey = "earnings_desc" | "earnings_asc" | "rides_desc" | "name_asc";

function downloadCsv(data: DriverPlanRow[]) {
  const headers = ["ID","Name","Phone","Vehicle","Vehicle No","Plan Status","Plan Type","Billing","Plan Start","Plan End","Days Left","Trial Used","Total Earnings","Wallet Balance","Total Rides"];
  const rows = data.map((d) => [
    d.id, d.name, d.phone, d.vehicleType, d.vehicleNumber,
    d.planStatus, d.planType ?? "", d.planBilling ?? "",
    d.planStartAt ? formatDate(d.planStartAt) : "",
    d.planEndAt ? formatDate(d.planEndAt) : "",
    d.daysLeft, d.trialUsed ? "Yes" : "No",
    Number(d.totalEarnings ?? 0).toFixed(2),
    Number(d.walletBalance ?? 0).toFixed(2),
    d.totalRides,
  ].map((v) => JSON.stringify(v)).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `driver-plans-earnings-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function DriverPlansPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("earnings_desc");
  const [extendDriver, setExtendDriver] = useState<DriverPlanRow | null>(null);

  const { data: drivers = [], isLoading, refetch, isFetching } = useQuery<DriverPlanRow[]>({
    queryKey: ["admin-driver-plans"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/driver-plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 60000,
  });

  const stats = useMemo(() => ({
    active:        drivers.filter((d) => d.planStatus === "active").length,
    trial:         drivers.filter((d) => d.planStatus === "trial").length,
    expired:       drivers.filter((d) => d.planStatus === "expired").length,
    no_plan:       drivers.filter((d) => d.planStatus === "no_plan").length,
    totalEarnings: drivers.reduce((s, d) => s + Number(d.totalEarnings ?? 0), 0),
    totalRides:    drivers.reduce((s, d) => s + (d.totalRides ?? 0), 0),
    totalWallet:   drivers.reduce((s, d) => s + Number(d.walletBalance ?? 0), 0),
  }), [drivers]);

  const filtered = useMemo(() => {
    let list = drivers.filter((d) => {
      const q = search.toLowerCase();
      return (
        (d.name.toLowerCase().includes(q) || d.phone.includes(q) || d.vehicleNumber.toLowerCase().includes(q)) &&
        (filter === "all" || d.planStatus === filter) &&
        (vehicleFilter === "all" || d.vehicleType === vehicleFilter)
      );
    });
    list = [...list].sort((a, b) => {
      if (sortKey === "earnings_desc") return Number(b.totalEarnings ?? 0) - Number(a.totalEarnings ?? 0);
      if (sortKey === "earnings_asc")  return Number(a.totalEarnings ?? 0) - Number(b.totalEarnings ?? 0);
      if (sortKey === "rides_desc")    return (b.totalRides ?? 0) - (a.totalRides ?? 0);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [drivers, search, filter, vehicleFilter, sortKey]);

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all",     label: `All (${drivers.length})` },
    { key: "active",  label: `Active (${stats.active})` },
    { key: "trial",   label: `Free Trial (${stats.trial})` },
    { key: "expired", label: `Expired (${stats.expired})` },
    { key: "no_plan", label: `No Plan (${stats.no_plan})` },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-yellow-500" />
            Driver Plans & Earnings
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Sabhi drivers ke plan aur total earnings ek jagah</p>
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

      {/* Stats Row 1 — Plan counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CheckCircle2}  label="Active Plans"  value={String(stats.active)}  color="bg-green-500/10 text-green-400" />
        <StatCard icon={CalendarClock} label="Free Trials"   value={String(stats.trial)}   color="bg-yellow-500/10 text-yellow-400" />
        <StatCard icon={XCircle}       label="Expired"       value={String(stats.expired)} color="bg-red-500/10 text-red-400" />
        <StatCard icon={AlertTriangle} label="No Plan"       value={String(stats.no_plan)} color="bg-muted text-muted-foreground" />
      </div>

      {/* Stats Row 2 — Earnings summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={IndianRupee}
          label="Sabhi Drivers ki Kul Earnings"
          value={fmt(stats.totalEarnings)}
          sub={`${drivers.length} drivers se total`}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          icon={Car}
          label="Platform par Kul Rides"
          value={stats.totalRides.toLocaleString("en-IN")}
          sub="Completed rides (all time)"
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Drivers ka Kul Wallet Balance"
          value={fmt(stats.totalWallet)}
          sub="Unclaimed earnings"
          color="bg-purple-500/10 text-purple-400"
        />
      </div>

      {/* Filters + Search + Sort */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filter === key ? "bg-yellow-500 border-yellow-500 text-black" : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Vehicle filter */}
          <div className="relative flex items-center">
            <ChevronDown className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-lg bg-card border border-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none">
              <option value="all">All Vehicles</option>
              <option value="bike">🏍️ Bike</option>
              <option value="auto">🛺 Auto</option>
              <option value="cab">🚗 Cab</option>
              <option value="prime">🚗 Prime</option>
              <option value="suv">🚙 SUV</option>
            </select>
          </div>
          {/* Sort */}
          <div className="relative flex items-center">
            <ArrowUpDown className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="pl-8 pr-3 py-2 rounded-lg bg-card border border-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none">
              <option value="earnings_desc">Earnings: High → Low</option>
              <option value="earnings_asc">Earnings: Low → High</option>
              <option value="rides_desc">Rides: Most First</option>
              <option value="name_asc">Name: A → Z</option>
            </select>
          </div>
          {/* Search */}
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="search" placeholder="Search driver..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg bg-card border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 w-52" />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading driver plans & earnings...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <CreditCard className="w-8 h-8 opacity-30" />
            <span className="text-sm">Koi driver nahi mila</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Driver</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Vehicle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Plan End</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Days Left</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-yellow-500 uppercase tracking-wider whitespace-nowrap">Total Earnings</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Wallet</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Rides</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d, idx) => {
                  const earnings = Number(d.totalEarnings ?? 0);
                  const wallet  = Number(d.walletBalance  ?? 0);
                  return (
                    <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                      {/* Rank */}
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{idx + 1}</td>

                      {/* Driver */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground whitespace-nowrap">{d.name}</div>
                        <div className="text-xs text-muted-foreground">{d.phone}</div>
                      </td>

                      {/* Vehicle */}
                      <td className="px-4 py-3">
                        <VehicleBadge type={d.vehicleType} />
                        <div className="text-xs text-muted-foreground mt-0.5">{d.vehicleNumber}</div>
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3">
                        <PlanStatusBadge status={d.planStatus} />
                        {d.planType && (
                          <div className="text-xs text-muted-foreground mt-1 capitalize">
                            {VEHICLE_LABEL[d.planType] ?? d.planType} · {d.planBilling ?? "—"}
                          </div>
                        )}
                      </td>

                      {/* Plan End */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {d.planEndAt ? (
                          <span className={d.isActive ? "text-muted-foreground" : "text-red-400"}>
                            {formatDate(d.planEndAt)}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>

                      {/* Days Left */}
                      <td className="px-4 py-3">
                        {d.isActive ? (
                          <span className={`font-bold text-sm ${d.daysLeft <= 3 ? "text-red-400" : d.daysLeft <= 7 ? "text-yellow-400" : "text-green-400"}`}>
                            {d.daysLeft}d
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>

                      {/* Total Earnings ★ */}
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-foreground whitespace-nowrap">
                          ₹{earnings.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">lifetime</div>
                      </td>

                      {/* Wallet Balance */}
                      <td className="px-4 py-3 text-right">
                        <div className={`font-semibold text-sm whitespace-nowrap ${wallet > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                          ₹{wallet.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </td>

                      {/* Total Rides */}
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-foreground">{(d.totalRides ?? 0).toLocaleString("en-IN")}</div>
                        <div className="text-[10px] text-muted-foreground">rides</div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setExtendDriver(d)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors whitespace-nowrap"
                        >
                          <Plus className="w-3 h-3" />
                          Extend
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Totals Footer */}
              {filtered.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">
                      Filtered Total ({filtered.length} drivers)
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-yellow-400 whitespace-nowrap">
                        ₹{filtered.reduce((s, d) => s + Number(d.totalEarnings ?? 0), 0)
                          .toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-emerald-400 whitespace-nowrap">
                        ₹{filtered.reduce((s, d) => s + Number(d.walletBalance ?? 0), 0)
                          .toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-foreground">
                        {filtered.reduce((s, d) => s + (d.totalRides ?? 0), 0).toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            {filtered.length} driver{filtered.length !== 1 ? "s" : ""} shown
            {(filter !== "all" || vehicleFilter !== "all" || search) ? ` (filtered from ${drivers.length})` : ""}
          </div>
        )}
      </div>

      {extendDriver && (
        <ExtendPlanModal driver={extendDriver} onClose={() => setExtendDriver(null)} onSuccess={() => refetch()} />
      )}
    </div>
  );
}
