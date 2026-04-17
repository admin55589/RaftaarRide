import { useState } from "react";
import { useListRides } from "@workspace/api-client-react";
import { Search } from "lucide-react";
import { StatusBadge, VehicleBadge, formatCurrency, formatDate } from "@/components/shared";

const STATUS_FILTERS = ["all", "completed", "in_progress", "pending", "assigned", "cancelled"];

export function RidesPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

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
      <div>
        <h1 className="text-xl font-bold text-foreground">Rides</h1>
        <p className="text-muted-foreground text-sm">All ride history and management</p>
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
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
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
                      <td className="px-5 py-3.5">
                        <StatusBadge status={ride.status} />
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
