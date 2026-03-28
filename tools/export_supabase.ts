/**
 * export_supabase.ts
 *
 * Export semua tabel dari Supabase ke file JSON terpisah di folder /exports/.
 *
 * REQUIREMENT:
 *   Tambahkan SUPABASE_SERVICE_ROLE_KEY ke file .env sebelum menjalankan.
 *   Anon key TIDAK cukup karena semua tabel menggunakan RLS.
 *   Service Role Key bisa didapat dari:
 *   Supabase Dashboard → Project Settings → API → service_role (secret)
 *
 * CARA MENJALANKAN:
 *   bun run tools/export_supabase.ts
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAGE_SIZE = 1000; // Supabase max rows per request
const EXPORTS_DIR = join(process.cwd(), "exports");

// Daftar semua tabel yang akan di-export.
// Tabel ARA tidak punya user_id, tapi tetap diexport.
const TABLES = [
  // User tables (butuh service role key untuk bypass RLS)
  "trades",
  "trading_categories",
  "watchlist",
  "watchlist_rekomendasi",
  "wr_scanner",
  "bandarmology_data",
  "ak_broker_data",
  "ak_broker_scores",
  "broker_profiles",
  "modal_transactions",
  "accum_watch_history",
  "custom_formulas",
  "backtest_sessions",
  "sk_monitoring",
  "swing_monitoring",
  "ai_insights",
  // Global tables (tidak ada user_id)
  "ara_events",
  "ara_pre_pattern",
  "ara_watchlist",
  "ara_watchlist_scores",
  "swing_analysis_cache",
] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

if (!SUPABASE_URL) {
  console.error("ERROR: VITE_SUPABASE_URL tidak ditemukan di .env");
  process.exit(1);
}

if (!SERVICE_ROLE_KEY) {
  console.error(`
ERROR: SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env

Tambahkan baris berikut ke file .env:
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

Dapatkan key-nya dari:
  Supabase Dashboard → Project Settings → API → service_role (secret)

JANGAN commit service role key ke git!
`);
  process.exit(1);
}

// ─── Supabase Client (Service Role — bypass RLS) ──────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureExportsDir() {
  if (!existsSync(EXPORTS_DIR)) {
    mkdirSync(EXPORTS_DIR, { recursive: true });
    console.log(`Folder exports/ dibuat di: ${EXPORTS_DIR}`);
  }
}

/** Fetch semua baris dari satu tabel dengan pagination otomatis. */
async function fetchAllRows(tableName: string): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { rows: [], error: error.message };
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      rows.push(...(data as Record<string, unknown>[]));
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    }
  }

  return { rows, error: null };
}

function writeJson(tableName: string, rows: Record<string, unknown>[]) {
  const filePath = join(EXPORTS_DIR, `${tableName}.json`);
  writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf-8");
  return filePath;
}

function formatCount(n: number): string {
  return n.toLocaleString("id-ID");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Supabase Export Tool");
  console.log(`  Project: ${SUPABASE_URL}`);
  console.log(`  Tabel  : ${TABLES.length} tabel`);
  console.log("=".repeat(60));
  console.log();

  ensureExportsDir();

  type Result = {
    table: string;
    rows: number;
    file: string;
    status: "OK" | "ERROR" | "SKIP";
    error?: string;
  };

  const results: Result[] = [];
  let totalRows = 0;
  let errorCount = 0;

  for (const table of TABLES) {
    process.stdout.write(`  Exporting ${table.padEnd(30)} ... `);

    const { rows, error } = await fetchAllRows(table);

    if (error) {
      console.log(`GAGAL`);
      results.push({ table, rows: 0, file: "", status: "ERROR", error });
      errorCount++;
      continue;
    }

    if (rows.length === 0) {
      console.log(`SKIP (kosong)`);
      results.push({ table, rows: 0, file: "", status: "SKIP" });
      continue;
    }

    const filePath = writeJson(table, rows);
    totalRows += rows.length;
    console.log(`${formatCount(rows.length).padStart(8)} rows`);
    results.push({ table, rows: rows.length, file: filePath, status: "OK" });
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log();
  console.log("=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));

  const okResults = results.filter((r) => r.status === "OK");
  const skipResults = results.filter((r) => r.status === "SKIP");
  const errorResults = results.filter((r) => r.status === "ERROR");

  if (okResults.length > 0) {
    console.log("\n  Berhasil:");
    for (const r of okResults) {
      console.log(`    ✓  ${r.table.padEnd(30)} ${formatCount(r.rows).padStart(8)} rows`);
    }
  }

  if (skipResults.length > 0) {
    console.log("\n  Dilewati (tabel kosong):");
    for (const r of skipResults) {
      console.log(`    -  ${r.table}`);
    }
  }

  if (errorResults.length > 0) {
    console.log("\n  Gagal:");
    for (const r of errorResults) {
      console.log(`    ✗  ${r.table.padEnd(30)} → ${r.error}`);
    }
  }

  console.log();
  console.log(`  Total rows  : ${formatCount(totalRows)}`);
  console.log(`  File disimpan di: ${EXPORTS_DIR}`);
  console.log(`  Tabel OK    : ${okResults.length}`);
  console.log(`  Tabel skip  : ${skipResults.length}`);
  console.log(`  Tabel error : ${errorCount}`);
  console.log("=".repeat(60));

  if (errorCount > 0) {
    console.log("\n  PERHATIAN: Beberapa tabel gagal di-export.");
    console.log(
      "  Pastikan SUPABASE_SERVICE_ROLE_KEY sudah benar dan tabel ada di project."
    );
    process.exit(1);
  }

  console.log("\n  Export selesai.\n");
}

main().catch((err) => {
  console.error("\nUnhandled error:", err);
  process.exit(1);
});
