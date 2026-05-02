import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/context/AuthContext";

import { API_BASE } from "@/lib/apiBase";

interface LiveRide {
  id: number;
  pickup: string;
  destination: string;
  pickupLat: string | null;
  pickupLng: string | null;
  dropLat: string | null;
  dropLng: string | null;
  status: string;
  vehicleType: string;
  price: string;
  createdAt: string;
  userName: string | null;
  userPhone: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverLat: string | null;
  driverLng: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  searching: "#f59e0b",
  accepted: "#3b82f6",
  ongoing: "#22c55e",
};

const VEHICLE_ICON: Record<string, string> = {
  bike: "🏍️",
  auto: "🛺",
  prime: "🚕",
  suv: "🚙",
};

export function LiveMapPage() {
  const { token } = useAuth();
  const [rides, setRides] = useState<LiveRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LiveRide | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const fetchRides = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/live-rides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRides(data);
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRides();
    const interval = setInterval(fetchRides, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (typeof window === "undefined") return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;

      if (leafletMapRef.current) {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
      } else {
        const indiaCenter: [number, number] = [20.5937, 78.9629];
        leafletMapRef.current = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: true }).setView(indiaCenter, 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
          maxZoom: 18,
        }).addTo(leafletMapRef.current);
      }

      const map = leafletMapRef.current;
      const bounds: [number, number][] = [];

      rides.forEach((ride) => {
        const color = STATUS_COLOR[ride.status] ?? "#6b7280";
        const vehicle = VEHICLE_ICON[ride.vehicleType] ?? "🚗";

        if (ride.pickupLat && ride.pickupLng) {
          const lat = parseFloat(ride.pickupLat);
          const lng = parseFloat(ride.pickupLng);
          bounds.push([lat, lng]);
          const icon = L.divIcon({
            html: `<div style="background:${color};color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${vehicle}</div>`,
            className: "",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          const marker = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(`
              <div style="min-width:180px;font-family:sans-serif">
                <div style="font-weight:bold;margin-bottom:4px">#${ride.id} ${vehicle} ${ride.vehicleType}</div>
                <div style="color:#6b7280;font-size:12px;margin-bottom:6px">
                  <span style="background:${color};color:white;padding:1px 6px;border-radius:10px;font-size:11px">${ride.status}</span>
                </div>
                <div style="font-size:12px"><b>Pickup:</b> ${ride.pickup}</div>
                <div style="font-size:12px"><b>Drop:</b> ${ride.destination}</div>
                <div style="font-size:12px"><b>User:</b> ${ride.userName ?? "-"}</div>
                <div style="font-size:12px"><b>Driver:</b> ${ride.driverName ?? "Searching..."}</div>
                <div style="font-size:12px"><b>Fare:</b> ₹${ride.price}</div>
              </div>
            `);
          marker.on("click", () => setSelected(ride));
          markersRef.current.push(marker);
        }

        if (ride.driverLat && ride.driverLng) {
          const lat = parseFloat(ride.driverLat);
          const lng = parseFloat(ride.driverLng);
          bounds.push([lat, lng]);
          const dIcon = L.divIcon({
            html: `<div style="background:#1e293b;color:white;border-radius:4px;padding:2px 4px;font-size:10px;border:1px solid #3b82f6;white-space:nowrap">🧑‍✈️ ${ride.driverName ?? "Driver"}</div>`,
            className: "",
            iconAnchor: [0, 0],
          });
          const dMarker = L.marker([lat, lng], { icon: dIcon }).addTo(map);
          markersRef.current.push(dMarker);
        }

        if (ride.dropLat && ride.dropLng) {
          const lat = parseFloat(ride.dropLat);
          const lng = parseFloat(ride.dropLng);
          bounds.push([lat, lng]);
          const dIcon = L.divIcon({
            html: `<div style="background:#ef4444;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;border:2px solid white">📍</div>`,
            className: "",
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
          const dMarker = L.marker([lat, lng], { icon: dIcon }).addTo(map);
          markersRef.current.push(dMarker);
        }
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    };

    initMap();
  }, [rides]);

  const statusCounts = {
    searching: rides.filter((r) => r.status === "searching").length,
    accepted: rides.filter((r) => r.status === "accepted").length,
    ongoing: rides.filter((r) => r.status === "ongoing").length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Ride Map</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Active rides real-time dekho • Auto-refresh every 10s
            {lastUpdated && (
              <span className="ml-2 text-xs opacity-60">
                Last: {lastUpdated.toLocaleTimeString("en-IN")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-green-400" />
          </span>
          <span className="text-xs text-green-400 font-medium">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Searching", count: statusCounts.searching, color: "text-amber-400", bg: "bg-amber-500/10", dot: "#f59e0b" },
          { label: "Accepted", count: statusCounts.accepted, color: "text-blue-400", bg: "bg-blue-500/10", dot: "#3b82f6" },
          { label: "Ongoing", count: statusCounts.ongoing, color: "text-green-400", bg: "bg-green-500/10", dot: "#22c55e" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-border flex items-center gap-3`}>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.dot }} />
            <div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-5" style={{ height: 520 }}>
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-background/80 z-10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {rides.length === 0 && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className="text-4xl mb-3">🗺️</div>
              <div className="text-muted-foreground text-sm">Abhi koi active ride nahi hai</div>
            </div>
          )}
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        </div>

        <div className="w-72 flex flex-col gap-3 overflow-y-auto pr-1">
          {selected && (
            <div className="bg-primary/5 border border-primary/30 rounded-xl p-4 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">Ride #{selected.id}</span>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div><b>Pickup:</b> {selected.pickup}</div>
                <div><b>Drop:</b> {selected.destination}</div>
                <div><b>User:</b> {selected.userName} • {selected.userPhone}</div>
                <div><b>Driver:</b> {selected.driverName ?? "Searching..."} {selected.driverPhone ? `• ${selected.driverPhone}` : ""}</div>
                <div><b>Fare:</b> ₹{selected.price}</div>
                <div><b>Vehicle:</b> {VEHICLE_ICON[selected.vehicleType]} {selected.vehicleType}</div>
              </div>
            </div>
          )}
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Active Rides ({rides.length})
          </div>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-muted/20 rounded-xl h-24 animate-pulse" />
              ))
            : rides.length === 0
            ? <div className="text-center text-muted-foreground text-sm py-8">Koi active ride nahi</div>
            : rides.map((r) => {
                const color = STATUS_COLOR[r.status] ?? "#6b7280";
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`w-full text-left bg-card border rounded-xl p-3 hover:border-primary/50 transition-all active:scale-95 ${selected?.id === r.id ? "border-primary" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold text-foreground">#{r.id}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${color}22`, color }}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{r.pickup}</div>
                    <div className="text-xs text-muted-foreground truncate">→ {r.destination}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs">{VEHICLE_ICON[r.vehicleType] ?? "🚗"} {r.userName ?? "-"}</span>
                      <span className="text-xs font-medium text-green-400">₹{r.price}</span>
                    </div>
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}
