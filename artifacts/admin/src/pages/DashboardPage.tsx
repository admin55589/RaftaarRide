import React from "react";
import {
  useGetAdminStats, useGetRecentRides, useGetDailyAnalytics,
  getGetAdminStatsQueryKey, getGetRecentRidesQueryKey, getGetDailyAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Users, Car, MapPin, IndianRupee, TrendingUp, Star, Zap, Wallet, MessageSquare, AlertTriangle, RefreshCw, Cloud, CheckCircle, XCircle, Settings, Clock, Radio, Navigation } from "lucide-react";
import { StatusBadge, VehicleBadge, formatCurrency, formatDate } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/apiBase";


function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

function SmsBalanceCard() {
  const { token } = useAuth();
  const { data, isLoading, error: fetchError, refetch, isFetching } = useQuery<{
    credits: number | null;
    fast2SmsWallet: number | null;
    error?: string;
    fast2SmsError?: string;
  }>({
    queryKey: ["sms-balance"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/sms-balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });

  const credits: number | null = data?.credits ?? null;
  const fast2SmsWallet: number | null = data?.fast2SmsWallet ?? null;
  const hasCredits = credits !== null && !Number.isNaN(credits);
  const hasFast2Sms = fast2SmsWallet !== null && !Number.isNaN(fast2SmsWallet);
  const isLow = hasCredits && credits! < 50;
  const isCritical = hasCredits && credits! < 10;

  const twoFactorErrMsg = data?.error ?? (fetchError ? (fetchError as Error).message : null);
  const fast2SmsErrMsg  = data?.fast2SmsError ?? (fetchError ? (fetchError as Error).message : null);

  const isNotConfigured = (msg: string | null) =>
    msg?.toLowerCase().includes("not configured") || msg?.toLowerCase().includes("api_key");

  return (
    <div className={`rounded-2xl border p-5 ${
      isCritical ? "bg-red-500/10 border-red-500/40" :
      isLow      ? "bg-amber-500/10 border-amber-500/40" :
                   "bg-blue-500/10 border-blue-500/20"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isCritical ? "bg-red-500/20" : isLow ? "bg-amber-500/20" : "bg-blue-500/20"
          }`}>
            {isCritical || isLow
              ? <AlertTriangle className={`w-5 h-5 ${isCritical ? "text-red-400" : "text-amber-400"}`} />
              : <MessageSquare className="w-5 h-5 text-blue-400" />
            }
          </div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SMS Provider Balance</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-14 bg-white/5 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* 2Factor */}
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">2Factor (OTP)</p>
            {hasCredits ? (
              <>
                <p className={`text-xl font-bold ${isCritical ? "text-red-400" : isLow ? "text-amber-400" : "text-blue-400"}`}>
                  {credits!} <span className="text-xs font-normal">SMS</span>
                </p>
                {isCritical && <p className="text-xs text-red-400 mt-0.5">⚠️ Critical — Recharge now</p>}
                {isLow && !isCritical && <p className="text-xs text-amber-400 mt-0.5">⚠️ Low — recharge soon</p>}
                {!isLow && <p className="text-xs text-green-400 mt-0.5">✅ Sufficient</p>}
              </>
            ) : (
              <p className="text-xs text-red-400 mt-1">
                {isNotConfigured(twoFactorErrMsg) ? "API key not set in env" : (twoFactorErrMsg ?? "Could not fetch")}
              </p>
            )}
          </div>
          {/* Fast2SMS */}
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">Fast2SMS (Wallet)</p>
            {hasFast2Sms ? (
              <>
                <p className="text-xl font-bold text-emerald-400">
                  ₹{fast2SmsWallet!.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Available balance</p>
              </>
            ) : (
              <p className="text-xs text-amber-400 mt-1">
                {isNotConfigured(fast2SmsErrMsg) ? "API key not set in env" : (fast2SmsErrMsg ?? "Could not fetch")}
              </p>
            )}
          </div>
        </div>
      )}

      {isCritical && (
        <p className="text-xs text-red-400 mt-2 font-medium">⚠️ OTP delivery fail ho sakti hai — 2Factor recharge karo</p>
      )}
    </div>
  );
}

type MapsUsageData = {
  apis?: { geocoding: string; directions: string };
  pricing?: { freeCreditUSD: number; freeCreditINR: number; geocodingPer1k: number; directionsPer1k: number; note: string };
  fetchedAt?: string;
  error?: string;
};

type CloudCostData = {
  configured: boolean;
  accountName?: string;
  accountOpen?: boolean;
  monthLabel?: string;
  budgets?: Array<{ name: string; budgetAmount: number; projects: string[] }>;
  budgetApiError?: string;
  projectId?: string;
  fetchedAt?: string;
  error?: string;
};

function ApiStatusDot({ status }: { status: string }) {
  if (status === "ok") return <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium"><CheckCircle className="w-3 h-3" />Active</span>;
  return <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium"><XCircle className="w-3 h-3" />{status}</span>;
}

function MapsStatusCard() {
  const { token } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery<MapsUsageData>({
    queryKey: ["maps-usage"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/maps-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 10 * 60 * 1000,
  });

  const allOk = data?.apis && Object.values(data.apis).every((s) => s === "ok");

  return (
    <div className="bg-card border border-card-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Google Maps APIs</p>
            <p className="text-xs text-muted-foreground">Live status & pricing</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : data?.error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-xs text-red-400">{data.error}</p>
          <button onClick={() => refetch()} className="text-xs text-blue-400 underline mt-1">Retry</button>
        </div>
      ) : !data ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-xs text-red-400">Data load nahi hua — refresh karo</p>
          <button onClick={() => refetch()} className="text-xs text-blue-400 underline mt-1">Retry</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {data.apis && (
              <>
                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Geocoding</p>
                  <ApiStatusDot status={data.apis.geocoding} />
                </div>
                <div className="bg-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Directions</p>
                  <ApiStatusDot status={data.apis.directions} />
                </div>
              </>
            )}
          </div>

          {data.pricing && (
            <div className={`rounded-xl p-3 ${allOk ? "bg-green-500/10 border border-green-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
              <p className={`text-xs font-semibold mb-2 ${allOk ? "text-green-400" : "text-amber-400"}`}>
                Free Credit: ${data.pricing.freeCreditUSD}/month (~₹{data.pricing.freeCreditINR.toLocaleString()})
              </p>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Geocoding: ${data.pricing.geocodingPer1k}/1000 calls</p>
                <p className="text-xs text-muted-foreground">Directions: ${data.pricing.directionsPer1k}/1000 calls</p>
              </div>
              <p className="text-xs text-green-400/80 mt-2 font-medium">{data.pricing.note}</p>
            </div>
          )}

          {data.fetchedAt && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              Updated: {new Date(data.fetchedAt).toLocaleTimeString("en-IN")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CloudCostCard() {
  const { token } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery<CloudCostData>({
    queryKey: ["cloud-costs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/cloud-costs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="bg-card border border-card-border rounded-2xl p-5 animate-pulse h-40" />
    );
  }

  if (!data?.configured) {
    return (
      <div className="bg-card border border-card-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Cloud className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Google Cloud Billing</p>
            <p className="text-xs text-muted-foreground">Real-time cost monitoring</p>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-start gap-3">
          <Settings className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground mb-0.5">Optional — Not Configured</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Real-time GCP billing monitor ke liye <code className="bg-white/10 px-1 rounded text-xs">GOOGLE_SERVICE_ACCOUNT_KEY</code> env var set karo.
              Abhi Railway/Replit dashboard se billing manually check karo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Cloud className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Google Cloud Billing</p>
            <p className="text-xs text-muted-foreground">{data.monthLabel ?? "This month"}</p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {data.error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-xs text-red-400">{data.error}</p>
        </div>
      ) : (
        <>
          <div className={`rounded-xl p-3 mb-3 flex items-center gap-3 ${data.accountOpen ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
            {data.accountOpen
              ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
              : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            }
            <div>
              <p className={`text-xs font-semibold ${data.accountOpen ? "text-green-400" : "text-red-400"}`}>
                {data.accountName} — {data.accountOpen ? "Active & Paid" : "Inactive"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.accountOpen ? "Billing account khuli hai — charges apply ho rahi hain" : "Account band hai"}
              </p>
            </div>
          </div>

          {data.budgetApiError === "BUDGET_API_DISABLED" ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-xs text-amber-400 font-semibold mb-1">⚡ Cloud Billing Budget API Enable Karo</p>
              <p className="text-xs text-muted-foreground mb-2">
                Budget data dekhne ke liye yeh API enable karni hogi — 1 click ka kaam!
              </p>
              <a
                href={`https://console.developers.google.com/apis/api/billingbudgets.googleapis.com/overview?project=${data.projectId ?? "796255910809"}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Enable Budget API →
              </a>
            </div>
          ) : (data.budgets ?? []).length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active Budgets</p>
              {(data.budgets ?? []).map((b, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">{b.name}</p>
                  <p className="text-xs text-purple-400 font-semibold">
                    Limit: ₹{b.budgetAmount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <p className="text-xs text-green-400 font-semibold mb-1">✅ Budget Connected!</p>
              <p className="text-xs text-muted-foreground">
                Budget data load ho raha hai — thodi der mein dikh jaayega.
              </p>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Maps Free Credit</p>
              <p className="text-sm font-bold text-green-400">$200/mo</p>
              <p className="text-xs text-muted-foreground">~₹16,800</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Firebase Free Tier</p>
              <p className="text-sm font-bold text-orange-400">Spark Plan</p>
              <p className="text-xs text-muted-foreground">10K Auth/day free</p>
            </div>
          </div>

          {data.fetchedAt && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              Updated: {new Date(data.fetchedAt).toLocaleTimeString("en-IN")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

type PendingCommissionsData = {
  success: boolean;
  totalPending: number;
  pendingRides: number;
  drivers: Array<{
    driverId: number;
    name: string;
    phone: string;
    pendingCommission: number;
    walletBalance: number;
  }>;
};

function PendingCommissionsCard() {
  const { token } = useAuth();
  const [collecting, setCollecting] = React.useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<PendingCommissionsData>({
    queryKey: ["pending-commissions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/pending-commissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 60 * 1000,
  });

  const handleCollect = async (driverId: number, name: string) => {
    setCollecting(driverId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/pending-commissions/${driverId}/collect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) {
        refetch();
      }
    } finally {
      setCollecting(null);
    }
  };

  const hasPending = (data?.totalPending ?? 0) > 0;

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Clock className={`w-4 h-4 ${hasPending ? "text-red-400" : "text-muted-foreground"}`} />
        Pending Cash Commissions
        {hasPending && (
          <span className="ml-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">
            {data!.pendingRides} rides
          </span>
        )}
      </h2>

      {isLoading ? (
        <div className="h-24 bg-card border border-card-border rounded-2xl animate-pulse" />
      ) : !hasPending ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-400">Sab clear hai!</p>
            <p className="text-xs text-muted-foreground">Koi bhi pending cash commission nahi hai.</p>
          </div>
        </div>
      ) : (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl overflow-hidden">
          {/* Summary row */}
          <div className="p-4 flex items-center gap-4 border-b border-red-500/20">
            <div className="flex-1">
              <p className="text-xs text-red-400 font-medium uppercase tracking-wide">Total Pending Commission</p>
              <p className="text-2xl font-bold text-red-400 mt-0.5">{formatCurrency(data!.totalPending)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data!.pendingRides} rides mein pending</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
          </div>

          {/* Per-driver list */}
          <div className="divide-y divide-red-500/10">
            {data!.drivers.map((d) => (
              <div key={d.driverId} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.phone}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Wallet: <span className={d.walletBalance < 0 ? "text-red-400" : "text-muted-foreground"}>
                      {formatCurrency(d.walletBalance)}
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-400">{formatCurrency(d.pendingCommission)}</p>
                  <p className="text-xs text-muted-foreground">pending</p>
                </div>
                <button
                  onClick={() => handleCollect(d.driverId, d.name)}
                  disabled={collecting === d.driverId}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {collecting === d.driverId ? "..." : "Collected ✓"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { token } = useAuth();

  /* ── Main stats — auto-refresh every 30s ── */
  const { data: stats, isLoading: statsLoading } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey(), refetchInterval: 30_000, refetchOnWindowFocus: true },
  });
  const { data: recentRides } = useGetRecentRides({
    query: { queryKey: getGetRecentRidesQueryKey(), refetchInterval: 30_000 },
  });
  const { data: analytics } = useGetDailyAnalytics({
    query: { queryKey: getGetDailyAnalyticsQueryKey(), refetchInterval: 5 * 60_000 },
  });

  /* ── Live real-time counters — auto-refresh every 15s ── */
  const { data: liveStats } = useQuery<{
    onlineDrivers: number;
    activeRides: number;
    todayRides: number;
    searchingRides: number;
    updatedAt: string;
  }>({
    queryKey: ["admin-live-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/live-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  /* ── Surge widget ── */
  const { data: surgeData } = useQuery({
    queryKey: ["admin-surge-widget"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/surge`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.surge as { multiplier: string; isActive: boolean; reason: string | null } | null;
    },
    enabled: !!token,
    refetchInterval: 30_000,
  });
  const surgeActive = surgeData?.isActive ?? false;
  const surgeLabel = surgeActive ? `${Number(surgeData?.multiplier ?? 1).toFixed(2)}x` : "Normal";
  const surgeReason = surgeData?.reason ?? (surgeActive ? "Surge active" : "No surge");

  const chartData = analytics?.slice(-14) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* ── Live Status Bar — auto-refreshes every 15s ── */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="relative shrink-0">
              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-green-400">{liveStats?.onlineDrivers ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Drivers Online</p>
            </div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <Navigation className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-xl font-bold text-blue-400">{liveStats?.activeRides ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Active Rides</p>
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <Radio className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-xl font-bold text-amber-400">{liveStats?.searchingRides ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Searching</p>
            </div>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-xl font-bold text-primary">{liveStats?.todayRides ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Today's Rides</p>
            </div>
          </div>
        </div>
        {liveStats?.updatedAt && (
          <p className="text-xs text-muted-foreground text-right">
            Live data — updated {new Date(liveStats.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">RaftaarRide overview & analytics</p>
        </div>
        {/* Surge Indicator — live from DB */}
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
          surgeActive
            ? "bg-amber-500/10 border-amber-500/30"
            : "bg-green-500/10 border-green-500/30"
        }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${surgeActive ? "bg-amber-500/20" : "bg-green-500/20"}`}>
            <Zap className={`w-4 h-4 ${surgeActive ? "text-amber-400" : "text-green-400"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${surgeActive ? "text-amber-400" : "text-green-400"}`}>
                {surgeLabel}
              </span>
              {surgeActive && (
                <span className="relative flex w-1.5 h-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-amber-400" />
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{surgeReason}</div>
          </div>
        </div>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-2xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Rides"
              value={stats?.totalRides.toLocaleString() ?? "0"}
              icon={MapPin}
              sub={`${stats?.ridesThisMonth ?? 0} this month`}
            />
            <StatCard
              label="Total Users"
              value={stats?.totalUsers.toLocaleString() ?? "0"}
              icon={Users}
              iconColor="text-blue-400"
              iconBg="bg-blue-500/10"
            />
            <StatCard
              label="Total Drivers"
              value={stats?.totalDrivers.toLocaleString() ?? "0"}
              icon={Car}
              sub={`${stats?.activeDrivers ?? 0} active`}
              iconColor="text-green-400"
              iconBg="bg-green-500/10"
            />
            <StatCard
              label="Active Drivers"
              value={stats?.activeDrivers ?? 0}
              icon={TrendingUp}
              iconColor="text-green-400"
              iconBg="bg-green-500/10"
            />
            <StatCard
              label="Completed Rides"
              value={(stats as any)?.completedRides ?? 0}
              icon={MapPin}
              sub={`${(stats as any)?.cancelledRides ?? 0} cancelled`}
              iconColor="text-emerald-400"
              iconBg="bg-emerald-500/10"
            />
            <StatCard
              label="This Month Rides"
              value={stats?.ridesThisMonth ?? 0}
              icon={MapPin}
              iconColor="text-purple-400"
              iconBg="bg-purple-500/10"
            />
            <StatCard
              label="Total Fare Collected"
              value={formatCurrency((stats as any)?.totalFareAll ?? stats?.totalEarnings ?? 0)}
              icon={IndianRupee}
              sub={`${formatCurrency((stats as any)?.totalFareThisMonth ?? stats?.earningsThisMonth ?? 0)} this month`}
              iconColor="text-primary"
              iconBg="bg-primary/10"
            />
            <StatCard
              label="Avg Driver Rating"
              value={`${stats?.avgRating?.toFixed(1) ?? "0.0"} ★`}
              icon={Star}
              iconColor="text-yellow-400"
              iconBg="bg-yellow-500/10"
            />
          </div>
        </>
      )}

      {/* Fast2SMS Balance */}
      <SmsBalanceCard />

      {/* Google Cloud & Maps Cost Monitoring */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Cloud className="w-4 h-4 text-purple-400" />
          Infrastructure Cost Monitor
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MapsStatusCard />
          <CloudCostCard />
        </div>
      </div>

      {/* Pending Cash Commissions */}
      <PendingCommissionsCard />

      {/* Convenience Fee Section */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-emerald-400" />
          Convenience Fee Collected (Admin Revenue)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
            <p className="text-xs font-medium text-emerald-400 uppercase tracking-wide">Aaj Ka</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(stats?.convenienceFeeToday ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Today's convenience fee</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
            <p className="text-xs font-medium text-emerald-400 uppercase tracking-wide">Is Mahine Ka</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(stats?.convenienceFeeThisMonth ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">This month's convenience fee</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
            <p className="text-xs font-medium text-emerald-400 uppercase tracking-wide">Kul Collected</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(stats?.convenienceFeeTotal ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">All-time convenience fee</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Daily Rides (Last 14 Days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="rideGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38,95%,55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(38,95%,55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(240,8%,7%)", border: "1px solid hsl(240,6%,15%)", borderRadius: 8 }}
                labelStyle={{ color: "hsl(0,0%,90%)" }}
                itemStyle={{ color: "hsl(38,95%,55%)" }}
              />
              <Area type="monotone" dataKey="rides" stroke="hsl(38,95%,55%)" strokeWidth={2} fill="url(#rideGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Daily Earnings (Last 14 Days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(240,8%,7%)", border: "1px solid hsl(240,6%,15%)", borderRadius: 8 }}
                labelStyle={{ color: "hsl(0,0%,90%)" }}
                itemStyle={{ color: "hsl(160,60%,45%)" }}
                formatter={(v: number) => [`₹${v.toFixed(0)}`, "Earnings"]}
              />
              <Bar dataKey="earnings" fill="hsl(160,60%,45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-2xl">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Recent Rides</h2>
        </div>
        <div className="divide-y divide-border">
          {(recentRides ?? []).slice(0, 8).map((ride) => (
            <div key={ride.id} className="px-5 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground truncate">{ride.userName}</span>
                  <VehicleBadge type={ride.vehicleType} />
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {ride.pickup} → {ride.destination}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-foreground">{formatCurrency(ride.price)}</div>
                <StatusBadge status={ride.status} />
              </div>
              <div className="text-xs text-muted-foreground shrink-0 hidden lg:block w-20 text-right">
                {formatDate(ride.createdAt)}
              </div>
            </div>
          ))}
          {!recentRides?.length && (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">No rides yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
