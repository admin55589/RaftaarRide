import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

export interface ReceiptData {
  rideId: number | null;
  dateTime: Date;
  pickup: string;
  destination: string;
  distanceKm: number;
  durationMin: number;
  vehicleType: string;
  paymentMethod: string;
  baseFare: number;
  platformFee: number;
  distanceCharge: number;
  waitingCharge: number;
  promoDiscount: number;
  promoCode: string;
  totalPaid: number;
  driverName: string;
  driverVehicle: string;
  driverVehicleNumber: string;
  driverRating: number;
}

function vehicleLabel(v: string) {
  if (v === "bike") return "Bike";
  if (v === "auto") return "Auto Rickshaw";
  if (v === "suv") return "SUV";
  return "Prime Cab";
}

function paymentLabel(p: string) {
  if (p === "RaftaarWallet") return "RaftaarRide Wallet";
  if (p === "Cash") return "Cash";
  return p;
}

function buildReceiptHtml(d: ReceiptData): string {
  const rideIdStr = d.rideId ? `RR-${String(d.rideId).padStart(8, "0")}` : `RR-${Date.now().toString().slice(-8)}`;
  const dateStr = d.dateTime.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = d.dateTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const rows: [string, string, string?][] = [
    ["Base Fare", `₹${d.baseFare.toFixed(2)}`],
    ...(d.distanceCharge > 0 ? [["Distance Charge", `₹${d.distanceCharge.toFixed(2)}`] as [string, string]] : []),
    ...(d.waitingCharge > 0 ? [["Waiting Charge", `₹${d.waitingCharge.toFixed(2)}`] as [string, string]] : []),
    ["Platform Fee", `₹${d.platformFee.toFixed(2)}`],
    ...(d.promoDiscount > 0 ? [[`Promo (${d.promoCode})`, `-₹${d.promoDiscount.toFixed(2)}`, "discount"] as [string, string, string]] : []),
  ];

  const fareRows = rows.map(([label, value, type]) => `
    <tr>
      <td class="fare-label">${label}</td>
      <td class="fare-value ${type === "discount" ? "discount" : ""}">${value}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #ffffff;
    color: #111;
    padding: 40px 40px 60px;
    max-width: 600px;
    margin: 0 auto;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 24px;
    border-bottom: 2px solid #f0f0f0;
    margin-bottom: 28px;
  }
  .logo-wrap { display: flex; align-items: center; gap: 12px; }
  .logo-icon {
    width: 48px; height: 48px; border-radius: 12px;
    background: linear-gradient(135deg, #F5A623, #e8920f);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; color: #fff; font-weight: 900;
    letter-spacing: -1px; line-height: 1;
    text-align: center; padding-top: 4px;
  }
  .logo-text { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
  .logo-sub  { font-size: 11px; color: #888; font-weight: 500; margin-top: 1px; }
  .receipt-badge {
    text-align: right;
  }
  .receipt-badge .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .receipt-badge .id    { font-size: 15px; font-weight: 700; color: #111; margin-top: 2px; }
  .receipt-badge .date  { font-size: 12px; color: #666; margin-top: 2px; }

  /* ── Status banner ── */
  .status-banner {
    background: linear-gradient(135deg, #0a1a0f, #0d2218);
    border-radius: 16px;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .status-left .status-label { font-size: 12px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; }
  .status-left .status-amount { font-size: 36px; font-weight: 800; color: #fff; margin-top: 4px; letter-spacing: -1px; }
  .status-left .status-method { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 4px; }
  .status-check {
    width: 48px; height: 48px; border-radius: 50%;
    background: #22c55e;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; color: #fff;
  }

  /* ── Section title ── */
  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin-bottom: 12px;
    margin-top: 24px;
  }

  /* ── Route box ── */
  .route-box {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 14px;
    padding: 16px 18px;
  }
  .route-row { display: flex; align-items: flex-start; gap: 12px; }
  .route-dot  { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
  .route-dot.pickup  { background: #F5A623; box-shadow: 0 0 6px rgba(245,166,35,0.6); }
  .route-dot.drop    { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.6); }
  .route-line {
    width: 1.5px; height: 22px;
    background: repeating-linear-gradient(to bottom, #ccc 0, #ccc 4px, transparent 4px, transparent 8px);
    margin-left: 4px; margin: 6px 0 6px 4px;
  }
  .route-label  { font-size: 10px; color: #aaa; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; }
  .route-addr   { font-size: 13px; color: #222; font-weight: 500; margin-top: 2px; line-height: 1.4; }

  /* ── Ride details ── */
  .details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
  }
  .detail-cell {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 12px;
    padding: 12px 14px;
  }
  .detail-cell .dl { font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.8px; }
  .detail-cell .dv { font-size: 14px; font-weight: 700; color: #111; margin-top: 4px; }

  /* ── Fare table ── */
  .fare-table { width: 100%; border-collapse: collapse; }
  .fare-table tr { border-bottom: 1px solid #f0f0f0; }
  .fare-table tr:last-child { border-bottom: none; }
  .fare-label { padding: 10px 0; font-size: 13px; color: #555; }
  .fare-value { padding: 10px 0; font-size: 13px; font-weight: 600; color: #111; text-align: right; }
  .fare-value.discount { color: #22c55e; }
  .fare-total-row { border-top: 2px solid #F5A623 !important; }
  .fare-total-row td { padding-top: 14px !important; }
  .fare-total-label { font-size: 15px; font-weight: 700; color: #111; }
  .fare-total-value { font-size: 20px; font-weight: 800; color: #F5A623; text-align: right; }

  /* ── Driver card ── */
  .driver-card {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .driver-avatar {
    width: 46px; height: 46px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(245,166,35,0.15), rgba(245,166,35,0.05));
    border: 2px solid rgba(245,166,35,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 800; color: #F5A623;
    flex-shrink: 0;
  }
  .driver-info { flex: 1; }
  .driver-info .dn  { font-size: 15px; font-weight: 700; color: #111; }
  .driver-info .dvh { font-size: 12px; color: #777; margin-top: 3px; }
  .driver-rating {
    background: rgba(245,166,35,0.1);
    border: 1px solid rgba(245,166,35,0.3);
    border-radius: 20px;
    padding: 4px 10px;
    font-size: 12px; font-weight: 700; color: #F5A623;
    white-space: nowrap;
  }

  /* ── Footer ── */
  .footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #f0f0f0;
    text-align: center;
    color: #bbb;
    font-size: 11px;
    line-height: 1.7;
  }
  .footer strong { color: #F5A623; }
  .footer .helpline { margin-top: 8px; font-size: 10px; }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="logo-wrap">
      <div class="logo-icon">RR</div>
      <div>
        <div class="logo-text">RaftaarRide</div>
        <div class="logo-sub">Premium Ride Services</div>
      </div>
    </div>
    <div class="receipt-badge">
      <div class="label">Tax Invoice</div>
      <div class="id">${rideIdStr}</div>
      <div class="date">${dateStr} · ${timeStr}</div>
    </div>
  </div>

  <!-- Amount banner -->
  <div class="status-banner">
    <div class="status-left">
      <div class="status-label">Total Paid</div>
      <div class="status-amount">₹${d.totalPaid.toFixed(2)}</div>
      <div class="status-method">via ${paymentLabel(d.paymentMethod)}</div>
    </div>
    <div class="status-check">✓</div>
  </div>

  <!-- Route -->
  <div class="section-title">Route</div>
  <div class="route-box">
    <div class="route-row">
      <div class="route-dot pickup"></div>
      <div>
        <div class="route-label">Pickup</div>
        <div class="route-addr">${d.pickup}</div>
      </div>
    </div>
    <div class="route-line"></div>
    <div class="route-row">
      <div class="route-dot drop"></div>
      <div>
        <div class="route-label">Drop</div>
        <div class="route-addr">${d.destination}</div>
      </div>
    </div>
  </div>

  <!-- Ride details -->
  <div class="section-title">Ride Details</div>
  <div class="details-grid">
    <div class="detail-cell">
      <div class="dl">Distance</div>
      <div class="dv">${d.distanceKm.toFixed(1)} km</div>
    </div>
    <div class="detail-cell">
      <div class="dl">Duration</div>
      <div class="dv">${d.durationMin} min</div>
    </div>
    <div class="detail-cell">
      <div class="dl">Vehicle</div>
      <div class="dv">${vehicleLabel(d.vehicleType)}</div>
    </div>
  </div>

  <!-- Fare breakdown -->
  <div class="section-title">Fare Breakdown</div>
  <table class="fare-table">
    ${fareRows}
    <tr class="fare-total-row">
      <td class="fare-total-label">Total Paid</td>
      <td class="fare-total-value">₹${d.totalPaid.toFixed(2)}</td>
    </tr>
  </table>

  <!-- Driver -->
  ${d.driverName ? `
  <div class="section-title">Driver</div>
  <div class="driver-card">
    <div class="driver-avatar">${d.driverName.substring(0, 2).toUpperCase()}</div>
    <div class="driver-info">
      <div class="dn">${d.driverName}</div>
      <div class="dvh">${d.driverVehicle} · ${d.driverVehicleNumber}</div>
    </div>
    ${d.driverRating > 0 ? `<div class="driver-rating">⭐ ${d.driverRating.toFixed(1)}</div>` : ""}
  </div>` : ""}

  <!-- Footer -->
  <div class="footer">
    <strong>RaftaarRide</strong> · Certified Ride Aggregator · GSTIN: 07AAACR1234A1ZX<br/>
    This is a computer-generated receipt and does not require a signature.<br/>
    For support: support@raftaarride.com · <strong>1800-XXX-XXXX</strong> (Toll Free)
    <div class="helpline">Receipt ID: ${rideIdStr} · Generated on ${dateStr} at ${timeStr}</div>
  </div>

</body>
</html>`;
}

export async function downloadReceipt(data: ReceiptData): Promise<void> {
  try {
    const html = buildReceiptHtml(data);

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert(
        "Receipt Ready",
        `Receipt PDF saved at:\n${uri}\n\nAapke device ke file manager mein dekho.`,
        [{ text: "OK" }]
      );
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "RaftaarRide Receipt",
      UTI: "com.adobe.pdf",
    });
  } catch (err) {
    Alert.alert(
      "Receipt Error",
      "Receipt generate nahi ho saka. Dobara try karein.",
      [{ text: "OK" }]
    );
  }
}
