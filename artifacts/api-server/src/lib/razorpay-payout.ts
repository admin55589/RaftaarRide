import { logger } from "./logger";

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const RAZORPAYX_ACCOUNT = process.env.RAZORPAYX_ACCOUNT_NUMBER ?? "";

const RZP_API = "https://api.razorpay.com/v1";
const AUTH = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  parsedAccount?: ParsedAccount;
}

export interface ParsedAccount {
  type: "vpa" | "bank_account" | "wallet";
  vpa?: string;
  accountNumber?: string;
  ifsc?: string;
  walletPhone?: string;
  mode: "UPI" | "IMPS" | "NEFT";
}

export function validateAccountDetails(method: string, accountDetails: string): ValidationResult {
  const detail = accountDetails.trim();

  if (!detail || detail.length < 3) {
    return { valid: false, reason: "Account details empty ya bahut chote hain" };
  }

  // Known valid UPI handles in India
  const KNOWN_UPI_HANDLES = new Set([
    "upi", "okhdfcbank", "okaxis", "okicici", "oksbi",
    "ybl", "ibl", "axl", "apl", "rapl",
    "paytm", "freecharge",
    "waicici", "wahdfcbank",
    "kkbk", "rbl", "yesbankltd",
    "ubi", "pnb", "cnrb", "barodampay", "mahb",
    "unionbank", "centralbank", "idbi", "sbi",
    "hdfc", "icici", "axis",
    "airtel", "airtelpaymentsbank",
    "juspay", "indus", "induslnd",
    "kotak", "abfspay", "abhibank",
    "mybank", "idfcbank", "ikwik",
    "pingpay", "razor", "hsbc",
    "sc", "citi", "dbs", "rblbank",
    "equitas", "dcb", "federal", "kvb",
    "lvb", "nsdl", "tjsb", "vijb",
    "allbank", "andb", "boi", "bob",
    "corporation", "dena", "indian",
    "obc", "orientalbank", "psb", "syndicatebank",
    "ucoin", "ucobank", "united",
  ]);

  if (method === "upi") {
    const upiRegex = /^[\w.\-+]{2,256}@[a-zA-Z0-9]{2,64}$/;
    if (!upiRegex.test(detail)) {
      return { valid: false, reason: `UPI ID format galat hai: "${detail}" — example: 9876543210@upi ya name@okaxis` };
    }
    const handle = detail.split("@")[1]?.toLowerCase();
    if (!handle || !KNOWN_UPI_HANDLES.has(handle)) {
      return {
        valid: false,
        reason: `UPI handle "@${handle}" valid nahi hai ya India mein support nahi karta. Sahi handle use karein jaise @upi, @okaxis, @ybl, @paytm, @okhdfcbank`,
      };
    }
    return { valid: true, parsedAccount: { type: "vpa", vpa: detail.toLowerCase(), mode: "UPI" } };
  }

  if (method === "phonepe" || method === "paytm") {
    const phoneRegex = /^[6-9]\d{9}$/;
    const upiRegex = /^[\w.\-+]{2,256}@[a-zA-Z0-9]{2,64}$/;

    if (phoneRegex.test(detail)) {
      const handle = method === "phonepe" ? "ybl" : "paytm";
      const vpa = `${detail}@${handle}`;
      return { valid: true, parsedAccount: { type: "vpa", vpa, mode: "UPI" } };
    }
    if (upiRegex.test(detail)) {
      const handle = detail.split("@")[1]?.toLowerCase();
      if (!handle || !KNOWN_UPI_HANDLES.has(handle)) {
        return {
          valid: false,
          reason: `UPI handle "@${handle}" valid nahi hai. ${method === "phonepe" ? "PhonePe" : "Paytm"} ke liye sirf 10-digit number ya valid UPI ID dein`,
        };
      }
      return { valid: true, parsedAccount: { type: "vpa", vpa: detail.toLowerCase(), mode: "UPI" } };
    }
    return {
      valid: false,
      reason: `${method === "phonepe" ? "PhonePe" : "Paytm"} ke liye valid 10-digit mobile number ya UPI ID dein`,
    };
  }

  if (method === "bank") {
    // Bank format: "AccountNumber|IFSC" OR "AccountNumber IFSC"
    const parts = detail.includes("|")
      ? detail.split("|").map((p) => p.trim())
      : detail.split(/\s+/);

    if (parts.length < 2) {
      return {
        valid: false,
        reason: `Bank details format: "AccountNumber|IFSC" — example: "1234567890|HDFC0001234"`,
      };
    }

    const [accountNumber, ifsc] = parts;

    if (!accountNumber || accountNumber.length < 8 || accountNumber.length > 20 || !/^\d+$/.test(accountNumber)) {
      return { valid: false, reason: `Bank account number galat hai: "${accountNumber}" — 8-20 digits hone chahiye` };
    }

    // IFSC: 4 alpha + 0 + 6 alphanumeric
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
    if (!ifsc || !ifscRegex.test(ifsc)) {
      return { valid: false, reason: `IFSC code galat hai: "${ifsc}" — example: HDFC0001234` };
    }

    return {
      valid: true,
      parsedAccount: {
        type: "bank_account",
        accountNumber,
        ifsc: ifsc.toUpperCase(),
        mode: "IMPS",
      },
    };
  }

  return { valid: false, reason: `Unknown payment method: ${method}` };
}

// ─── Razorpay X Payout ───────────────────────────────────────────────────────

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  status?: string;
  utr?: string;
  error?: string;
  razorpayEnabled: boolean;
}

async function rzpPost<T>(path: string, body: object): Promise<{ ok: boolean; data: T; error?: string }> {
  try {
    const res = await fetch(`${RZP_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${AUTH}`,
        "Content-Type": "application/json",
        "X-Payout-Idempotency": `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T;
    if (!res.ok) {
      const err = (data as any)?.error?.description ?? (data as any)?.message ?? "Razorpay API error";
      return { ok: false, data, error: err };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, data: {} as T, error: e?.message ?? "Network error" };
  }
}

export async function createRazorpayPayout(opts: {
  driverId: number;
  driverName: string;
  amount: number; // in INR
  withdrawalId: number;
  parsedAccount: ParsedAccount;
}): Promise<PayoutResult> {
  if (!KEY_ID || !KEY_SECRET) {
    return { success: false, error: "Razorpay keys not configured", razorpayEnabled: false };
  }
  if (!RAZORPAYX_ACCOUNT) {
    return { success: false, error: "RazorpayX account number not set (RAZORPAYX_ACCOUNT_NUMBER env var missing)", razorpayEnabled: false };
  }

  const { driverId, driverName, amount, withdrawalId, parsedAccount } = opts;

  // 1. Create Contact
  const contactRes = await rzpPost<{ id: string; entity: string }>("/contacts", {
    name: driverName,
    type: "employee",
    reference_id: `driver_${driverId}`,
    contact: `driver_${driverId}@raftaarride`,
  });

  if (!contactRes.ok || !contactRes.data.id) {
    logger.warn({ err: contactRes.error }, "Razorpay contact creation failed");
    return { success: false, error: `Contact creation failed: ${contactRes.error}`, razorpayEnabled: true };
  }
  const contactId = contactRes.data.id;

  // 2. Create Fund Account
  let fundAccountBody: object;
  if (parsedAccount.type === "vpa") {
    fundAccountBody = {
      contact_id: contactId,
      account_type: "vpa",
      vpa: { address: parsedAccount.vpa },
    };
  } else {
    fundAccountBody = {
      contact_id: contactId,
      account_type: "bank_account",
      bank_account: {
        name: driverName,
        ifsc: parsedAccount.ifsc,
        account_number: parsedAccount.accountNumber,
      },
    };
  }

  const faRes = await rzpPost<{ id: string }>("/fund_accounts", fundAccountBody);
  if (!faRes.ok || !faRes.data.id) {
    logger.warn({ err: faRes.error }, "Razorpay fund account creation failed");
    return { success: false, error: `Fund account creation failed: ${faRes.error}`, razorpayEnabled: true };
  }
  const fundAccountId = faRes.data.id;

  // 3. Create Payout
  const payoutBody = {
    account_number: RAZORPAYX_ACCOUNT,
    fund_account_id: fundAccountId,
    amount: Math.round(amount * 100), // convert to paise
    currency: "INR",
    mode: parsedAccount.mode,
    purpose: "payout",
    queue_if_low_balance: false,
    reference_id: `wr_${withdrawalId}_${Date.now()}`,
    narration: `RaftaarRide Driver Withdrawal #${withdrawalId}`,
  };

  const payoutRes = await rzpPost<{ id: string; status: string; utr?: string }>("/payouts", payoutBody);
  if (!payoutRes.ok || !payoutRes.data.id) {
    logger.warn({ err: payoutRes.error }, "Razorpay payout creation failed");
    return { success: false, error: `Payout failed: ${payoutRes.error}`, razorpayEnabled: true };
  }

  return {
    success: true,
    payoutId: payoutRes.data.id,
    status: payoutRes.data.status,
    utr: payoutRes.data.utr,
    razorpayEnabled: true,
  };
}
