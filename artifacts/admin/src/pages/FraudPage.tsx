import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/apiBase";

type FraudType = "gps_spoof" | "fake_completion" | "rapid_cancel" | "promo_abuse" | "all";
type FraudStatus = "open" | "reviewed" | "dismissed" | "actioned" | "all";
type Severity = "low" | "medium" | "high" | "critical";

interface FraudFlag {
  id: number;
  type: string;
  severity: Severity;
  driverId: number | null;
  userId: number | null;
  rideId: number | null;
  details: string;
  status: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  driverName?: string;
  driverPhone?: string;
  userName?: string;
  userPhone?: string;
}

interface FraudStats {
  total: number;
  open: number;
  critical: number;
  high: number;
  thisWeek: number;
  byType: Record<string, number>;
}

interface FraudData {
  success: boolean;
  flags: FraudFlag[];
  stats: FraudStats;
  total: number;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  gps_spoof:       { label: "GPS Spoofing",       emoji: "📍", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  fake_completion: { label: "Fake Completion",     emoji: "🎭", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  rapid_cancel:    { label: "Rapid Cancellation",  emoji: "🚫", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  promo_abuse:     { label: "Promo Abuse",          emoji: "🎟️", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
};

const SEVERITY_COLORS: Record<Severity, string> = {
  low:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  medium:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  open:      "bg-red-500/10 text-red-400",
  reviewed:  "bg-blue-500/10 text-blue-400",
  dismissed: "bg-gray-500/10 text-gray-400",
  actioned:  "bg-green-500/10 text-green-400",
};

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function parseDetails(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { return {}; }
}

export function FraudPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<FraudType>("all");
  const [statusFilter, setStatusFilter] = useState<FraudStatus>("open");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState<Record<number, string>>({});

  const { data, isLoading, refetch, isFetching } = useQuery<FraudData>({
    queryKey: ["admin-fraud", typeFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");
      const res = await fetch(`${API_BASE}/api/admin/fraud/flags?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch fraud flags");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 30 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: number; status: string; note?: string }) => {
      const res = await fetch(`${API_BASE}/api/admin/fraud/flags/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: note }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-fraud"] }),
  });

  const flags = data?.flags ?? [];
  const stats = data?.stats;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            🛡️ Fraud Detection
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            GPS spoofing, fake rides, rapid cancellations — real-time alerts
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-card border border-red-500/30 rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Open Alerts</p>
            <p className="text-3xl font-bold text-red-400">{stats.open}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Needs review</p>
          </div>
          <div className="bg-card border border-red-500/20 rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Critical</p>
            <p className="text-3xl font-bold text-red-500">{stats.critical}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Immediate action</p>
          </div>
          <div className="bg-card border border-orange-500/20 rounded-xl p-4">
            <p className="text-xs text-muted-foreground">High Severity</p>
            <p className="text-3xl font-bold text-orange-400">{stats.high}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Priority review</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="text-3xl font-bold text-foreground">{stats.thisWeek}</p>
            <p className="text-xs text-muted-foreground mt-0.5">7-day total</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">All Time</p>
            <p className="text-3xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total flags</p>
          </div>
        </div>
      )}

      {/* Type breakdown */}
      {stats?.byType && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(TYPE_LABELS).map(([type, { label, emoji, color }]) => (
            <div key={type} className={`rounded-xl border p-3 ${color}`}>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <span>{emoji}</span> {label}
              </p>
              <p className="text-2xl font-bold mt-1">{stats.byType[type] ?? 0}</p>
              <p className="text-xs opacity-70">flags total</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-secondary rounded-lg p-1 flex-wrap">
          {(["all", "open", "reviewed", "dismissed", "actioned"] as FraudStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-secondary rounded-lg p-1 flex-wrap">
          {(["all", "gps_spoof", "fake_completion", "rapid_cancel"] as FraudType[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All Types" : TYPE_LABELS[t]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Flags list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Loading fraud flags...
        </div>
      ) : flags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
          <Shield className="w-12 h-12 opacity-20 mb-3" />
          <p className="text-lg font-medium">
            {statusFilter === "open" ? "Koi suspicious activity nahi!" : "No flags found"}
          </p>
          <p className="text-sm mt-1">
            {statusFilter === "open" ? "System sab check kar raha hai 🟢" : "Try changing the filters above"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => {
            const typeInfo = TYPE_LABELS[flag.type] ?? { label: flag.type, emoji: "⚠️", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" };
            const details = parseDetails(flag.details);
            const isExpanded = expandedId === flag.id;

            return (
              <div
                key={flag.id}
                className={`bg-card border rounded-xl overflow-hidden transition-all ${
                  flag.severity === "critical" ? "border-red-500/50" :
                  flag.severity === "high" ? "border-orange-500/30" :
                  "border-border"
                }`}
              >
                {/* Flag header */}
                <div className="p-4 flex items-start gap-3 flex-wrap">
                  {/* Type badge */}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold shrink-0 ${typeInfo.color}`}>
                    <span>{typeInfo.emoji}</span>
                    {typeInfo.label}
                  </div>

                  {/* Severity */}
                  <span className={`px-2 py-1 rounded-lg border text-xs font-bold uppercase ${SEVERITY_COLORS[flag.severity]}`}>
                    {flag.severity}
                  </span>

                  {/* Status */}
                  <span className={`px-2 py-1 rounded-md text-xs font-medium capitalize ${STATUS_COLORS[flag.status] ?? "bg-muted text-muted-foreground"}`}>
                    {flag.status}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Who */}
                    <p className="text-sm font-medium text-foreground">
                      {flag.driverName && `🚗 ${flag.driverName}`}
                      {flag.driverPhone && ` · ${flag.driverPhone}`}
                      {flag.userName && ` 👤 ${flag.userName}`}
                      {flag.rideId && ` · Ride #${flag.rideId}`}
                    </p>
                    {/* Message from details */}
                    {!!details.message && (
                      <p className="text-sm text-muted-foreground mt-0.5">{String(details.message)}</p>
                    )}
                    {!!details.issues && Array.isArray(details.issues) && (
                      <p className="text-sm text-muted-foreground mt-0.5">{(details.issues as string[]).join(" · ")}</p>
                    )}
                  </div>

                  {/* Time */}
                  <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(flag.createdAt)}
                  </span>

                  {/* Expand */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : flag.id)}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors shrink-0"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                {/* Expanded details + actions */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-3 bg-secondary/30">
                    {/* Raw details */}
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wide">Evidence</p>
                      <div className="rounded-lg bg-muted/40 p-3 text-xs font-mono text-foreground space-y-1 overflow-x-auto">
                        {Object.entries(details).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-muted-foreground shrink-0">{k}:</span>
                            <span className="text-foreground">{JSON.stringify(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Review note */}
                    {flag.status === "open" && (
                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wide">Review Note (optional)</p>
                        <textarea
                          value={reviewNote[flag.id] ?? ""}
                          onChange={e => setReviewNote(p => ({ ...p, [flag.id]: e.target.value }))}
                          placeholder="e.g. Driver confirmed fraud — suspended"
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    )}

                    {/* Action buttons */}
                    {flag.status === "open" && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => updateMutation.mutate({ id: flag.id, status: "actioned", note: reviewNote[flag.id] })}
                          disabled={updateMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Take Action
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({ id: flag.id, status: "reviewed", note: reviewNote[flag.id] })}
                          disabled={updateMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Mark Reviewed
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({ id: flag.id, status: "dismissed", note: reviewNote[flag.id] })}
                          disabled={updateMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      </div>
                    )}

                    {/* Already resolved note */}
                    {flag.reviewNote && (
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                        <span className="font-medium">Admin note:</span> {flag.reviewNote}
                        {flag.reviewedBy && ` · by ${flag.reviewedBy}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
