import { useState } from "react";
import { useListDrivers } from "@workspace/api-client-react";
import { Search, Star } from "lucide-react";
import { StatusBadge, VehicleBadge, formatCurrency, formatDate } from "@/components/shared";

export function DriversPage() {
  const { data: drivers, isLoading } = useListDrivers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = (drivers ?? []).filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.email.toLowerCase().includes(search.toLowerCase()) ||
      d.vehicleNumber.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || d.vehicleType === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Drivers</h1>
        <p className="text-muted-foreground text-sm">Manage all registered drivers</p>
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
        <div className="flex gap-1">
          {["all", "bike", "auto", "cab"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="text-sm text-muted-foreground ml-auto">
          {filtered.length} driver{filtered.length !== 1 ? "s" : ""}
        </div>
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
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
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
                            <div className="text-xs text-muted-foreground hidden md:hidden lg:block">{driver.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <div>
                          <VehicleBadge type={driver.vehicleType} />
                          <div className="text-xs text-muted-foreground mt-0.5">{driver.vehicleNumber}</div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {((driver as any).ratingCount ?? 0) > 0 ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1 text-yellow-400">
                              <Star className="w-3 h-3 fill-current" />
                              <span className="font-medium text-foreground">{driver.rating.toFixed(1)}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {(driver as any).ratingCount} ratings
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="font-medium text-muted-foreground">—</span>
                            <span className="text-[10px] text-muted-foreground">No ratings yet</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-foreground font-medium hidden lg:table-cell">{driver.totalRides}</td>
                      <td className="px-5 py-3.5 text-foreground font-medium hidden lg:table-cell">{formatCurrency(driver.totalEarnings)}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={driver.status} />
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden xl:table-cell">{formatDate(driver.createdAt)}</td>
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
