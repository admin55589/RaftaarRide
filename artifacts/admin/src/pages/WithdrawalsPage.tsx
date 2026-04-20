import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Search, Wallet } from "lucide-react";
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
  createdAt: string;
}

const METHOD_ICONS: Record<string, string> = {
  upi: "📲",
  paytm: "💙",
  phonepe: "💜",
  bank: "🏦",
};

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "bg-yellow-500/15", text: "text-yellow-500" },
  approved: { label: "Approved ✅", bg: "bg-green-500/15", text: "text-green-500" },
  rejected: { label: "Rejected ❌", bg: "bg-red-500/15", text: "text-red-500" },
};

export function WithdrawalsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<WithdrawalRecord | null>(null);
  const [txnRef, setTxnRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast] = useState("");

  const { data: withdrawals = [], isLoading } = useQuery<WithdrawalRecord[]>({
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
    refetchInterval: 15000,
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, action, transactionRef, rejectionReason }: {
      id: number;
      action: "approve" | "reject";
      transactionRef?: string;
      rejectionReason?: string;
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
      setSelected(null);
      setTxnRef("");
      setRejectReason("");
      setToast(data.message ?? "Done!");
      setTimeout(() => setToast(""), 3000);
    },
  });

  const filtered = withdrawals.filter((w) => {
    const matchSearch =
      w.driverName?.toLowerCase().includes(search.toLowerCase()) ||
      w.driverPhone?.includes(search) ||
      w.accountDetails?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || w.status === filter;
    return matchSearch && matchFilter;
  });

  const counts = {
    all: withdrawals.length,
    pending: withdrawals.filter((w) => w.status === "pending").length,
    approved: withdrawals.filter((w) => w.status === "approved").length,
    rejected: withdrawals.filter((w) => w.status === "rejected").length,
  };

  const totalPending = withdrawals
    .filter((w) => w.status === "pending")
    .reduce((s, w) => s + Number(w.amount), 0);

  return (
    <div className="p-6 space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
          ✅ {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Driver Withdrawals</h1>
          <p className="text-muted-foreground text-sm">Withdrawal requests manage karo</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2 text-center">
          <div className="text-lg font-bold text-yellow-500">₹{totalPending.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Pending Amount</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold text-foreground">{counts.pending}</div>
          <div className="text-sm text-yellow-500 font-medium">Pending</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold text-foreground">{counts.approved}</div>
          <div className="text-sm text-green-500 font-medium">Approved</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold text-foreground">{counts.rejected}</div>
          <div className="text-sm text-red-500 font-medium">Rejected</div>
        </div>
      </div>

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
      </div>

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
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Method</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Account</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((w) => {
                const s = STATUS_MAP[w.status] ?? STATUS_MAP.pending;
                return (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{w.driverName ?? "Unknown"}</div>
                      <div className="text-muted-foreground text-xs">{w.driverPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground">₹{Number(w.amount).toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-base mr-1">{METHOD_ICONS[w.method] ?? "💰"}</span>
                      <span className="capitalize text-foreground text-xs">{w.method}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[150px]">
                      <div className="text-foreground text-xs truncate">{w.accountDetails}</div>
                      {w.transactionRef && <div className="text-green-500 text-xs">Ref: {w.transactionRef}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-1 rounded-full text-xs font-semibold", s.bg, s.text)}>{s.label}</span>
                      {w.rejectionReason && <div className="text-red-400 text-xs mt-1">{w.rejectionReason}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(w.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {w.status === "pending" ? (
                        <button
                          onClick={() => setSelected(w)}
                          className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                        >
                          Process
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">{w.processedAt ? formatDate(w.processedAt) : "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-background w-full max-w-md rounded-2xl border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold text-foreground">Process Withdrawal</h2>
                <p className="text-muted-foreground text-xs">{selected.driverName} — ₹{Number(selected.amount).toFixed(2)}</p>
              </div>
              <button className="text-muted-foreground hover:text-foreground text-lg" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Driver</span>
                  <span className="font-semibold text-foreground">{selected.driverName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-foreground text-base">₹{Number(selected.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Method</span>
                  <span className="font-semibold text-foreground">{METHOD_ICONS[selected.method]} {selected.method.toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium text-foreground text-right max-w-[200px]">{selected.accountDetails}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested</span>
                  <span className="text-foreground">{formatDate(selected.createdAt)}</span>
                </div>
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
                  <CheckCircle className="w-4 h-4" /> Approve & Pay
                </button>
                <button
                  onClick={() => processMutation.mutate({ id: selected.id, action: "reject", rejectionReason: rejectReason || undefined })}
                  disabled={processMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
