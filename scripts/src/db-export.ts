import { db } from "@workspace/db";
import {
  usersTable,
  driversTable,
  ridesTable,
  promoCodesTable,
  driverKycTable,
  scheduledRidesTable,
  walletTransactionsTable,
  withdrawalRequestsTable,
  planTransactionsTable,
  chatMessagesTable,
  disputesTable,
  surgeSettingsTable,
} from "@workspace/db";

async function exportAll() {
  console.log("-- RaftaarRide Database Export");
  console.log("-- Generated:", new Date().toISOString());
  console.log("-- Usage: psql $NEW_DATABASE_URL < export.sql");
  console.log();

  const tables: { name: string; rows: unknown[] }[] = [];

  tables.push({ name: "users", rows: await db.select().from(usersTable) });
  tables.push({ name: "drivers", rows: await db.select().from(driversTable) });
  tables.push({ name: "rides", rows: await db.select().from(ridesTable) });
  tables.push({ name: "promo_codes", rows: await db.select().from(promoCodesTable) });
  tables.push({ name: "driver_kyc", rows: await db.select().from(driverKycTable) });
  tables.push({ name: "scheduled_rides", rows: await db.select().from(scheduledRidesTable) });
  tables.push({ name: "wallet_transactions", rows: await db.select().from(walletTransactionsTable) });
  tables.push({ name: "withdrawal_requests", rows: await db.select().from(withdrawalRequestsTable) });
  tables.push({ name: "plan_transactions", rows: await db.select().from(planTransactionsTable) });
  tables.push({ name: "chat_messages", rows: await db.select().from(chatMessagesTable) });
  tables.push({ name: "disputes", rows: await db.select().from(disputesTable) });
  tables.push({ name: "surge_settings", rows: await db.select().from(surgeSettingsTable) });

  for (const { name, rows } of tables) {
    if (rows.length === 0) {
      console.log(`-- Table '${name}': empty, skipping`);
      continue;
    }
    console.log(`-- Table '${name}': ${rows.length} rows`);
    const cols = Object.keys(rows[0] as object);
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const values = cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        if (v instanceof Date) return `'${v.toISOString()}'`;
        if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      console.log(
        `INSERT INTO ${name} (${cols.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    console.log();
  }

  console.log("-- Export complete");
  process.exit(0);
}

exportAll().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
