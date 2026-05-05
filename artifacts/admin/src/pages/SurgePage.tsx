import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, RefreshCw, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/apiBase";

interface SurgeData {
  id?: number;
  multiplier: number;
  isActive: boolean;
  reason?: string;
  updatedAt?: string;
}

export function SurgePage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [multiplier, setMultiplier] = useState("1.0");
  const [reason, setReason] = useState("");
  const [isActive, setIsActive] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ success: boolean; surge: SurgeData }>({
    queryKey: ["admin-surge"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/surge`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch surge settings");
      return res.json();
    },
    enabled: !!token,
  });

  useEffect(() => {
    if (data?.surge) {
      setMultiplier(String(data.surge.multiplier));
      setIsActive(data.surge.isActive);
      setReason(data.surge.reason ?? "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const mult = parseFloat(multiplier);
      if (isNaN(mult) || mult < 1 || mult > 5) throw new Error("Multiplier 1.0 se 5.0 ke beech hona chahiye");
      const res = await fetch(`${API_BASE}/api/admin/surge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ multiplier: mult, isActive, reason: reason.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Save failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-surge"] });
      toast({ title: "✅ Surge Settings Saved", description: `Surge ${isActive ? "activated" : "deactivated"} at ${multiplier}x` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const surgeData = data?.surge;

  const presets = [
    { label: "Normal", val: "1.0", color: "bg-green-500/15 border-green-500/30 text-green-400" },
    { label: "Mild 1.2x", val: "1.2", color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400" },
    { label: "Medium 1.5x", val: "1.5", color: "bg-orange-500/15 border-orange-500/30 text-orange-400" },
    { label: "High 2.0x", val: "2.0", color: "bg-red-500/15 border-red-500/30 text-red-400" },
    { label: "Peak 2.5x", val: "2.5", color: "bg-red-600/15 border-red-600/30 text-red-500" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" /> Surge Pricing
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Peak hours ya demand spike mein fares zyada karo
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-lg border border-border hover:bg-accent">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Current status */}
      {surgeData && (
        <div className={`rounded-xl border p-4 flex items-center gap-4 ${surgeData.isActive ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${surgeData.isActive ? "bg-red-500/20" : "bg-green-500/20"}`}>
            {surgeData.isActive ? "⚡" : "✅"}
          </div>
          <div>
            <p className={`font-bold text-lg ${surgeData.isActive ? "text-red-400" : "text-green-400"}`}>
              Surge {surgeData.isActive ? `Active — ${surgeData.multiplier}x` : "Inactive — Normal Fare"}
            </p>
            {surgeData.reason && <p className="text-sm text-muted-foreground">{surgeData.reason}</p>}
            {surgeData.updatedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last updated: {new Date(surgeData.updatedAt).toLocaleString("en-IN")}
              </p>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">Surge Active</p>
              <p className="text-sm text-muted-foreground">Enable karo toh multiplier apply hoga</p>
            </div>
            <button
              onClick={() => setIsActive(!isActive)}
              className={`relative w-12 h-6 rounded-full transition-colors ${isActive ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isActive ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Multiplier presets */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick Presets</p>
            <div className="flex gap-2 flex-wrap">
              {presets.map(p => (
                <button key={p.val} onClick={() => { setMultiplier(p.val); if (p.val !== "1.0") setIsActive(true); else setIsActive(false); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${multiplier === p.val ? p.color + " ring-1 ring-current" : "bg-muted border-border text-muted-foreground hover:bg-accent"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom multiplier */}
          <div>
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Custom Multiplier (1.0 – 5.0)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number" min="1" max="5" step="0.1" value={multiplier}
                onChange={e => setMultiplier(e.target.value)}
                className="w-28 bg-background border border-border rounded-lg px-3 py-2 text-lg font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-muted-foreground text-sm">× normal fare</span>
              <span className={`text-xl font-black ${parseFloat(multiplier) > 1 ? "text-yellow-400" : "text-green-400"}`}>
                {parseFloat(multiplier) > 1.5 ? "⚡⚡" : parseFloat(multiplier) > 1 ? "⚡" : "✅"}
              </span>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Reason (optional — drivers ko dikhega)
            </label>
            <input
              type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Heavy rain, Festival peak, Morning rush..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Saving..." : "Save Surge Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
