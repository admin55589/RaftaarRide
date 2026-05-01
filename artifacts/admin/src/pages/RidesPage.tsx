import { useState } from "react";
import { useListRides } from "@workspace/api-client-react";
import { Search, Download } from "lucide-react";
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

const STATUS_FILTERS = ["all", "completed", "in_progress", "pending", "assigned", "cancelled"];

export function RidesPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { token } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/rides/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); downloadCsv(data, `raftaarride-rides-${new Date().toISOString().slice(0, 10)}.csv`); toast({ title: `✅ ${data.length} rides export ho gayi` }); }
    } finally { setExporting(false); }
  };

  const { data: rides, isLoading } = useListRides(
    statusFilter ? { status: statusFilter } : undefined
  );

  const filtered = (rides ?? []).filter((r) => {
    if (!search) return true;
    return (
      r.userName.toLowerCase().includes(search.toLowerCase()) ||
      r.pickup.toLowerCase().includes(search.toLowerCase()) ||
      r.destination.toLowerCase().includes(search.toLowerCase()) ||
      (r.driverName ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rides</h1>
          <p className="text-muted-foreground text-sm">All ride history and management</p>
        </div>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-muted/40 text-muted-foreground hover:bg-muted border border-border rounded-lg transition-colors active:scale-95 disabled:opacity-50">
          <Download className="w-3.5 h-3.5" />
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search rides..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f === "all" ? undefined : f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                (f === "all" ? !statusFilter : statusFilter === f)
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="text-sm text-muted-foreground ml-auto">
          {filtered.length} ride{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">#</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">User</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Driver</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Route</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Vehicle</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Fare</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Commission</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((ride) => (
                    <tr key={ride.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">#{ride.id}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{ride.userName}</td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">
                        {ride.driverName ?? <span className="text-xs italic">Unassigned</span>}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <div className="text-xs">
                          <span className="text-foreground">{ride.pickup}</span>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span className="text-foreground">{ride.destination}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <VehicleBadge type={ride.vehicleType} />
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">{formatCurrency(ride.price)}</td>
                      <td className="px-5 py-3.5 hidden xl:table-cell">
                        <div className="flex flex-col gap-1">
                          {(ride as any).commissionAmount && parseFloat((ride as any).commissionAmount) > 0 ? (
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              +{formatCurrency((ride as any).commissionAmount)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                          {(ride as any).paymentMethod && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${
                              (ride as any).paymentMethod === "Cash"
                                ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                                : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            }`}>
                              {(ride as any).paymentMethod === "Cash" ? "💵 Cash" :
                               (ride as any).paymentMethod === "UPI" ? "📲 UPI" :
                               (ride as any).paymentMethod === "Card" ? "💳 Card" :
                               (ride as any).paymentMethod === "RaftaarWallet" ? "👛 Wallet" :
                               (ride as any).paymentMethod}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={ride.status} />
                        {ride.status === "cancelled" && (ride as any).cancelReason && (
                          <div className="text-xs text-red-400/70 mt-0.5 max-w-[120px] truncate" title={(ride as any).cancelReason}>
                            ↳ {(ride as any).cancelReason}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden xl:table-cell">{formatDate(ride.createdAt)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length === 0 && (
          <div className="py-10 text-center text-muted-foreground text-sm">No rides found</div>
        )}
      </div>
    </div>
  );
}
