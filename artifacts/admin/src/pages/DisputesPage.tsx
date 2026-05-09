import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/apiBase";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  in_review: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  resolved: "bg-green-500/15 text-green-400 border-green-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

const ISSUE_LABELS: Record<string, string> = {
  overcharge: "💸 Overcharged",
  driver_behavior: "😤 Driver Behavior",
  route_issue: "🗺️ Route Issue",
  payment: "💳 Payment Issue",
  safety: "🚨 Safety",
  other: "📝 Other",
};

function fmt(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DisputesPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteInput, setNoteInput] = useState<Record<number, string>>({});

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-disputes", statusFilter],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/disputes?status=${statusFilter}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch disputes");
      return res.json();
    },
    enabled: !!token,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status?: string; adminNote?: string }) => {
      const res = await fetch(`${API_BASE}/api/admin/disputes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, adminNote }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-disputes"] });
      toast({ title: "Updated", description: "Dispute status updated" });
    },
    onError: () => toast({ title: "Error", description: "Update failed", variant: "destructive" }),
  });

  const STATUS_TABS = [
    { key: "open", label: "Open", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { key: "in_review", label: "In Review", icon: <Clock className="w-3.5 h-3.5" /> },
    { key: "resolved", label: "Resolved", icon: <CheckCircle className="w-3.5 h-3.5" /> },
    { key: "rejected", label: "Rejected", icon: <XCircle className="w-3.5 h-3.5" /> },
  ];

  const disputes = data?.disputes ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            ⚠️ Ride Disputes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            User complaints aur issues manage karein
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-accent transition-colors">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${statusFilter === tab.key
              ? "bg-primary/15 border-primary/40 text-primary"
              : "bg-card border-border text-muted-foreground hover:bg-accent"}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : disputes.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p className="text-muted-foreground">Koi {statusFilter} disputes nahi hain</p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d: any) => (
            <div key={d.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${STATUS_COLORS[d.status] ?? "bg-muted text-muted-foreground"}`}>
                      {d.status.replace("_", " ").toUpperCase()}
                    </span>
                    {d.isPriority && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                        🔴 Priority (Pass)
                      </span>
                    )}
                    <span className="text-sm font-medium text-foreground">{ISSUE_LABELS[d.issue] ?? d.issue}</span>
                    <span className="text-xs text-muted-foreground ml-auto">Ride #{d.rideId}</span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>👤 {d.user?.name ?? "User"} ({d.user?.phone ?? "—"})</span>
                    {d.driver && <span>🚗 {d.driver.name} ({d.driver.phone})</span>}
                    <span className="ml-auto">{fmt(d.createdAt)}</span>
                  </div>
                </div>
                <span className="text-muted-foreground text-lg">{expandedId === d.id ? "▲" : "▼"}</span>
              </div>

              {expandedId === d.id && (
                <div className="border-t border-border p-4 space-y-4 bg-muted/20">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-foreground leading-relaxed">{d.description}</p>
                  </div>

                  {d.adminNote && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                      <p className="text-xs font-semibold text-blue-400 mb-1">Admin Note</p>
                      <p className="text-sm text-foreground">{d.adminNote}</p>
                      {d.resolvedAt && <p className="text-xs text-muted-foreground mt-1">Resolved: {fmt(d.resolvedAt)}</p>}
                    </div>
                  )}

                  {(d.status === "open" || d.status === "in_review") && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                          <MessageSquare className="w-3 h-3 inline mr-1" /> Admin Note
                        </label>
                        <textarea
                          value={noteInput[d.id] ?? d.adminNote ?? ""}
                          onChange={e => setNoteInput(prev => ({ ...prev, [d.id]: e.target.value }))}
                          placeholder="Admin response ya note likho..."
                          className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-none h-20 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {d.status === "open" && (
                          <button
                            onClick={() => updateMutation.mutate({ id: d.id, status: "in_review", adminNote: noteInput[d.id] })}
                            className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-500/25">
                            <Clock className="w-3.5 h-3.5 inline mr-1" /> Mark In Review
                          </button>
                        )}
                        <button
                          onClick={() => updateMutation.mutate({ id: d.id, status: "resolved", adminNote: noteInput[d.id] })}
                          className="px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/25">
                          <CheckCircle className="w-3.5 h-3.5 inline mr-1" /> Resolve
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({ id: d.id, status: "rejected", adminNote: noteInput[d.id] })}
                          className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/25">
                          <XCircle className="w-3.5 h-3.5 inline mr-1" /> Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
