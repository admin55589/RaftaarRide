import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Car,
  MapPin,
  LogOut,
  FileCheck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Users", href: "/users", icon: Users },
  { label: "Drivers", href: "/drivers", icon: Car },
  { label: "Rides", href: "/rides", icon: MapPin },
  { label: "KYC Verification", href: "/kyc", icon: FileCheck },
  { label: "Withdrawals", href: "/withdrawals", icon: Wallet },
];

interface SidebarProps {
  isLive?: boolean;
}

export function Sidebar({ isLive = false }: SidebarProps) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <aside className="w-64 shrink-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar sticky top-0">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <img
          src="/admin/app-logo.jpg"
          alt="RaftaarRide"
          className="w-8 h-8 rounded-lg object-cover"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground tracking-wide">RaftaarRide</div>
          <div className="text-xs text-muted-foreground">Admin Panel</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full transition-colors",
              isLive ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
            )}
          />
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", isLive ? "text-green-500" : "text-muted-foreground/60")}>
            {isLive ? "Live" : "Off"}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 border-t border-sidebar-border pt-4">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
            AD
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">Admin</div>
            <div className="text-xs text-muted-foreground">admin@raftaarride.com</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
