import { useState } from "react";
import { useListDrivers } from "@workspace/api-client-react";
import { Search, Star, Download, ShieldBan, ShieldCheck, ShieldAlert } from "lucide-react";
import { StatusBadge, VehicleBadge, formatCurrency, formatDate } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function downloadCsv(data: object[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => JSON.stringify((row as any)[h] ?? "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function DriversPage() {
  const { data: drivers, isLoading, refetch } = useListDrivers();
  const { token } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked" | "suspended" | "pending">("all");
  const [updating, setUpdating] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const filtered = (drivers ?? []).filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.email.toLowerCase().includes(search.toLowerCase()) ||
      d.vehicleNumber.toLowerCase().includes(search.toLowerCase());
    const matchVehicle = filter === "all" || d.vehicleType === filter;
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchVehicle && matchStatus;
  });

  const handleStatusChange = async (driverId: number, newStatus: string) => {
    setUpdating(driverId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/drivers/${driverId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast({ title: `✅ Driver ${newStatus} kar diya gaya` });
        refetch();
      } else {
        const d = await res.json();
        toast({ title: d.message ?? "Error", variant: "destructive" });
      }
    } finally { setUpdating(null); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/drivers/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        downloadCsv(data, `raftaarride-drivers-${new Date().toISOString().slice(0, 10)}.csv`);
        toast({ title: `✅ ${data.length} drivers export ho gaye` });
      }
    } finally { setExporting(false); }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Drivers</h1>
          <p className="text-muted-foreground text-sm">Manage all registered drivers</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-muted/40 text-muted-foreground hover:bg-muted border border-border rounded-lg transition-colors active:scale-95 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search drivers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-xs text-muted-foreground mr-1">Vehicle:</span>
          {[{ value: "all", label: "All" }, { value: "bike", label: "Bike" }, { value: "auto", label: "Auto" }, { value: "prime", label: "Cab" }, { value: "suv", label: "SUV" }].map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors active:scale-95 ${filter === f.value ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >{f.label}</button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          {([
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
            { value: "suspended", label: "Suspended" },
          ] as const).map((s) => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors active:scale-95 ${statusFilter === s.value ? "bg-secondary text-secondary-foreground" : "bg-muted/30 text-muted-foreground border border-border"}`}
            >{s.label}</button>
          ))}
        </div>
        <div className="text-sm text-muted-foreground ml-auto">{filtered.length} drivers</div>
      </div>

      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Driver</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Vehicle</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Rating</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Rides</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Earnings</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-5 py-3.5"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                  ))
                : filtered.map((driver) => (
                    <tr key={driver.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-bold shrink-0">
                            {driver.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{driver.name}</div>
                            <div className="text-xs text-muted-foreground">{driver.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <VehicleBadge type={driver.vehicleType} />
                        <div className="text-xs text-muted-foreground mt-0.5">{driver.vehicleNumber}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        {driver.rating > 0 ? (
                          <div className="flex items-center gap-1 text-yellow-400">
                            <Star className="w-3 h-3 fill-current" />
                            <span className="font-medium text-foreground">{Number(driver.rating).toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">New</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-foreground font-medium hidden lg:table-cell">{driver.totalRides}</td>
                      <td className="px-5 py-3.5 text-foreground font-medium hidden lg:table-cell">{formatCurrency(driver.totalEarnings)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={driver.status} />
                          {driver.isOnline && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Online" />}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          {driver.status === "active" && (
                            <>
                              <button onClick={() => handleStatusChange(driver.id, "suspended")} disabled={updating === driver.id}
                                title="Suspend" className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors active:scale-95 disabled:opacity-50">
                                <ShieldAlert className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleStatusChange(driver.id, "blocked")} disabled={updating === driver.id}
                                title="Block" className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors active:scale-95 disabled:opacity-50">
                                <ShieldBan className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {(driver.status === "blocked" || driver.status === "suspended") && (
                            <button onClick={() => handleStatusChange(driver.id, "active")} disabled={updating === driver.id}
                              title="Activate" className="px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 text-xs font-medium transition-colors active:scale-95 disabled:opacity-50">
                              {updating === driver.id ? "..." : "Unblock"}
                            </button>
                          )}
                          {driver.status === "pending" && (
                            <button onClick={() => handleStatusChange(driver.id, "blocked")} disabled={updating === driver.id}
                              title="Block" className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors active:scale-95 disabled:opacity-50">
                              <ShieldBan className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length === 0 && (
          <div className="py-10 text-center text-muted-foreground text-sm">No drivers found</div>
        )}
      </div>
    </div>
  );
}
