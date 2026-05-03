import { useGetAdminStats, useGetRecentRides, useGetDailyAnalytics } from "@workspace/api-client-react";
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
import { Users, Car, MapPin, IndianRupee, TrendingUp, Star, Zap, Wallet, MessageSquare, AlertTriangle, RefreshCw } from "lucide-react";
import { StatusBadge, VehicleBadge, formatCurrency, formatDate } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/lib/apiBase";

function getSurgeInfo() {
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 10) return { multiplier: 1.2, label: "1.2x", reason: "Morning peak hours", isActive: true };
  if (hour >= 18 && hour < 21) return { multiplier: 1.2, label: "1.2x", reason: "Evening peak hours", isActive: true };
  if (hour >= 22 || hour < 5) return { multiplier: 1.1, label: "1.1x", reason: "Late night charges", isActive: true };
  return { multiplier: 1.0, label: "Normal", reason: "No surge", isActive: false };
}

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
  const { data, isLoading, refetch, isFetching } = useQuery<{ credits: number | null; error?: string }>({
    queryKey: ["sms-balance"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/sms-balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 2 * 60 * 1000,
  });

  const credits: number | null = data == null ? null : (data.credits ?? null);
  const hasCredits = credits !== null && !Number.isNaN(credits);
  const isLow = hasCredits && credits! < 50;
  const isCritical = hasCredits && credits! < 10;

  return (
    <div className={`rounded-2xl border p-5 flex items-center gap-4 ${
      isCritical ? "bg-red-500/10 border-red-500/40" :
      isLow     ? "bg-amber-500/10 border-amber-500/40" :
                  "bg-blue-500/10 border-blue-500/20"
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        isCritical ? "bg-red-500/20" : isLow ? "bg-amber-500/20" : "bg-blue-500/20"
      }`}>
        {isCritical || isLow
          ? <AlertTriangle className={`w-5 h-5 ${isCritical ? "text-red-400" : "text-amber-400"}`} />
          : <MessageSquare className="w-5 h-5 text-blue-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">2Factor SMS Credits</p>
        {isLoading ? (
          <p className="text-lg font-bold text-muted-foreground mt-0.5">Loading...</p>
        ) : !hasCredits ? (
          <p className="text-sm text-muted-foreground mt-0.5">{data?.error ?? "Credits fetch nahi hua"}</p>
        ) : (
          <>
            <p className={`text-2xl font-bold mt-0.5 ${isCritical ? "text-red-400" : isLow ? "text-amber-400" : "text-blue-400"}`}>
              {credits!} SMS
            </p>
            {isCritical && <p className="text-xs text-red-400 mt-0.5 font-medium">⚠️ Critical! Recharge karo — OTP fail ho sakta hai</p>}
            {isLow && !isCritical && <p className="text-xs text-amber-400 mt-0.5 font-medium">⚠️ Low credits — jald recharge karo</p>}
            {!isLow && <p className="text-xs text-muted-foreground mt-0.5">SMS credits sufficient hain</p>}
          </>
        )}
      </div>
      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
        title="Refresh credits"
      >
        <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: recentRides } = useGetRecentRides();
  const { data: analytics } = useGetDailyAnalytics();
  const surge = getSurgeInfo();

  const chartData = analytics?.slice(-14) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">RaftaarRide overview & analytics</p>
        </div>
        {/* Surge Indicator */}
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
          surge.isActive
            ? "bg-amber-500/10 border-amber-500/30"
            : "bg-green-500/10 border-green-500/30"
        }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${surge.isActive ? "bg-amber-500/20" : "bg-green-500/20"}`}>
            <Zap className={`w-4 h-4 ${surge.isActive ? "text-amber-400" : "text-green-400"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${surge.isActive ? "text-amber-400" : "text-green-400"}`}>
                {surge.label}
              </span>
              {surge.isActive && (
                <span className="relative flex w-1.5 h-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-amber-400" />
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{surge.reason}</div>
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
