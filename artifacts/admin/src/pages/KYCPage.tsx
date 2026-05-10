import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, Search, FileText, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/components/shared";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/apiBase";

interface KYCRecord {
  id: number;
  driverId: number;
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  vehicleType: string;
  vehicleNumber: string;
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  licenseFront: string | null;
  licenseBack: string | null;
  rcFront: string | null;
  selfie: string | null;
  status: string;
  rejectionReason: string | null;
  aiNote: string | null;
  aiConfidence: number | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
}

interface AiResult {
  verdict: "APPROVE" | "REJECT" | "NEEDS_REVIEW";
  confidence: number;
  findings: { aadhaar: string; license: string; rc: string; selfie: string };
  issues: string[];
  summary: string;
  autoActioned: boolean;
  newStatus: string;
}

function DocPreview({ src, label }: { src: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return (
    <div className="w-full h-20 rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground text-xs text-center border border-dashed border-muted-foreground/20">
      <div><FileText className="w-4 h-4 mx-auto mb-1 opacity-40" />{label}<br /><span className="opacity-60">Not uploaded</span></div>
    </div>
  );

  return (
    <>
      <button
        className="w-full h-20 rounded-lg overflow-hidden border border-border hover:border-primary transition-colors relative group"
        onClick={() => setOpen(true)}
      >
        <img src={src} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Eye className="w-5 h-5 text-white" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 text-center">{label}</div>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="max-w-2xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt={label} className="max-w-full max-h-[80vh] rounded-xl object-contain" />
            <div className="text-center text-white text-sm mt-2">{label}</div>
            <button className="absolute top-2 right-2 text-white bg-black/50 rounded-full w-8 h-8 flex items-center justify-center" onClick={() => setOpen(false)}>✕</button>
          </div>
        </div>
      )}
    </>
  );
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "bg-yellow-500/15", text: "text-yellow-500" },
  verified: { label: "Verified ✅", bg: "bg-green-500/15", text: "text-green-500" },
  rejected: { label: "Rejected ❌", bg: "bg-red-500/15", text: "text-red-500" },
};

const VERDICT_CONFIG = {
  APPROVE: { label: "✅ Approve Karo", bg: "bg-green-500/15", border: "border-green-500/30", text: "text-green-400", badge: "bg-green-500/20 text-green-400" },
  REJECT: { label: "❌ Reject Karo", bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-400", badge: "bg-red-500/20 text-red-400" },
  NEEDS_REVIEW: { label: "👀 Manual Review", bg: "bg-yellow-500/15", border: "border-yellow-500/30", text: "text-yellow-400", badge: "bg-yellow-500/20 text-yellow-400" },
};

function AiResultCard({ result, onApply }: { result: AiResult; onApply: () => void }) {
  const cfg = VERDICT_CONFIG[result.verdict];
  return (
    <div className={cn("rounded-xl border p-4 space-y-3", cfg.bg, cfg.border)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className={cn("w-4 h-4", cfg.text)} />
          <span className={cn("font-bold text-sm", cfg.text)}>AI Verification Result</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", cfg.badge)}>
            {result.verdict}
          </span>
          <span className="text-xs text-muted-foreground font-semibold">{result.confidence}% confidence</span>
        </div>
      </div>

      <div className="w-full bg-muted/40 rounded-full h-1.5">
        <div
          className={cn("h-1.5 rounded-full transition-all", result.confidence >= 80 ? "bg-green-500" : result.confidence >= 60 ? "bg-yellow-500" : "bg-red-500")}
          style={{ width: `${result.confidence}%` }}
        />
      </div>

      <p className={cn("text-sm", cfg.text)}>{result.summary}</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {Object.entries(result.findings).map(([key, val]) => (
          <div key={key} className="bg-background/40 rounded-lg p-2">
            <div className="font-semibold text-muted-foreground capitalize mb-0.5">{key}</div>
            <div className="text-foreground/80 leading-relaxed">{val}</div>
          </div>
        ))}
      </div>

      {result.issues && result.issues.length > 0 && (
        <div className="space-y-1">
          {result.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-red-400">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{issue}</span>
            </div>
          ))}
        </div>
      )}

      {result.autoActioned ? (
        <div className={cn("text-xs font-semibold text-center py-1.5 rounded-lg", cfg.bg, cfg.text)}>
          ✅ Auto {result.newStatus === "verified" ? "approved" : "rejected"} — status update ho gaya
        </div>
      ) : (
        <button
          onClick={onApply}
          className={cn("w-full text-sm font-semibold py-2 rounded-lg transition-colors border", cfg.bg, cfg.border, cfg.text, "hover:opacity-80")}
        >
          {cfg.label} — AI Recommendation Apply Karo
        </button>
      )}
    </div>
  );
}

export function KYCPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<KYCRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast] = useState("");
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [bulkResult, setBulkResult] = useState<{ processed: number; approved: number; rejected: number; needsReview: number; message: string } | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const { data: kycList = [], isLoading } = useQuery<KYCRecord[]>({
    queryKey: ["admin-kyc"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/kyc`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    enabled: !!token,
    refetchInterval: 15000,
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, action, rejectionReason }: { id: number; action: "approve" | "reject"; rejectionReason?: string }) => {
      const res = await fetch(`${API_BASE}/api/admin/kyc/${id}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, rejectionReason }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setSelected(null);
      setRejectReason("");
      setAiResult(null);
      showToast(data.message ?? "Done!");
    },
  });

  const aiVerifyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/api/admin/kyc/${id}/auto-verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "AI verification failed");
      }
      return res.json() as Promise<AiResult>;
    },
    onSuccess: (data) => {
      setAiResult(data);
      qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      if (data.autoActioned) {
        showToast(`AI ne automatically ${data.newStatus === "verified" ? "approve" : "reject"} kar diya!`);
        setSelected(null);
        setAiResult(null);
      }
    },
    onError: (err: Error) => showToast(`❌ ${err.message}`),
  });

  const bulkAiVerifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/kyc/auto-verify-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Bulk verification failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setBulkResult(data);
      showToast(data.message ?? "Bulk verification done!");
    },
    onError: (err: Error) => showToast(`❌ ${err.message}`),
  });

  const filtered = kycList.filter((k) => {
    const matchSearch =
      k.driverName?.toLowerCase().includes(search.toLowerCase()) ||
      k.driverPhone?.includes(search) ||
      k.vehicleNumber?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || k.status === filter;
    return matchSearch && matchFilter;
  });

  const counts = {
    all: kycList.length,
    pending: kycList.filter((k) => k.status === "pending").length,
    verified: kycList.filter((k) => k.status === "verified").length,
    rejected: kycList.filter((k) => k.status === "rejected").length,
  };

  const pendingCount = counts.pending;

  return (
    <div className="p-6 space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">KYC Verification</h1>
          <p className="text-muted-foreground text-sm">Driver documents review karo — manually ya AI se</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "pending", "verified", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                filter === s
                  ? s === "pending" ? "bg-yellow-500/15 text-yellow-500 border-yellow-500/30"
                    : s === "verified" ? "bg-green-500/15 text-green-500 border-green-500/30"
                    : s === "rejected" ? "bg-red-500/15 text-red-500 border-red-500/30"
                    : "bg-primary/15 text-primary border-primary/30"
                  : "bg-muted/50 text-muted-foreground border-border"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
            </button>
          ))}
          {pendingCount > 0 && (
            <button
              onClick={() => { setBulkResult(null); bulkAiVerifyMutation.mutate(); }}
              disabled={bulkAiVerifyMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors disabled:opacity-50"
            >
              {bulkAiVerifyMutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying {pendingCount}...</>
                : <><Sparkles className="w-3.5 h-3.5" /> AI Auto-Verify All Pending ({pendingCount})</>
              }
            </button>
          )}
        </div>
      </div>

      {bulkResult && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-purple-400 text-sm">Bulk AI Verification Complete</span>
            </div>
            <p className="text-muted-foreground text-sm">{bulkResult.message}</p>
          </div>
          <div className="flex gap-3 text-xs font-bold shrink-0">
            <span className="text-green-400">{bulkResult.approved} approved</span>
            <span className="text-red-400">{bulkResult.rejected} rejected</span>
            <span className="text-yellow-400">{bulkResult.needsReview} review needed</span>
          </div>
          <button onClick={() => setBulkResult(null)} className="text-muted-foreground hover:text-foreground shrink-0">✕</button>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Driver name, phone, vehicle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          <div className="text-center"><FileText className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Koi KYC record nahi mila</p></div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Driver</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Vehicle</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Docs</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">AI Score</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Submitted</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((k) => {
                const s = STATUS_MAP[k.status] ?? STATUS_MAP.pending;
                const docCount = [k.aadhaarFront, k.aadhaarBack, k.licenseFront, k.licenseBack, k.rcFront, k.selfie].filter(Boolean).length;
                return (
                  <tr key={k.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{k.driverName ?? "Unknown"}</div>
                      <div className="text-muted-foreground text-xs">{k.driverPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-foreground capitalize">{k.vehicleType}</div>
                      <div className="text-muted-foreground text-xs">{k.vehicleNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-semibold", docCount === 6 ? "text-green-500" : "text-yellow-500")}>
                        {docCount}/6 uploaded
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-1 rounded-full text-xs font-semibold", s.bg, s.text)}>{s.label}</span>
                      {k.verifiedBy === "AI Auto-Verify" && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                          <span className="text-[10px] text-purple-400">AI verified</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {k.aiConfidence != null ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-muted/40 rounded-full h-1">
                            <div
                              className={cn("h-1 rounded-full", k.aiConfidence >= 80 ? "bg-green-500" : k.aiConfidence >= 60 ? "bg-yellow-500" : "bg-red-500")}
                              style={{ width: `${k.aiConfidence}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{k.aiConfidence}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(k.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setSelected(k); setAiResult(null); setRejectReason(""); }}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-start justify-end p-4" onClick={() => { setSelected(null); setAiResult(null); }}>
          <div className="bg-background w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-y-auto max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold text-foreground">KYC Review</h2>
                <p className="text-muted-foreground text-xs">{selected.driverName} — {selected.vehicleNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", STATUS_MAP[selected.status]?.bg, STATUS_MAP[selected.status]?.text)}>
                  {STATUS_MAP[selected.status]?.label ?? selected.status}
                </span>
                <button className="text-muted-foreground hover:text-foreground text-lg" onClick={() => { setSelected(null); setAiResult(null); }}>✕</button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <DocPreview src={selected.aadhaarFront} label="Aadhaar Front" />
                <DocPreview src={selected.aadhaarBack} label="Aadhaar Back" />
                <DocPreview src={selected.licenseFront} label="License Front" />
                <DocPreview src={selected.licenseBack} label="License Back" />
                <DocPreview src={selected.rcFront} label="RC Book" />
                <DocPreview src={selected.selfie} label="Selfie" />
              </div>

              {selected.aiNote && !aiResult && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-purple-400 text-xs font-semibold">Previous AI Analysis</span>
                    {selected.aiConfidence != null && <span className="ml-auto text-xs text-muted-foreground">{selected.aiConfidence}% confidence</span>}
                  </div>
                  <p className="text-muted-foreground text-sm">{selected.aiNote}</p>
                </div>
              )}

              {selected.status === "rejected" && selected.rejectionReason && !aiResult && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-red-400 text-sm"><strong>Rejection Reason:</strong> {selected.rejectionReason}</p>
                </div>
              )}

              {aiResult && (
                <AiResultCard
                  result={aiResult}
                  onApply={() => {
                    if (aiResult.verdict === "APPROVE") {
                      verifyMutation.mutate({ id: selected.id, action: "approve" });
                    } else if (aiResult.verdict === "REJECT") {
                      verifyMutation.mutate({ id: selected.id, action: "reject", rejectionReason: aiResult.issues?.join("; ") });
                    }
                  }}
                />
              )}

              <button
                onClick={() => { setAiResult(null); aiVerifyMutation.mutate(selected.id); }}
                disabled={aiVerifyMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 font-semibold text-sm hover:bg-purple-500/25 transition-colors disabled:opacity-50"
              >
                {aiVerifyMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> AI documents analyze kar raha hai...</>
                  : <><Sparkles className="w-4 h-4" /> AI se Auto-Verify Karo</>
                }
              </button>

              {selected.status !== "verified" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Rejection Reason (if rejecting manually):</label>
                    <textarea
                      className="w-full rounded-lg border border-input bg-muted/30 text-sm p-3 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      rows={2}
                      placeholder="Documents blur hain, ya naam match nahi karta..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => verifyMutation.mutate({ id: selected.id, action: "approve" })}
                      disabled={verifyMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve KYC
                    </button>
                    <button
                      onClick={() => verifyMutation.mutate({ id: selected.id, action: "reject", rejectionReason: rejectReason || undefined })}
                      disabled={verifyMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject KYC
                    </button>
                  </div>
                </>
              )}

              {selected.status === "verified" && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                  <p className="text-green-400 font-semibold">
                    {selected.verifiedBy === "AI Auto-Verify" ? "🤖 AI se Auto-Verified" : "✅ KYC Verified"}
                  </p>
                  {selected.verifiedAt && <p className="text-muted-foreground text-xs mt-1">{formatDate(selected.verifiedAt)}</p>}
                  {selected.verifiedBy && <p className="text-muted-foreground text-xs">by {selected.verifiedBy}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
