import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { API_BASE } from "@/lib/apiBase";

/* ── Ripple Button ──────────────────────────────────────────────────────── */
interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  rippleColor?: string;
}

function RippleButton({ children, className = "", rippleColor = "rgba(255,255,255,0.35)", onClick, disabled, ...rest }: RippleButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = Date.now();
    setRipples((prev) => [...prev, { id, x, y, size }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
    onClick?.(e);
  }, [disabled, onClick]);

  return (
    <button
      ref={btnRef}
      className={`relative overflow-hidden select-none active:scale-95 transition-transform duration-100 ${className}`}
      onClick={handleClick}
      disabled={disabled}
      {...rest}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full animate-ripple"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            background: rippleColor,
          }}
        />
      ))}
      {children}
    </button>
  );
}

/* ── Types ──────────────────────────────────────────────────────────────── */
interface PromoCode {
  id: number;
  code: string;
  discountPct: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

function usePromoCodes() {
  const { token } = useAuth();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/promo-codes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCodes(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return { codes, loading, fetchCodes, setCodes };
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export function PromoCodesPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { codes, loading, fetchCodes, setCodes } = usePromoCodes();
  const [fetched, setFetched] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "expired">("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({ code: "", discountPct: 10, maxUses: 100, expiresAt: "" });

  if (!fetched) { fetchCodes(); setFetched(true); }

  const isExpired = (c: PromoCode) => c.expiresAt ? new Date(c.expiresAt) < new Date() : false;

  const filtered = codes.filter((c) => {
    const matchSearch = c.code.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ? true :
      filter === "active" ? c.isActive && !isExpired(c) :
      filter === "inactive" ? !c.isActive :
      filter === "expired" ? isExpired(c) : true;
    return matchSearch && matchFilter;
  });

  const handleCreate = async () => {
    if (!form.code.trim()) { toast({ title: "Code required hai", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/promo-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: form.code.trim().toUpperCase(), discountPct: Number(form.discountPct), maxUses: Number(form.maxUses), expiresAt: form.expiresAt || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "✅ Promo code create ho gaya!" });
        setShowCreate(false);
        setForm({ code: "", discountPct: 10, maxUses: 100, expiresAt: "" });
        setCodes((prev) => [data, ...prev]);
      } else {
        toast({ title: data.message ?? "Error", variant: "destructive" });
      }
    } finally { setCreating(false); }
  };

  const handleToggle = async (c: PromoCode) => {
    setToggling(c.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/promo-codes/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      const data = await res.json();
      if (res.ok) {
        setCodes((prev) => prev.map((x) => (x.id === c.id ? data : x)));
        toast({ title: c.isActive ? "Code deactivate ho gaya" : "✅ Code activate ho gaya" });
      } else {
        toast({ title: data.message ?? "Error", variant: "destructive" });
      }
    } finally { setToggling(null); }
  };

  const handleDelete = async (id: number, code: string) => {
    if (!confirm(`"${code}" delete karna chahte ho?`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/promo-codes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setCodes((prev) => prev.filter((c) => c.id !== id)); toast({ title: "🗑️ Promo code delete ho gaya" }); }
      else { const d = await res.json(); toast({ title: d.message ?? "Error", variant: "destructive" }); }
    } finally { setDeleting(null); }
  };

  const countActive = codes.filter((c) => c.isActive && !isExpired(c)).length;
  const countExpired = codes.filter(isExpired).length;
  const totalUses = codes.reduce((s, c) => s + c.usedCount, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Ripple CSS */}
      <style>{`
        @keyframes ripple-anim {
          0%   { transform: scale(0); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        .animate-ripple { animation: ripple-anim 0.6s ease-out forwards; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promo Codes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Discount codes create karo aur manage karo</p>
        </div>
        <RippleButton
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          rippleColor="rgba(255,255,255,0.3)"
        >
          <span className="text-base">+</span> New Promo Code
        </RippleButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Codes", value: codes.length, color: "text-foreground", bg: "bg-muted/40" },
          { label: "Active Codes", value: countActive, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "Expired", value: countExpired, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "Total Uses", value: totalUses, color: "text-blue-400", bg: "bg-blue-500/10" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-border`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Code search karo..."
          className="px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
        />
        {(["all", "active", "inactive", "expired"] as const).map((f) => (
          <RippleButton
            key={f}
            onClick={() => setFilter(f)}
            rippleColor={filter === f ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)"}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted border border-border"
            }`}
          >
            {f}
          </RippleButton>
        ))}
        <RippleButton
          onClick={() => setFetched(false)}
          rippleColor="rgba(255,255,255,0.15)"
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/40 text-muted-foreground hover:bg-muted border border-border transition-colors"
        >
          ↻ Refresh
        </RippleButton>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Discount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uses</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expires</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <div className="inline-block w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="text-3xl mb-2">🏷️</div>
                    <div className="text-muted-foreground text-sm">
                      {codes.length === 0 ? "Koi promo code nahi hai — pehla code create karo!" : "Koi code match nahi kiya"}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const expired = isExpired(c);
                  const usagePct = Math.min(100, Math.round((c.usedCount / c.maxUses) * 100));
                  return (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3.5">
                        <span className="font-mono font-bold text-foreground tracking-widest text-sm bg-muted/60 px-2 py-1 rounded">
                          {c.code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-green-400 font-bold text-base">{c.discountPct}%</span>
                        <span className="text-muted-foreground text-xs ml-1">off</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{c.usedCount}/{c.maxUses}</span>
                        </div>
                        <div className="w-20 h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${usagePct >= 90 ? "bg-red-500" : usagePct >= 60 ? "bg-yellow-500" : "bg-green-500"}`}
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs">
                        {c.expiresAt
                          ? <span className={expired ? "text-red-400" : ""}>
                              {new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              {expired && <span className="ml-1 text-red-400 font-medium">(Expired)</span>}
                            </span>
                          : <span className="text-green-400/70">No expiry</span>
                        }
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${
                          expired ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : c.isActive ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-muted text-muted-foreground border-border"
                        }`}>
                          {c.isActive && !expired ? (
                            <span className="relative flex w-2 h-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full w-2 h-2 bg-green-400" />
                            </span>
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full ${expired ? "bg-red-400" : "bg-muted-foreground"}`} />
                          )}
                          {expired ? "Expired" : c.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 justify-end">
                          <RippleButton
                            onClick={() => handleToggle(c)}
                            disabled={toggling === c.id || expired}
                            rippleColor={c.isActive ? "rgba(239,68,68,0.25)" : "rgba(74,222,128,0.3)"}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              c.isActive
                                ? "bg-muted/60 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 border border-border"
                                : "bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20"
                            }`}
                          >
                            {toggling === c.id ? "..." : c.isActive ? "Deactivate" : "Activate"}
                          </RippleButton>
                          <RippleButton
                            onClick={() => handleDelete(c.id, c.code)}
                            disabled={deleting === c.id}
                            rippleColor="rgba(239,68,68,0.3)"
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                          >
                            {deleting === c.id ? "..." : "Delete"}
                          </RippleButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold text-foreground">New Promo Code</h2>
              <p className="text-xs text-muted-foreground mt-1">Riders ko discount milega is code se</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Promo Code *</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. WELCOME20"
                  maxLength={20}
                  className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono tracking-widest"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Discount % *</label>
                  <input
                    type="number"
                    value={form.discountPct}
                    onChange={(e) => setForm((f) => ({ ...f, discountPct: Number(e.target.value) }))}
                    min={1} max={100}
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Max Uses *</label>
                  <input
                    type="number"
                    value={form.maxUses}
                    onChange={(e) => setForm((f) => ({ ...f, maxUses: Number(e.target.value) }))}
                    min={1}
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Expiry Date (optional)</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {form.code && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
                  Preview: Code <span className="font-mono font-bold text-primary">{form.code}</span> se {form.discountPct}% discount milega, max {form.maxUses} baar use ho sakta hai
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <RippleButton
                onClick={() => setShowCreate(false)}
                rippleColor="rgba(255,255,255,0.1)"
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-muted/40 text-muted-foreground hover:bg-muted border border-border transition-colors"
              >
                Cancel
              </RippleButton>
              <RippleButton
                onClick={handleCreate}
                disabled={creating || !form.code.trim()}
                rippleColor="rgba(255,255,255,0.3)"
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Code"}
              </RippleButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
