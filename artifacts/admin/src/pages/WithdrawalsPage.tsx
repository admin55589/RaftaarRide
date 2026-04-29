import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Search, Wallet, PlusCircle, RefreshCw, Zap, AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/components/shared";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface WithdrawalRecord {
  id: number;
  driverId: number;
  driverName: string;
  driverPhone: string;
  amount: number;
  method: string;
  accountDetails: string;
  status: string;
  processedAt: string | null;
  processedBy: string | null;
  rejectionReason: string | null;
  transactionRef: string | null;
  razorpayPayoutId: string | null;
  autoProcessed: string | null;
  validationError: string | null;
  processingNote: string | null;
  createdAt: string;
}

const METHOD_ICONS: Record<string, string> = {
  upi: "📲",
  paytm: "💙",
  phonepe: "💜",
  bank: "🏦",
};

function AutoBadge({ autoProcessed }: { autoProcessed: string | null }) {
  if (!autoProcessed) return null;
  const config: Record<string, { label: string; cls: string }> = {
    approved: { label: "⚡ Auto-Approved", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    rejected: { label: "🤖 Auto-Rejected", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    pending_manual: { label: "✅ Valid — Manual Transfer", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    payout_failed: { label: "⚠️ Payout Failed — Retry", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  };
  const c = config[autoProcessed];
  if (!c) return null;
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold border", c.cls)}>
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    pending: { label: "⏳ Pending", bg: "bg-yellow-500/15", text: "text-yellow-500" },
    approved: { label: "✅ Approved", bg: "bg-green-500/15", text: "text-green-500" },
    rejected: { label: "❌ Rejected", bg: "bg-red-500/15", text: "text-red-500" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={cn("px-2 py-1 rounded-full text-xs font-semibold", s.bg, s.text)}>
      {s.label}
    </span>
  );
}

export function WithdrawalsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<WithdrawalRecord | null>(null);
  const [txnRef, setTxnRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditDriverId, setCreditDriverId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [newRequestNotif, setNewRequestNotif] = useState(0);
  const prevPendingCount = useRef(0);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const { data: drivers = [] } = useQuery<Array<{ id: number; name: string; phone: string; walletBalance: number }>>({
    queryKey: ["admin-drivers-wallet"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/drivers`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const list = await res.json();
      return Array.isArray(list) ? list.map((d: any) => ({ id: d.id, name: d.name, phone: d.phone, walletBalance: Number(d.walletBalance ?? 0) })) : [];
    },
    enabled: !!token,
    refetchInterval: 60000,
  });

  const { data: withdrawals = [], isLoading, dataUpdatedAt } = useQuery<WithdrawalRecord[]>({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/withdrawals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.withdrawals ?? []);
    },
    enabled: !!token,
    refetchInterval: 8000,
  });

  // Notify admin when new pending requests arrive
  useEffect(() => {
    const pendingNow = withdrawals.filter((w) => w.status === "pending").length;
    if (prevPendingCount.current !== 0 && pendingNow > prevPendingCount.current) {
      const diff = pendingNow - prevPendingCount.current;
      setNewRequestNotif((n) => n + diff);
    }
    prevPendingCount.current = pendingNow;
  }, [dataUpdatedAt]);

  const creditMutation = useMutation({
    mutationFn: async ({ driverId, amount, note }: { driverId: number; amount: number; note: string }) => {
      const res = await fetch(`${API_BASE}/api/admin/drivers/${driverId}/wallet/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, note }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-drivers-wallet"] });
      setShowCreditModal(false);
      setCreditDriverId(""); setCreditAmount(""); setCreditNote("");
      showToast(data.message ?? "Wallet credit ho gaya!");
    },
    onError: () => showToast("Credit failed", "error"),
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, action, transactionRef, rejectionReason }: {
      id: number; action: "approve" | "reject"; transactionRef?: string; rejectionReason?: string;
    }) => {
      const res = await fetch(`${API_BASE}/api/admin/withdrawals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, transactionRef, rejectionReason }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      setSelected(null); setTxnRef(""); setRejectReason("");
      showToast(data.message ?? "Done!");
    },
    onError: () => showToast("Action failed", "error"),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/api/admin/withdrawals/${id}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      showToast(data.message ?? "Payout retry initiated!", "success");
    },
    onError: () => showToast("Retry failed — check Razorpay config", "error"),
  });

  const filtered = withdrawals.filter((w) => {
    const matchSearch =
      w.driverName?.toLowerCase().includes(search.toLowerCase()) ||
      w.driverPhone?.includes(search) ||
      w.accountDetails?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || w.status === filter || filter === w.autoProcessed;
    return matchSearch && matchFilter;
  });

  const counts = {
    all: withdrawals.length,
    pending: withdrawals.filter((w) => w.status === "pending").length,
    approved: withdrawals.filter((w) => w.status === "approved").length,
    rejected: withdrawals.filter((w) => w.status === "rejected").length,
    failed: withdrawals.filter((w) => w.autoProcessed === "payout_failed").length,
  };

  const totalPending = withdrawals.filter((w) => w.status === "pending").reduce((s, w) => s + Number(w.amount), 0);
  const totalApproved = withdrawals.filter((w) => w.status === "approved").reduce((s, w) => s + Number(w.amount), 0);

  const autoApproved = withdrawals.filter((w) => w.autoProcessed === "approved").length;
  const autoRejected = withdrawals.filter((w) => w.autoProcessed === "rejected").length;

  return (
    <div className="p-6 space-y-5">
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2",
          toast.type === "success" ? "bg-green-500" : "bg-red-500"
        )}>
          {toast.type === "success" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {/* New request notification */}
      {newRequestNotif > 0 && (
        <div
          className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-yellow-500/15 transition-colors"
          onClick={() => { setFilter("pending"); setNewRequestNotif(0); }}
        >
          <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            {newRequestNotif} naya withdrawal request aaya hai — review karein
          </div>
          <button className="text-yellow-400 text-xs underline">Dekho</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">⚡ Auto-Withdrawal Gateway</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Auto-Processing ON
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Valid requests automatic approve hote hain via Razorpay • Invalid auto-reject + refund
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreditModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 text-sm font-semibold hover:bg-blue-500/20 transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> Credit Wallet
          </button>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["admin-withdrawals"] })}
            className="p-2 rounded-xl border border-border hover:bg-muted/40 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-yellow-500" /><span className="text-xs text-yellow-500 font-semibold">Pending</span></div>
          <div className="text-2xl font-bold text-foreground">{counts.pending}</div>
          <div className="text-xs text-muted-foreground">₹{totalPending.toFixed(0)} total</div>
        </div>
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500 font-semibold">Approved</span></div>
          <div className="text-2xl font-bold text-foreground">{counts.approved}</div>
          <div className="text-xs text-muted-foreground">₹{totalApproved.toFixed(0)} paid</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><XCircle className="w-4 h-4 text-red-500" /><span className="text-xs text-red-500 font-semibold">Rejected</span></div>
          <div className="text-2xl font-bold text-foreground">{counts.rejected}</div>
          <div className="text-xs text-muted-foreground">Refunded to wallet</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><Zap className="w-4 h-4 text-emerald-400" /><span className="text-xs text-emerald-400 font-semibold">Auto-Approved</span></div>
          <div className="text-2xl font-bold text-foreground">{autoApproved}</div>
          <div className="text-xs text-muted-foreground">Via Razorpay X</div>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-orange-400" /><span className="text-xs text-orange-400 font-semibold">Payout Failed</span></div>
          <div className="text-2xl font-bold text-foreground">{counts.failed}</div>
          <div className="text-xs text-muted-foreground">Needs retry</div>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">⚡ Auto-Processing Flow</p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-3 py-1.5">
            <span>1️⃣</span> Driver withdrawal request
          </div>
          <span>→</span>
          <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-3 py-1.5">
            <span>2️⃣</span> Auto-validate details
          </div>
          <span>→</span>
          <div className="flex items-center gap-1.5 bg-green-500/10 rounded-lg px-3 py-1.5 text-green-400">
            <span>✅</span> Valid → Razorpay X Payout
          </div>
          <span className="text-muted-foreground">|</span>
          <div className="flex items-center gap-1.5 bg-red-500/10 rounded-lg px-3 py-1.5 text-red-400">
            <span>❌</span> Invalid → Auto-reject + Refund
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Driver name, phone, account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(["all", "pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              filter === s
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted/50 text-muted-foreground border-border"
            )}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s as keyof typeof counts]})
          </button>
        ))}
        {counts.failed > 0 && (
          <button
            onClick={() => setFilter("payout_failed")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              filter === "payout_failed"
                ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                : "bg-muted/50 text-orange-400 border-orange-500/20"
            )}
          >
            ⚠️ Payout Failed ({counts.failed})
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          <div className="text-center"><Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Koi withdrawal request nahi</p></div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Driver</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Method / Account</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Auto-Process</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((w) => {
                const isPending = w.status === "pending";
                const isPayoutFailed = w.autoProcessed === "payout_failed";
                return (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{w.driverName ?? "Unknown"}</div>
                      <div className="text-muted-foreground text-xs">{w.driverPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground text-base">₹{Number(w.amount).toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-base">{METHOD_ICONS[w.method] ?? "💰"}</span>
                        <span className="capitalize text-xs font-semibold text-foreground">{w.method}</span>
                      </div>
                      <div className="text-muted-foreground text-xs truncate">{w.accountDetails}</div>
                      {w.transactionRef && !w.razorpayPayoutId && (
                        <div className="text-green-500 text-xs">Ref: {w.transactionRef}</div>
                      )}
                      {w.razorpayPayoutId && (
                        <div className="text-emerald-400 text-xs">⚡ Payout: {w.razorpayPayoutId}</div>
                      )}
                      {w.validationError && (
                        <div className="text-red-400 text-xs mt-0.5" title={w.validationError}>⚠️ {w.validationError.slice(0, 35)}...</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={w.status} />
                      {w.rejectionReason && (
                        <div className="text-red-400 text-xs mt-1 max-w-[120px] truncate" title={w.rejectionReason}>
                          {w.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AutoBadge autoProcessed={w.autoProcessed} />
                      {w.processingNote && (
                        <div className="text-muted-foreground text-xs mt-1 max-w-[140px]" title={w.processingNote}>
                          {w.processingNote.slice(0, 40)}{w.processingNote.length > 40 ? "…" : ""}
                        </div>
                      )}
                      {!w.autoProcessed && isPending && (
                        <span className="text-xs text-muted-foreground">Processing...</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(w.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isPayoutFailed && (
                          <button
                            onClick={() => retryMutation.mutate(w.id)}
                            disabled={retryMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-semibold hover:bg-orange-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" /> Retry
                          </button>
                        )}
                        {isPending && (
                          <button
                            onClick={() => setSelected(w)}
                            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors border border-primary/20"
                          >
                            Override
                          </button>
                        )}
                        {!isPending && !isPayoutFailed && (
                          <span className="text-muted-foreground text-xs">{w.processedAt ? formatDate(w.processedAt) : "—"}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Override Modal */}
      {selected && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-background w-full max-w-md rounded-2xl border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" /> Manual Override
                </h2>
                <p className="text-muted-foreground text-xs">{selected.driverName} — ₹{Number(selected.amount).toFixed(2)}</p>
              </div>
              <button className="text-muted-foreground hover:text-foreground text-lg" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 text-yellow-400 text-xs">
                ⚠️ Auto-system is processing this request. Manual override sirf exceptional cases mein karein.
              </div>

              <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                {[
                  ["Driver", selected.driverName],
                  ["Amount", `₹${Number(selected.amount).toFixed(2)}`],
                  ["Method", `${METHOD_ICONS[selected.method]} ${selected.method.toUpperCase()}`],
                  ["Account", selected.accountDetails],
                  ["Requested", formatDate(selected.createdAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold text-foreground text-right max-w-[200px]">{value}</span>
                  </div>
                ))}
                {selected.validationError && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Validation</span>
                    <span className="text-red-400 text-right max-w-[200px] text-xs">{selected.validationError}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Transaction Reference (for approval):</label>
                <input
                  className="w-full rounded-lg border border-input bg-muted/30 text-sm p-3 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. TXN123456789 or UTR number"
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Rejection Reason (if rejecting):</label>
                <input
                  className="w-full rounded-lg border border-input bg-muted/30 text-sm p-3 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Wrong account number, or insufficient info..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => processMutation.mutate({ id: selected.id, action: "approve", transactionRef: txnRef || undefined })}
                  disabled={processMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Force Approve
                </button>
                <button
                  onClick={() => processMutation.mutate({ id: selected.id, action: "reject", rejectionReason: rejectReason || undefined })}
                  disabled={processMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Force Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreditModal(false)}>
          <div className="bg-background w-full max-w-md rounded-2xl border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold text-foreground flex items-center gap-2"><PlusCircle className="w-4 h-4 text-blue-500" /> Manual Wallet Credit</h2>
                <p className="text-muted-foreground text-xs">Driver ke wallet mein amount add karo</p>
              </div>
              <button className="text-muted-foreground hover:text-foreground text-lg" onClick={() => setShowCreditModal(false)}>✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Driver select karo:</label>
                <select
                  className="w-full rounded-lg border border-input bg-muted/30 text-sm p-3 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                  value={creditDriverId}
                  onChange={(e) => setCreditDriverId(e.target.value)}
                >
                  <option value="">— Driver chunein —</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name} ({d.phone}) — Bal: ₹{d.walletBalance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Credit Amount (₹):</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-input bg-muted/30 text-sm p-3 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. 500"
                  min={1} max={50000}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Note / Reason (optional):</label>
                <input
                  className="w-full rounded-lg border border-input bg-muted/30 text-sm p-3 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Bonus ride, adjustment..."
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                />
              </div>

              {creditDriverId && creditAmount && Number(creditAmount) > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-blue-400 text-sm font-medium">
                    ₹{Number(creditAmount).toFixed(2)} credit hoga {drivers.find((d) => d.id === Number(creditDriverId))?.name} ke wallet mein
                  </p>
                </div>
              )}

              <button
                onClick={() => {
                  if (!creditDriverId || !creditAmount || Number(creditAmount) <= 0) return;
                  creditMutation.mutate({ driverId: Number(creditDriverId), amount: Number(creditAmount), note: creditNote });
                }}
                disabled={!creditDriverId || !creditAmount || Number(creditAmount) <= 0 || creditMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                <PlusCircle className="w-4 h-4" />
                {creditMutation.isPending ? "Processing..." : "Credit Wallet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
