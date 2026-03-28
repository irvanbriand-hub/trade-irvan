/**
 * import_supabase.ts
 *
 * Import data dari backup JSON ke Supabase project baru.
 * Sumber: trading-app-backup-2026-03-29.json
 *
 * SETUP SEBELUM MENJALANKAN:
 *   Buat file .env.new di root project dengan isi:
 *
 *     SUPABASE_URL=https://<project-baru>.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *     NEW_USER_ID=<uuid-user-kamu-di-project-baru>
 *
 *   NEW_USER_ID: cek di Supabase Dashboard → Authentication → Users
 *                setelah register akun pertama kali di project baru.
 *
 * CARA MENJALANKAN:
 *   bun run tools/import_supabase.ts
 *
 * OUTPUT:
 *   - Progress per tabel di terminal
 *   - errors.log di root project (jika ada error per row)
 *   - Summary akhir di terminal
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// =============================================================================
// Config & Constants
// =============================================================================

const ROOT = process.cwd();
const BACKUP_FILE = join(ROOT, "trading-app-backup-2026-03-29.json");
const ENV_NEW_FILE = join(ROOT, ".env.new");
const ERROR_LOG = join(ROOT, "errors.log");
const BATCH_SIZE = 200; // rows per upsert call

// User_id lama dari backup
const OLD_USER_ID = "12d5b042-2f27-4827-9ce5-ffc9b7134694";

// Tabel yang di-skip (kosong atau cache yang akan auto-regenerate)
const SKIP_TABLES = new Set([
  "watchlist",
  "ara_watchlist",
  "custom_formulas",
  "backtest_sessions",
  "ai_insights",
]);

// Tabel tanpa user_id — import as-is, tidak perlu replace user_id
const TABLES_WITHOUT_USER_ID = new Set([
  "ara_events",
  "ara_pre_pattern",
  "ara_watchlist",
  "ara_watchlist_scores",
  "swing_analysis_cache",
]);

// Kolom generated di tabel trades — JANGAN diinsert
const GENERATED_COLUMNS_TRADES = new Set(["total_value", "fee", "total_amount"]);

// Urutan import yang respek foreign key
const IMPORT_ORDER = [
  // Round 1: parent tables
  "trading_categories",
  // Round 2: FK ke trading_categories
  "trades",
  "watchlist_rekomendasi",
  // Round 3: ARA parent
  "ara_events",
  // Round 4: FK ke ara_events
  "ara_pre_pattern",
  // Round 5: semua sisanya (tidak ada FK inter-dependency)
  "modal_transactions",
  "wr_scanner",
  "sk_monitoring",
  "swing_monitoring",
  "swing_analysis_cache",
  "bandarmology_data",
  "accum_watch_history",
  "ara_watchlist_scores",
  "ak_broker_data",
  "ak_broker_scores",
  "broker_profiles",
];

// =============================================================================
// .env.new parser — Bun hanya auto-load .env, bukan .env.new
// =============================================================================

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    console.error(`\nERROR: File ${filePath} tidak ditemukan.`);
    console.error(`
Buat file .env.new di root project dengan isi:

  SUPABASE_URL=https://<project-baru>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  NEW_USER_ID=<uuid-user-baru>

NEW_USER_ID: cek di Supabase Dashboard → Authentication → Users
`);
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    // Handle quoted and unquoted values
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }

  return env;
}

// =============================================================================
// Type helpers
// =============================================================================

type Row = Record<string, unknown>;

interface TableResult {
  table: string;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  status: "OK" | "SKIP" | "EMPTY" | "ERROR";
}

// =============================================================================
// Row transform: replace user_id + strip generated columns
// =============================================================================

function transformRow(table: string, row: Row, newUserId: string): Row {
  const out: Row = { ...row };

  // Replace user_id lama → baru (hanya untuk tabel yang punya user_id)
  if (!TABLES_WITHOUT_USER_ID.has(table) && "user_id" in out) {
    if (out.user_id === OLD_USER_ID) {
      out.user_id = newUserId;
    }
  }

  // Strip generated columns dari trades
  if (table === "trades") {
    for (const col of GENERATED_COLUMNS_TRADES) {
      delete out[col];
    }
  }

  return out;
}

// =============================================================================
// Batch upsert helper — upsert BATCH_SIZE rows sekaligus, fallback row-by-row
// =============================================================================

async function upsertBatch(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: Row[],
  errorLines: string[]
): Promise<{ success: number; failed: number }> {
  // Coba upsert seluruh batch dulu
  const { error } = await supabase
    .from(table)
    .upsert(rows as object[], { onConflict: "id", ignoreDuplicates: false });

  if (!error) {
    return { success: rows.length, failed: 0 };
  }

  // Batch gagal — fallback ke row-by-row untuk isolasi error
  let success = 0;
  let failed = 0;

  for (const row of rows) {
    const { error: rowErr } = await supabase
      .from(table)
      .upsert(row as object, { onConflict: "id", ignoreDuplicates: false });

    if (rowErr) {
      failed++;
      const id = (row.id as string) ?? "unknown";
      const msg = `[${table}] id=${id} | ${rowErr.message}`;
      errorLines.push(msg);
    } else {
      success++;
    }
  }

  return { success, failed };
}

// =============================================================================
// Import satu tabel
// =============================================================================

async function importTable(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rawRows: Row[],
  newUserId: string,
  errorLines: string[]
): Promise<TableResult> {
  if (rawRows.length === 0) {
    return { table, total: 0, success: 0, failed: 0, skipped: 0, status: "EMPTY" };
  }

  // Transform semua rows
  const rows = rawRows.map((r) => transformRow(table, r, newUserId));
  const total = rows.length;
  let success = 0;
  let failed = 0;

  // Split ke batch
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    process.stdout.write(
      `\r  ${table.padEnd(30)}  batch ${batchNum}/${totalBatches} ...`
    );

    const result = await upsertBatch(supabase, table, batch, errorLines);
    success += result.success;
    failed += result.failed;
  }

  return { table, total, success, failed, skipped: 0, status: failed === 0 ? "OK" : "ERROR" };
}

// =============================================================================
// Formatting helpers
// =============================================================================

function fmt(n: number): string {
  return n.toLocaleString("id-ID");
}

function pad(s: string, len: number): string {
  return s.padEnd(len);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // ─── Load .env.new ────────────────────────────────────────────────────────
  const env = loadEnvFile(ENV_NEW_FILE);

  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const NEW_USER_ID = env.NEW_USER_ID;

  if (!SUPABASE_URL) {
    console.error("ERROR: SUPABASE_URL tidak ada di .env.new");
    process.exit(1);
  }
  if (!SERVICE_ROLE_KEY) {
    console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.new");
    process.exit(1);
  }
  if (!NEW_USER_ID) {
    console.error("ERROR: NEW_USER_ID tidak ada di .env.new");
    process.exit(1);
  }

  // Validasi format UUID sederhana
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(NEW_USER_ID)) {
    console.error(`ERROR: NEW_USER_ID bukan UUID yang valid: "${NEW_USER_ID}"`);
    process.exit(1);
  }

  // ─── Load backup JSON ─────────────────────────────────────────────────────
  if (!existsSync(BACKUP_FILE)) {
    console.error(`ERROR: File backup tidak ditemukan: ${BACKUP_FILE}`);
    process.exit(1);
  }

  const backup = JSON.parse(readFileSync(BACKUP_FILE, "utf-8")) as {
    exported_at: string;
    app_version: string;
    user_id: string;
    tables: Record<string, Row[]>;
  };

  // ─── Init Supabase client (service role — bypass RLS) ────────────────────
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ─── Header ───────────────────────────────────────────────────────────────
  console.log("=".repeat(62));
  console.log("  Supabase Import Tool");
  console.log(`  Target : ${SUPABASE_URL}`);
  console.log(`  Backup : ${backup.exported_at}`);
  console.log(`  Old UID: ${OLD_USER_ID}`);
  console.log(`  New UID: ${NEW_USER_ID}`);
  console.log("=".repeat(62));

  const errorLines: string[] = [];
  const results: TableResult[] = [];

  // ─── Import setiap tabel sesuai urutan ────────────────────────────────────
  for (const table of IMPORT_ORDER) {
    // Skip tabel yang tidak perlu diimport
    if (SKIP_TABLES.has(table)) {
      console.log(`  ${pad(table, 30)}  SKIP (dikecualikan)`);
      results.push({ table, total: 0, success: 0, failed: 0, skipped: 0, status: "SKIP" });
      continue;
    }

    const rawRows = backup.tables[table] as Row[] | undefined;

    if (!rawRows) {
      console.log(`  ${pad(table, 30)}  SKIP (tidak ada di backup)`);
      results.push({ table, total: 0, success: 0, failed: 0, skipped: 0, status: "SKIP" });
      continue;
    }

    const result = await importTable(supabase, table, rawRows, NEW_USER_ID, errorLines);

    // Clear progress line, print final status
    const statusIcon = result.status === "OK" ? "✓" : result.status === "EMPTY" ? "-" : "✗";
    const rowInfo =
      result.total === 0
        ? "(kosong)"
        : result.failed === 0
        ? `${fmt(result.success)} rows`
        : `${fmt(result.success)} OK, ${fmt(result.failed)} GAGAL`;

    process.stdout.write(
      `\r  ${statusIcon}  ${pad(table, 30)}  ${rowInfo.padStart(20)}\n`
    );

    results.push(result);
  }

  // ─── Tulis errors.log ────────────────────────────────────────────────────
  if (errorLines.length > 0) {
    const logContent = [
      `Import errors — ${new Date().toISOString()}`,
      `Old user_id: ${OLD_USER_ID}`,
      `New user_id: ${NEW_USER_ID}`,
      "",
      ...errorLines,
    ].join("\n");
    writeFileSync(ERROR_LOG, logContent, "utf-8");
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log();
  console.log("=".repeat(62));
  console.log("  SUMMARY");
  console.log("=".repeat(62));

  const ok = results.filter((r) => r.status === "OK");
  const empty = results.filter((r) => r.status === "EMPTY");
  const skipped = results.filter((r) => r.status === "SKIP");
  const withErrors = results.filter((r) => r.status === "ERROR");

  const totalRows = results.reduce((s, r) => s + r.total, 0);
  const totalSuccess = results.reduce((s, r) => s + r.success, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);

  if (ok.length > 0) {
    console.log("\n  Berhasil:");
    for (const r of ok) {
      console.log(`    ✓  ${pad(r.table, 30)} ${fmt(r.success).padStart(8)} rows`);
    }
  }

  if (withErrors.length > 0) {
    console.log("\n  Ada error (partial import):");
    for (const r of withErrors) {
      console.log(
        `    ✗  ${pad(r.table, 30)} ${fmt(r.success).padStart(8)} OK  |  ${fmt(r.failed)} GAGAL`
      );
    }
  }

  if (empty.length > 0) {
    console.log("\n  Kosong (tidak ada data di backup):");
    for (const r of empty) console.log(`    -  ${r.table}`);
  }

  if (skipped.length > 0) {
    console.log("\n  Di-skip:");
    for (const r of skipped) console.log(`    ○  ${r.table}`);
  }

  console.log();
  console.log(`  Total rows diproses : ${fmt(totalRows)}`);
  console.log(`  Berhasil diimport   : ${fmt(totalSuccess)}`);
  console.log(`  Gagal               : ${fmt(totalFailed)}`);
  console.log(`  Tabel OK            : ${ok.length}`);
  console.log(`  Tabel dengan error  : ${withErrors.length}`);

  if (totalFailed > 0) {
    console.log(`\n  Detail error tersimpan di: ${ERROR_LOG}`);
  }

  console.log("=".repeat(62));

  if (totalFailed > 0) {
    console.log("\n  SELESAI (dengan error). Cek errors.log untuk detail.\n");
    process.exit(1);
  } else {
    console.log("\n  SELESAI. Semua data berhasil diimport.\n");
  }
}

main().catch((err) => {
  console.error("\nUnhandled error:", err);
  process.exit(1);
});
