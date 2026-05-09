import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/apiBase";
import {
  IndianRupee, TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  CheckCircle, Server, MessageSquare, MapPin, CreditCard, Gift, Trophy, Wallet,
  Info,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function fmtSmall(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}
function pct(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

interface FinancialData {
  revenue: {
    commission: { total: number; thisMonth: number; count: number };
    plans: { total: number; thisMonth: number; count: number };
    total: number;
    thisMonth: number;
  };
  expenses: {
    loyalty: { total: number; thisMonth: number; count: number };
    referral: { total: number; thisMonth: number; count: number };
    razorpay: { total: number; thisMonth: number; count: number; note: string };
    withdrawals: { total: number; count: number };
    dbTrackedTotal: number;
    dbTrackedThisMonth: number;
  };
  infrastructure: {
    sms: { estimatedTotalSpent: number; estimatedMonthly: number; otpsEstimated: number; note: string };
    maps: { totalCalls: number; freeCallsLimit: number; billableCalls: number; estimatedCostInr: number; note: string };
    server: { monthly: number; breakdown: Record<string, { name: string; monthlyInr: number; note: string }> };
  };
  netPnl: { total: number; thisMonth: number; profitMarginPct: number };
  meta: { generatedAt: string; totalRides: number; totalUsers: number; totalTopupAmount: number };
}

function Pill({ label, color }: { label: string; color: "green" | "red" | "amber" | "blue" | "purple" }) {
  const cls = {
    green: "bg-green-500/15 text-green-400 border-green-500/30",
    red: "bg-red-500/15 text-red-400 border-red-500/30",
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  }[color];
  return <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function Section({ title, icon: Icon, iconColor, children }: { title: string; icon: React.ComponentType<{ className?: string }>; iconColor: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Row({ label, all, month, badge, note }: { label: string; all: number; month: number; badge?: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-border/50 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {badge}
        </div>
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-foreground">{fmt(all)}</div>
        <div className="text-xs text-muted-foreground">is mahine: {fmt(month)}</div>
      </div>
    </div>
  );
}

export function FinancialHealthPage() {
  const { token } = useAuth();

  const { data, isLoading, refetch, isFetching } = useQuery<FinancialData>({
    queryKey: ["financial-health"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/financial-health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      return d;
    },
    enabled: !!token,
  });

  const d = data;
  const isProfitable = (d?.netPnl.total ?? 0) >= 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <IndianRupee className="w-6 h-6 text-primary" />
            Financial Health — P&amp;L Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform ka poora revenue, expenses aur net profit ek jagah
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">Loading financial data...</div>
      ) : !d ? null : (
        <>
          {/* ── Top P&L Summary ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-xs text-muted-foreground font-medium uppercase">Total Revenue</span>
              </div>
              <div className="text-2xl font-bold text-green-400">{fmt(d.revenue.total)}</div>
              <div className="text-xs text-muted-foreground mt-1">Is mahine: {fmt(d.revenue.thisMonth)}</div>
            </div>

            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-xs text-muted-foreground font-medium uppercase">Total Expenses</span>
              </div>
              <div className="text-2xl font-bold text-red-400">{fmt(d.expenses.dbTrackedTotal)}</div>
              <div className="text-xs text-muted-foreground mt-1">Is mahine: {fmt(d.expenses.dbTrackedThisMonth)}</div>
            </div>

            <div className={`rounded-xl border p-4 ${isProfitable ? "border-primary/30 bg-primary/5" : "border-red-500/30 bg-red-500/5"}`}>
              <div className="flex items-center gap-2 mb-2">
                {isProfitable
                  ? <CheckCircle className="w-4 h-4 text-primary" />
                  : <AlertTriangle className="w-4 h-4 text-red-400" />}
                <span className="text-xs text-muted-foreground font-medium uppercase">Net Profit</span>
              </div>
              <div className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-red-400"}`}>
                {fmt(d.netPnl.total)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Margin: <span className={isProfitable ? "text-green-400" : "text-red-400"}>{pct(d.netPnl.profitMarginPct)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground font-medium uppercase">Total Rides</span>
              </div>
              <div className="text-2xl font-bold text-blue-400">{d.meta.totalRides.toLocaleString("en-IN")}</div>
              <div className="text-xs text-muted-foreground mt-1">{d.meta.totalUsers} registered users</div>
            </div>
          </div>

          {/* ── Revenue Sources ── */}
          <Section title="💰 Revenue Sources — Platform Ko Paisa Kahan Se Aata Hai" icon={TrendingUp} iconColor="text-green-400">
            <Row
              label="Ride Commission (Platform Fee)"
              all={d.revenue.commission.total}
              month={d.revenue.commission.thisMonth}
              badge={<Pill label="Main Income" color="green" />}
              note={`${d.revenue.commission.count} completed rides. Bike: ₹4, Auto: ₹8, Car: ₹12 fixed per ride`}
            />
            <Row
              label="Driver Plan Subscriptions"
              all={d.revenue.plans.total}
              month={d.revenue.plans.thisMonth}
              badge={<Pill label="Recurring" color="blue" />}
              note={`${d.revenue.plans.count} plan purchases. Monthly/weekly driver subscriptions`}
            />
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Total Revenue (All Time)</span>
              <span className="text-xl font-bold text-green-400">{fmt(d.revenue.total)}</span>
            </div>

            <div className="mt-4 rounded-lg bg-green-500/5 border border-green-500/20 p-4">
              <p className="text-xs font-semibold text-green-400 mb-2">📈 Revenue Badhane Ka Formula</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>• Zyada rides = zyada commission. 1000 rides/day = ₹8,000–₹12,000/day</div>
                <div>• Driver plans se guaranteed monthly income milti hai</div>
                <div>• Surge pricing se peak hours mein 20–30% extra</div>
                <div>• Referral se user growth → rides → commission chain</div>
              </div>
            </div>
          </Section>

          {/* ── Platform Expenses (DB Tracked) ── */}
          <Section title="📉 Platform Expenses — DB Tracked (Exact Data)" icon={TrendingDown} iconColor="text-red-400">
            <Row
              label="Loyalty Redemptions (₹10 credit per 100 pts)"
              all={d.expenses.loyalty.total}
              month={d.expenses.loyalty.thisMonth}
              badge={<Pill label={`${d.expenses.loyalty.count} redemptions`} color="amber" />}
              note="User ke wallet mein directly credit. Commission revenue se cover hota hai"
            />
            <Row
              label="Referral Bonuses"
              all={d.expenses.referral.total}
              month={d.expenses.referral.thisMonth}
              badge={<Pill label={`${d.expenses.referral.count} referrals`} color="purple" />}
              note="Naye user aane par purane user ko bonus. Long-term growth cost"
            />
            <Row
              label="Razorpay Gateway Fees (Estimated 2.36%)"
              all={d.expenses.razorpay.total}
              month={d.expenses.razorpay.thisMonth}
              badge={<Pill label="Estimated" color="amber" />}
              note={`2% + 18% GST on ${fmt(d.meta.totalTopupAmount)} total wallet topups. ${d.expenses.razorpay.count} transactions`}
            />
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Total Platform Expenses</span>
              <span className="text-xl font-bold text-red-400">{fmt(d.expenses.dbTrackedTotal)}</span>
            </div>

            <div className="mt-4 rounded-lg bg-amber-500/5 border border-amber-500/20 p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2">⚠️ Expense Control Tips</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>• Loyalty rate adjust karo: 150 pts = ₹10 karo aggar expense zyada ho</div>
                <div>• Referral cap lagao: max ₹50/user per month</div>
                <div>• Razorpay: minimum topup ₹50 rakho (small transactions ka fee % zyada hota)</div>
                <div>• Wallets mein balance promote karo = less Razorpay transactions</div>
              </div>
            </div>
          </Section>

          {/* ── Infrastructure Costs ── */}
          <Section title="🏗️ Infrastructure Costs — Estimated (Monthly)" icon={Server} iconColor="text-blue-400">
            {/* SMS */}
            <div className="py-3 border-b border-border/50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm font-medium text-foreground">SMS OTP (2Factor API)</span>
                    <Pill label="Action Required" color="red" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ~{d.infrastructure.sms.otpsEstimated.toLocaleString("en-IN")} OTPs estimated. ₹0.30/SMS via 2Factor.
                    {" "}{d.infrastructure.sms.note}
                  </p>
                  <p className="text-xs text-amber-400 mt-1 font-medium">
                    👉 Dashboard par 2Factor SMS balance dekhte raho — low hone par immediately recharge karo
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-foreground">{fmtSmall(d.infrastructure.sms.estimatedTotalSpent)}</div>
                  <div className="text-xs text-muted-foreground">est. total</div>
                  <div className="text-xs text-blue-400">~{fmt(d.infrastructure.sms.estimatedMonthly)}/mo</div>
                </div>
              </div>
            </div>

            {/* Maps */}
            <div className="py-3 border-b border-border/50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="text-sm font-medium text-foreground">Google Maps APIs</span>
                    {d.infrastructure.maps.billableCalls === 0
                      ? <Pill label="Free Tier Mein" color="green" />
                      : <Pill label="Billable" color="red" />
                    }
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.infrastructure.maps.totalCalls.toLocaleString("en-IN")} total calls ({d.meta.totalRides} rides × 5 calls).
                    Free limit: {d.infrastructure.maps.freeCallsLimit.toLocaleString("en-IN")} calls ($200/mo credit).
                    {d.infrastructure.maps.billableCalls > 0 && ` Billable: ${d.infrastructure.maps.billableCalls.toLocaleString()} calls.`}
                  </p>
                  <p className="text-xs text-green-400 mt-1 font-medium">
                    {d.infrastructure.maps.billableCalls === 0
                      ? "✅ Abhi free tier mein ho — $200/mo credit ample hai"
                      : `⚠️ Free limit cross ho gayi — billing shuru ho sakti hai`
                    }
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-foreground">
                    {d.infrastructure.maps.estimatedCostInr === 0 ? "₹0" : fmt(d.infrastructure.maps.estimatedCostInr)}
                  </div>
                  <div className="text-xs text-muted-foreground">est. cost</div>
                </div>
              </div>
            </div>

            {/* Server */}
            <div className="py-3">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="text-sm font-medium text-foreground">Server Hosting (Monthly)</span>
              </div>
              <div className="space-y-2">
                {Object.values(d.infrastructure.server.breakdown).map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-foreground">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.note}</div>
                    </div>
                    <div className={`text-sm font-bold ${s.monthlyInr === 0 ? "text-green-400" : "text-amber-400"}`}>
                      {s.monthlyInr === 0 ? "Free" : fmt(s.monthlyInr)}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 pt-2 border-t border-border">
                  <span className="text-sm font-semibold text-foreground">Total Monthly Server</span>
                  <span className="text-sm font-bold text-amber-400">{fmt(d.infrastructure.server.monthly)}/mo</span>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Net P&L Summary ── */}
          <Section title="📊 Net P&amp;L Summary" icon={IndianRupee} iconColor="text-primary">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className={`rounded-xl p-4 border ${isProfitable ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <p className="text-xs text-muted-foreground mb-1">All-Time Net (Revenue − Expenses)</p>
                <p className={`text-2xl font-bold ${isProfitable ? "text-green-400" : "text-red-400"}`}>{fmt(d.netPnl.total)}</p>
                <p className="text-xs text-muted-foreground mt-1">Margin: {pct(d.netPnl.profitMarginPct)}</p>
              </div>
              <div className="rounded-xl p-4 border border-border bg-white/5">
                <p className="text-xs text-muted-foreground mb-1">Is Mahine Ka Net</p>
                <p className={`text-2xl font-bold ${d.netPnl.thisMonth >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmt(d.netPnl.thisMonth)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Server cost include karke</p>
              </div>
              <div className="rounded-xl p-4 border border-border bg-white/5">
                <p className="text-xs text-muted-foreground mb-1">Break-Even (Monthly)</p>
                <p className="text-2xl font-bold text-blue-400">{fmt(d.infrastructure.server.monthly + 2000)}</p>
                <p className="text-xs text-muted-foreground mt-1">Server + SMS monthly minimum chahiye</p>
              </div>
            </div>

            {/* Profitability Tips */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-bold text-primary">🎯 RaftaarRide Ko Financially Strong Rakhne Ke Liye</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Commission target:</strong> ₹10,000/day chahiye to 1000+ rides/day complete karne honge</span>
                </div>
                <div className="flex items-start gap-2">
                  <Gift className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Referral cap:</strong> Max ₹30–50/user referral bonus rakho — unlimited bonuses loss create karte hain</span>
                </div>
                <div className="flex items-start gap-2">
                  <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Loyalty rate:</strong> 150 pts = ₹10 karo (0.67% cashback) — still attractive but less expensive</span>
                </div>
                <div className="flex items-start gap-2">
                  <Wallet className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Wallet topups:</strong> Min ₹100 topup enforce karo — ₹20 topup pe Razorpay fee % bahut zyada hai</span>
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">SMS cost:</strong> Fast2SMS ka bulk pack lo — 10,000 SMS pack ₹800 mein milta hai (₹0.08/SMS)</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Maps free tier:</strong> 40,000 calls/mo free — upto 8,000 rides/mo zero Maps cost. Scale ke baad cache karo</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Last updated: {new Date(d.meta.generatedAt).toLocaleString("en-IN")}. Infrastructure costs estimated hain, exact nahi. Razorpay fees bhi estimated hain (2.36% of topups).
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
