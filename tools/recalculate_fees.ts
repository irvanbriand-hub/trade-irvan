/**
 * recalculate_fees.ts
 *
 * Recalculate dan update fee, total_value, total_amount untuk semua trade lama
 * yang tersimpan dengan fee=null atau fee=0.
 *
 * SETUP:
 *   Pastikan file .env di root project berisi:
 *     SUPABASE_URL=https://lrvuysoxaauyfqgcctxi.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * CARA MENJALANKAN:
 *   cd d:/Claude/Trading-Journal
 *   node --experimental-strip-types tools/recalculate_fees.ts
 *   (atau: npx tsx tools/recalculate_fees.ts)
 *
 * RATE FEE:
 *   BUY  : 0.153% → 0.00153
 *   SELL : 0.253% → 0.00253
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

// Fallback: map VITE_ vars ke standard names
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL?.replace("//", "//") ||
  undefined;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL tidak ditemukan. Tambahkan ke .env:");
  console.error("   SUPABASE_URL=https://lrvuysoxaauyfqgcctxi.supabase.co");
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY tidak ditemukan. Tambahkan ke .env:");
  console.error("   SUPABASE_SERVICE_ROLE_KEY=eyJ...");
  console.error("   (Ambil dari Supabase Dashboard → Project Settings → API → service_role)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Fee rates ────────────────────────────────────────────────────────────────
const BUY_RATE = 0.00153;   // 0.153% (0.15% broker + 0.003% levy)
const SELL_RATE = 0.00253;  // 0.253% (0.25% broker + 0.003% levy)

// ─── Fetch trades dengan fee=null atau fee=0 ──────────────────────────────────
console.log("Mengambil trade dengan fee kosong...");
const { data: trades, error } = await supabase
  .from("trades")
  .select("id, ticker, trade_date, trade_type, price, lots, fee")
  .or("fee.is.null,fee.eq.0")
  .order("trade_date", { ascending: true });

if (error) {
  console.error("❌ Gagal fetch trades:", error.message);
  process.exit(1);
}

if (!trades || trades.length === 0) {
  console.log("✅ Tidak ada trade yang perlu diupdate — semua fee sudah terisi.");
  process.exit(0);
}

console.log(`\nDitemukan ${trades.length} trade yang perlu diupdate:\n`);

let successCount = 0;
let failCount = 0;

for (const t of trades) {
  const total_value = Math.round(Number(t.price) * Number(t.lots) * 100);
  const rate = t.trade_type === "BUY" ? BUY_RATE : SELL_RATE;
  const fee = Math.round(total_value * rate);
  const total_amount =
    t.trade_type === "BUY" ? total_value + fee : total_value - fee;

  const { error: updateError } = await supabase
    .from("trades")
    .update({ fee, total_value, total_amount })
    .eq("id", t.id);

  if (updateError) {
    console.error(`  ❌ ${t.trade_date} ${t.ticker} ${t.trade_type}: ${updateError.message}`);
    failCount++;
  } else {
    console.log(
      `  ✅ ${t.trade_date} ${t.ticker} ${t.trade_type.padEnd(4)} ` +
      `${String(t.lots).padStart(4)} lot × ${Number(t.price).toLocaleString("id-ID").padStart(6)} ` +
      `→ fee = ${fee.toLocaleString("id-ID")}`
    );
    successCount++;
  }
}

console.log(`\n────────────────────────────────────────`);
console.log(`Selesai: ${successCount} berhasil, ${failCount} gagal dari ${trades.length} trade`);
