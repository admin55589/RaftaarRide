export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-500/15 text-green-400 border-green-500/20",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/20",
    in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    assigned: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    active: "bg-green-500/15 text-green-400 border-green-500/20",
    inactive: "bg-muted text-muted-foreground border-border",
    online: "bg-green-500/15 text-green-400 border-green-500/20",
    offline: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${colors[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function VehicleBadge({ type }: { type: string }) {
  const config: Record<string, { color: string; label: string }> = {
    bike: { color: "text-yellow-400", label: "Bike" },
    auto: { color: "text-green-400", label: "Auto" },
    cab: { color: "text-blue-400", label: "Cab" },
  };
  const c = config[type] ?? { color: "text-muted-foreground", label: type };
  return <span className={`text-xs font-medium ${c.color}`}>{c.label}</span>;
}

export function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
