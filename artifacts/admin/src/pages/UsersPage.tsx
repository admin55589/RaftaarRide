import { useState } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { Search, Download, ShieldBan, ShieldCheck, ShieldAlert } from "lucide-react";
import { StatusBadge, formatDate } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { API_BASE } from "@/lib/apiBase";

function downloadCsv(data: object[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => JSON.stringify((row as any)[h] ?? "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function UsersPage() {
  const { data: users, isLoading, refetch } = useListUsers();
  const { token } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked" | "suspended">("all");
  const [updating, setUpdating] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const filtered = (users ?? []).filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search);
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = async (userId: number, newStatus: string) => {
    setUpdating(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast({ title: `✅ User ${newStatus} kar diya gaya` });
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
      const res = await fetch(`${API_BASE}/api/admin/users/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        downloadCsv(data, `raftaarride-users-${new Date().toISOString().slice(0, 10)}.csv`);
        toast({ title: `✅ ${data.length} users export ho gaye` });
      }
    } finally { setExporting(false); }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground text-sm">Manage all registered users</p>
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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        {(["all", "active", "blocked", "suspended"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors active:scale-95 ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted border border-border"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="text-sm text-muted-foreground ml-auto">{filtered.length} users</div>
      </div>

      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Phone</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Rides</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Joined</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
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
                : filtered.map((user) => (
                    <tr key={user.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-medium text-foreground block">{user.name}</span>
                            <span className="text-xs text-muted-foreground">#{user.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">{user.email}</td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden lg:table-cell">{user.phone}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-foreground">{user.totalRides}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={user.status} />
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden lg:table-cell">{formatDate(user.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          {user.status === "active" && (
                            <>
                              <button
                                onClick={() => handleStatusChange(user.id, "suspended")}
                                disabled={updating === user.id}
                                title="Suspend"
                                className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors active:scale-95 disabled:opacity-50"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(user.id, "blocked")}
                                disabled={updating === user.id}
                                title="Block"
                                className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors active:scale-95 disabled:opacity-50"
                              >
                                <ShieldBan className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {user.status === "suspended" && (
                            <>
                              <button
                                onClick={() => handleStatusChange(user.id, "active")}
                                disabled={updating === user.id}
                                title="Activate"
                                className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors active:scale-95 disabled:opacity-50"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(user.id, "blocked")}
                                disabled={updating === user.id}
                                title="Block"
                                className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors active:scale-95 disabled:opacity-50"
                              >
                                <ShieldBan className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {user.status === "blocked" && (
                            <button
                              onClick={() => handleStatusChange(user.id, "active")}
                              disabled={updating === user.id}
                              title="Unblock"
                              className="px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 text-xs font-medium transition-colors active:scale-95 disabled:opacity-50"
                            >
                              {updating === user.id ? "..." : "Unblock"}
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
          <div className="py-10 text-center text-muted-foreground text-sm">No users found</div>
        )}
      </div>
    </div>
  );
}
