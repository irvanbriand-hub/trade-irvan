/**
 * generate_stamp_duty.ts
 *
 * Generate data materai historis ke tabel stamp_duty berdasarkan semua trade
 * yang ada di database. Dijalankan sekali setelah tabel stamp_duty dibuat.
 *
 * SETUP:
 *   Pastikan file .env di root project berisi:
 *     SUPABASE_URL=https://lrvuysoxaauyfqgcctxi.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * CARA MENJALANKAN:
 *   cd d:/Claude/Trading-Journal
 *   node --experimental-strip-types tools/generate_stamp_duty.ts
 *   (atau: npx tsx tools/generate_stamp_duty.ts)
 *
 * LOGIKA:
 *   - Per tanggal: SUM(price × lots × 100) semua BUY + SELL
 *   - Jika total > 10.000.000 → insert stamp_duty (amount=10000, auto=true)
 *   - Skip tanggal yang sudah ada record di stamp_duty
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

// ─── Load .env files ──────────────────────────────────────────────────────────
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf-8");
  for (const line of raw.split("\n")) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const eqIdx = line.indexOf("=");
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");
loadEnvFile(".env.new");

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  undefined;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL tidak ditemukan di .env");
  process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY tidak ditemukan. Tambahkan ke .env:");
  console.error("   (Ambil dari Supabase Dashboard → Project Settings → API → service_role)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MATERAI_THRESHOLD = 10_000_000;
const MATERAI_AMOUNT = 10_000;

// ─── Fetch semua trades ───────────────────────────────────────────────────────
console.log("Mengambil semua trade dari database...");
const { data: trades, error: tradesErr } = await supabase
  .from("trades")
  .select("user_id, trade_date, price, lots")
  .order("trade_date", { ascending: true });

if (tradesErr || !trades) {
  console.error("❌ Gagal fetch trades:", tradesErr?.message);
  process.exit(1);
}

if (trades.length === 0) {
  console.log("✅ Tidak ada trade ditemukan.");
  process.exit(0);
}

const userId = trades[0].user_id;
console.log(`Total ${trades.length} trade ditemukan untuk user ${userId}\n`);

// ─── Group by date ────────────────────────────────────────────────────────────
const byDate = new Map<string, number>();
for (const t of trades) {
  const gross = Number(t.price) * Number(t.lots) * 100;
  byDate.set(t.trade_date, (byDate.get(t.trade_date) || 0) + gross);
}

// ─── Fetch existing stamp_duty records ───────────────────────────────────────
const { data: existing } = await (supabase as any)
  .from("stamp_duty")
  .select("trade_date")
  .eq("user_id", userId);

const existingDates = new Set<string>((existing || []).map((s: any) => s.trade_date as string));

// ─── Process each date ────────────────────────────────────────────────────────
console.log("Analisis per tanggal:\n");

const eligibleDates: string[] = [];
let inserted = 0;
let skipped = 0;
let belowThreshold = 0;

const sortedDates = [...byDate.keys()].sort();

for (const date of sortedDates) {
  const total = byDate.get(date)!;

  if (total <= MATERAI_THRESHOLD) {
    console.log(`  — ${date}: total ${total.toLocaleString("id-ID")} (di bawah threshold, skip)`);
    belowThreshold++;
    continue;
  }

  eligibleDates.push(date);

  if (existingDates.has(date)) {
    console.log(`  ⏭ ${date}: total ${total.toLocaleString("id-ID")} (sudah ada record, skip)`);
    skipped++;
    continue;
  }

  const { error: insertErr } = await (supabase as any)
    .from("stamp_duty")
    .insert({ user_id: userId, trade_date: date, amount: MATERAI_AMOUNT, auto: true });

  if (insertErr) {
    console.error(`  ❌ ${date}: ${insertErr.message}`);
  } else {
    console.log(`  ✅ ${date}: INSERT materai Rp ${MATERAI_AMOUNT.toLocaleString("id-ID")} (total transaksi: ${total.toLocaleString("id-ID")})`);
    inserted++;
  }
}

console.log(`\n────────────────────────────────────────`);
console.log(`Tanggal kena materai : ${eligibleDates.length} hari`);
console.log(`Baru diinsert        : ${inserted}`);
console.log(`Skip (sudah ada)     : ${skipped}`);
console.log(`Di bawah threshold   : ${belowThreshold} hari`);
console.log(`Total materai baru   : Rp ${(inserted * MATERAI_AMOUNT).toLocaleString("id-ID")}`);
