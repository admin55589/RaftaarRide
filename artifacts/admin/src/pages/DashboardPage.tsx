import { useGetAdminStats, useGetRecentRides, useGetDailyAnalytics } from "@workspace/api-client-react";
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
import { Users, Car, MapPin, IndianRupee, TrendingUp, Star, Zap } from "lucide-react";
import { StatusBadge, VehicleBadge, formatCurrency, formatDate } from "@/components/shared";

function getSurgeInfo() {
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 10) return { multiplier: 1.5, label: "1.5x", reason: "Morning peak hours", isActive: true };
  if (hour >= 18 && hour < 21) return { multiplier: 1.6, label: "1.6x", reason: "Evening peak hours", isActive: true };
  if (hour >= 22 || hour < 5) return { multiplier: 1.2, label: "1.2x", reason: "Late night charges", isActive: true };
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
            label="Total Earnings"
            value={formatCurrency(stats?.totalEarnings ?? 0)}
            icon={IndianRupee}
            sub={`${formatCurrency(stats?.earningsThisMonth ?? 0)} this month`}
            iconColor="text-primary"
            iconBg="bg-primary/10"
          />
          <StatCard
            label="Active Drivers"
            value={stats?.activeDrivers ?? 0}
            icon={TrendingUp}
            iconColor="text-green-400"
            iconBg="bg-green-500/10"
          />
          <StatCard
            label="This Month Rides"
            value={stats?.ridesThisMonth ?? 0}
            icon={MapPin}
            iconColor="text-purple-400"
            iconBg="bg-purple-500/10"
          />
          <StatCard
            label="Monthly Earnings"
            value={formatCurrency(stats?.earningsThisMonth ?? 0)}
            icon={IndianRupee}
          />
          <StatCard
            label="Avg Driver Rating"
            value={`${stats?.avgRating?.toFixed(1) ?? "0.0"} ★`}
            icon={Star}
            iconColor="text-yellow-400"
            iconBg="bg-yellow-500/10"
          />
        </div>
      )}

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
