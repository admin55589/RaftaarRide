import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, RefreshCw, Save, Brain, Clock, CloudRain, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/apiBase";

interface SurgeData {
  id?: number;
  multiplier: string;
  isActive: boolean;
  reason?: string | null;
  updatedAt?: string | null;
  aiMode: boolean;
  cityLat?: string;
  cityLng?: string;
}

interface AiPreview {
  multiplier: number;
  reason: string;
  factors: string[];
  isActive: boolean;
}

interface ForecastSlot {
  hour: number;
  label: string;
  multiplier: number;
  tag: string;
}

interface SurgeResponse {
  success: boolean;
  surge: SurgeData;
  aiPreview: AiPreview | null;
  forecast: ForecastSlot[];
}

const CITIES = [
  { name: "Delhi", lat: 28.6139, lng: 77.2090 },
  { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
  { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { name: "Chennai", lat: 13.0827, lng: 80.2707 },
  { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
  { name: "Pune", lat: 18.5204, lng: 73.8567 },
  { name: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
];

const PRESETS = [
  { label: "Normal", val: "1.0", color: "bg-green-500/15 border-green-500/30 text-green-400" },
  { label: "Mild 1.2x", val: "1.2", color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400" },
  { label: "Medium 1.5x", val: "1.5", color: "bg-orange-500/15 border-orange-500/30 text-orange-400" },
  { label: "High 2.0x", val: "2.0", color: "bg-red-500/15 border-red-500/30 text-red-400" },
  { label: "Peak 2.5x", val: "2.5", color: "bg-red-600/15 border-red-600/30 text-red-500" },
];

function multiplierColor(m: number): string {
  if (m >= 2.0) return "text-red-400";
  if (m >= 1.5) return "text-orange-400";
  if (m >= 1.2) return "text-yellow-400";
  if (m > 1.0) return "text-amber-400";
  return "text-green-400";
}

function multiplierBg(m: number): string {
  if (m >= 2.0) return "bg-red-500/20 border-red-500/30";
  if (m >= 1.5) return "bg-orange-500/20 border-orange-500/30";
  if (m >= 1.2) return "bg-yellow-500/20 border-yellow-500/30";
  if (m > 1.0) return "bg-amber-500/20 border-amber-500/30";
  return "bg-green-500/10 border-green-500/20";
}

export function SurgePage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [multiplier, setMultiplier] = useState("1.0");
  const [reason, setReason] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);

  const { data, isLoading, refetch } = useQuery<SurgeResponse>({
    queryKey: ["admin-surge"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/surge`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch surge settings");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (data?.surge) {
      const s = data.surge;
      setMultiplier(String(parseFloat(s.multiplier).toFixed(1)));
      setIsActive(s.isActive);
      setReason(s.reason ?? "");
      setAiMode(s.aiMode);
      if (s.cityLat && s.cityLng) {
        const lat = parseFloat(s.cityLat);
        const lng = parseFloat(s.cityLng);
        const match = CITIES.find(c => Math.abs(c.lat - lat) < 0.5 && Math.abs(c.lng - lng) < 0.5);
        if (match) setSelectedCity(match);
      }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const mult = parseFloat(multiplier);
      if (!aiMode && (isNaN(mult) || mult < 1 || mult > 5))
        throw new Error("Multiplier 1.0 se 5.0 ke beech hona chahiye");
      const body: Record<string, unknown> = {
        aiMode,
        cityLat: selectedCity.lat,
        cityLng: selectedCity.lng,
      };
      if (!aiMode) {
        body.multiplier = mult;
        body.isActive = isActive;
        body.reason = reason.trim();
      }
      const res = await fetch(`${API_BASE}/api/admin/surge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Save failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-surge"] });
      toast({ title: "✅ Settings Saved", description: aiMode ? "AI Mode enabled — surge auto-calculated" : `Manual surge ${isActive ? "activated" : "deactivated"} at ${multiplier}x` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const aiPreview = data?.aiPreview;
  const forecast = data?.forecast ?? [];
  const surge = data?.surge;

  const currentMultiplier = aiMode && aiPreview ? aiPreview.multiplier : parseFloat(multiplier);
  const currentReason = aiMode && aiPreview ? aiPreview.reason : (reason || "Manual control");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" /> Surge Pricing
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI ya manual — fare control aapke haath mein
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-lg border border-border hover:bg-accent">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Live Status Banner */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${currentMultiplier > 1 ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${currentMultiplier > 1 ? "bg-red-500/20" : "bg-green-500/20"}`}>
          {aiMode ? "🤖" : currentMultiplier > 1 ? "⚡" : "✅"}
        </div>
        <div className="flex-1">
          <p className={`font-bold text-lg ${currentMultiplier > 1 ? "text-red-400" : "text-green-400"}`}>
            {aiMode ? "AI Mode" : "Manual"} —{" "}
            {currentMultiplier > 1 ? `${currentMultiplier}x surge active` : "Normal fare"}
          </p>
          <p className="text-sm text-muted-foreground">{currentReason}</p>
          {surge?.updatedAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Last updated: {new Date(surge.updatedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
        {aiMode && aiPreview && (
          <div className={`text-center px-4 py-2 rounded-lg border ${multiplierBg(aiPreview.multiplier)}`}>
            <p className={`text-2xl font-black ${multiplierColor(aiPreview.multiplier)}`}>{aiPreview.multiplier}x</p>
            <p className="text-xs text-muted-foreground">AI Surge</p>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : (
        <>
          {/* AI Mode Toggle Card */}
          <div className={`bg-card border rounded-xl p-5 space-y-4 ${aiMode ? "border-purple-500/40 ring-1 ring-purple-500/20" : "border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${aiMode ? "bg-purple-500/20" : "bg-muted"}`}>
                  <Brain className={`w-5 h-5 ${aiMode ? "text-purple-400" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-bold text-foreground">AI Auto-Surge Mode</p>
                  <p className="text-xs text-muted-foreground">
                    Time, weather aur festival ke hisaab se automatically surge set hoga
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAiMode(!aiMode)}
                className={`relative w-14 h-7 rounded-full transition-colors ${aiMode ? "bg-purple-500" : "bg-muted"}`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${aiMode ? "translate-x-7" : "translate-x-0"}`} />
              </button>
            </div>

            {/* AI Factors (when AI mode is on) */}
            {aiMode && aiPreview && (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Factors Right Now</p>
                {aiPreview.factors.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {aiPreview.factors.map((f, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-sm">
                        {f}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Normal demand — koi special factor nahi</p>
                )}

                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="bg-background rounded-lg border border-border p-3 text-center">
                    <Clock className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Time-based</p>
                    <p className="text-sm font-bold text-foreground">Auto ✓</p>
                  </div>
                  <div className="bg-background rounded-lg border border-border p-3 text-center">
                    <CloudRain className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Weather</p>
                    <p className="text-sm font-bold text-foreground">Live ✓</p>
                  </div>
                  <div className="bg-background rounded-lg border border-border p-3 text-center">
                    <Sparkles className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Festivals</p>
                    <p className="text-sm font-bold text-foreground">15+ ✓</p>
                  </div>
                </div>
              </div>
            )}

            {/* City selector (for weather) */}
            {aiMode && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">City (Weather ke liye)</p>
                <div className="flex flex-wrap gap-2">
                  {CITIES.map(city => (
                    <button
                      key={city.name}
                      onClick={() => setSelectedCity(city)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                        selectedCity.name === city.name
                          ? "bg-purple-500/20 border-purple-500/40 text-purple-300 ring-1 ring-purple-500/30"
                          : "bg-muted border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AI Rules Reference */}
            {aiMode && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">AI Rules</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { time: "7 – 10 AM", label: "Morning Rush", mult: "1.4x", color: "text-yellow-400" },
                    { time: "12 – 2 PM", label: "Lunch Peak", mult: "1.2x", color: "text-yellow-300" },
                    { time: "5 – 9 PM", label: "Evening Peak", mult: "1.6x", color: "text-orange-400" },
                    { time: "11 PM – 4 AM", label: "Late Night", mult: "1.3x", color: "text-blue-400" },
                    { time: "🌧️ Rain", label: "+0.4x added", mult: "+0.4x", color: "text-cyan-400" },
                    { time: "🎉 Festival", label: "Special rate", mult: "up to 2.5x", color: "text-purple-400" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 border border-border">
                      <div>
                        <p className="font-medium text-foreground">{r.time}</p>
                        <p className="text-muted-foreground">{r.label}</p>
                      </div>
                      <span className={`font-bold ${r.color}`}>{r.mult}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Manual Controls (when AI mode is off) */}
          {!aiMode && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-5">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Manual Control</p>

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

              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick Presets</p>
                <div className="flex gap-2 flex-wrap">
                  {PRESETS.map(p => (
                    <button
                      key={p.val}
                      onClick={() => { setMultiplier(p.val); setIsActive(p.val !== "1.0"); }}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${multiplier === p.val ? p.color + " ring-1 ring-current" : "bg-muted border-border text-muted-foreground hover:bg-accent"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

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
                  <span className={`text-xl font-black ${parseFloat(multiplier) > 1.5 ? "text-red-400" : parseFloat(multiplier) > 1 ? "text-yellow-400" : "text-green-400"}`}>
                    {parseFloat(multiplier) > 1.5 ? "⚡⚡" : parseFloat(multiplier) > 1 ? "⚡" : "✅"}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                  Reason (optional)
                </label>
                <input
                  type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Heavy rain, Diwali night, Morning rush..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {aiMode ? <Brain className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saveMutation.isPending ? "Saving..." : aiMode ? "Save AI Mode Settings" : "Save Manual Surge"}
          </button>

          {/* 24h Forecast */}
          {forecast.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Next 24h Time-Based Forecast {aiMode ? "(AI predicts — weather excluded)" : "(preview only)"}
              </p>
              <div className="overflow-x-auto">
                <div className="flex gap-2 pb-2" style={{ minWidth: "max-content" }}>
                  {forecast.map((slot, i) => (
                    <div
                      key={i}
                      className={`flex flex-col items-center p-2 rounded-lg border min-w-[60px] ${multiplierBg(slot.multiplier)}`}
                    >
                      <span className="text-xs text-muted-foreground">{slot.label}</span>
                      <span className={`text-sm font-bold mt-1 ${multiplierColor(slot.multiplier)}`}>
                        {slot.multiplier}x
                      </span>
                      {slot.multiplier > 1 && (
                        <span className="text-[9px] text-center text-muted-foreground mt-0.5 leading-tight">
                          {slot.tag.length > 12 ? slot.tag.slice(0, 12) + "…" : slot.tag}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                🌧️ Rain impact — real-time weather ke hisaab se +0.4x add hoga (AI mode mein)
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
