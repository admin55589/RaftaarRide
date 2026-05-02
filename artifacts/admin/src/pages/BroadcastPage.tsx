import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, Car, Globe } from "lucide-react";

import { API_BASE } from "@/lib/apiBase";

const QUICK_TEMPLATES = [
  { title: "🎉 Special Offer!", body: "Aaj ke liye 20% discount! SAVE20 code use karo." },
  { title: "🚗 New Driver Welcome", body: "RaftaarRide par aapka swagat hai! Kal se ride lena shuru karo." },
  { title: "⚠️ App Update", body: "Naya app update available hai. Please update karo better experience ke liye." },
  { title: "🌧️ Weather Alert", body: "Aaj mausam kharab ho sakta hai. Safe rahein, ride book karein." },
  { title: "💰 Bonus Alert", body: "Is weekend 5 rides karo aur ₹200 bonus pao! Offer sirf 48 ghante tak." },
];

export function BroadcastPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<"users" | "drivers" | "all">("all");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Title aur message dono required hain", variant: "destructive" });
      return;
    }
    if (!confirm(`"${title}" notification ${target === "all" ? "sabko" : target === "users" ? "users ko" : "drivers ko"} bhejna chahte ho?`)) return;
    setSending(true);
    setLastResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), target }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastResult(data);
        toast({ title: `✅ Notification bhej di! ${data.sent}/${data.total} devices pe pahunchi` });
        setTitle(""); setBody("");
      } else {
        toast({ title: data.message ?? "Error", variant: "destructive" });
      }
    } finally { setSending(false); }
  };

  const targets = [
    { value: "all" as const, label: "Everyone", sub: "All users + drivers", icon: Globe, color: "text-primary" },
    { value: "users" as const, label: "Users Only", sub: "Ride book karne wale", icon: Users, color: "text-blue-400" },
    { value: "drivers" as const, label: "Drivers Only", sub: "Registered drivers", icon: Car, color: "text-green-400" },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Push Notifications</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Users aur Drivers ko broadcast notifications bhejo</p>
      </div>

      {lastResult && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="font-semibold text-green-400 mb-1">✅ Notification bheji gayi!</div>
          <div className="text-sm text-muted-foreground">
            {lastResult.sent} devices pe pahunchi • {lastResult.failed} fail • {lastResult.total} total
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        <div>
          <label className="text-sm font-semibold text-foreground mb-3 block">Target Audience</label>
          <div className="grid grid-cols-3 gap-3">
            {targets.map((t) => (
              <button
                key={t.value}
                onClick={() => setTarget(t.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all active:scale-95 ${
                  target === t.value
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/20 hover:border-muted-foreground/30"
                }`}
              >
                <t.icon className={`w-5 h-5 ${target === t.value ? t.color : "text-muted-foreground"}`} />
                <div className="text-center">
                  <div className={`text-xs font-semibold ${target === t.value ? "text-foreground" : "text-muted-foreground"}`}>{t.label}</div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5">{t.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notification Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Special Offer!"
            maxLength={50}
            className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="text-right text-xs text-muted-foreground mt-1">{title.length}/50</div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message *</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Notification ka message likho..."
            maxLength={150}
            rows={3}
            className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="text-right text-xs text-muted-foreground mt-1">{body.length}/150</div>
        </div>

        {(title || body) && (
          <div className="bg-muted/30 border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Preview:</div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-base">🚗</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{title || "Title..."}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{body || "Message..."}</div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {sending ? "Bhej raha hai..." : `Send to ${target === "all" ? "Everyone" : target === "users" ? "Users" : "Drivers"}`}
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Templates</h2>
        <div className="space-y-2">
          {QUICK_TEMPLATES.map((tpl, i) => (
            <button
              key={i}
              onClick={() => { setTitle(tpl.title); setBody(tpl.body); }}
              className="w-full text-left px-4 py-3 bg-muted/20 hover:bg-muted/40 border border-border rounded-xl transition-colors active:scale-[0.99]"
            >
              <div className="text-sm font-medium text-foreground">{tpl.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.body}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
