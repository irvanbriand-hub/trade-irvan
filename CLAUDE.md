# Trading Journal — Project Context for Claude Code

## 1. Deskripsi Project

**Trading Journal** adalah web app manajemen trading saham Indonesia (IDX) yang dibangun sebagai full-stack SPA. App ini mencakup:
- Jurnal trading harian dengan kalkulasi posisi LIFO
- Screener teknikal dengan formula custom
- Analisis bandarmologi / smart money broker
- Monitoring pola ARA (Auto Rejection Atas)
- Backtest parameter historis
- AI insight berbasis Gemini
- Laporan keuangan & equity tracking

**Target user:** Trader saham Indonesia yang butuh satu platform terpadu untuk research, tracking, dan evaluasi strategi.

---

## 2. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 18.3, TypeScript 5.8, Vite 5.4 |
| Routing | React Router DOM 6.30 |
| State | TanStack React Query 5.83 |
| Forms | React Hook Form 7.61 + Zod 3.25 |
| Styling | Tailwind CSS 3.4 + ShadCN UI (Radix UI) |
| Charts | Lightweight Charts 5.1 (TradingView), Recharts 3.8 |
| Icons | Lucide React 0.462 |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Edge Functions | Deno (TypeScript) — di-deploy ke Supabase |
| External Data | Yahoo Finance API (via Edge Functions) |
| AI | Google Gemini API (via Edge Function `gemini-insight`) |
| Testing | Vitest 3.2 + Testing Library |
| Deploy | Vercel (frontend) + Supabase (backend) |

---

## 3. Struktur Folder Penting

```
src/
├── main.tsx                        # Entry point
├── App.tsx                         # Router & protected routes
├── pages/                          # Satu file per halaman/route
├── components/
│   ├── ara/                        # ARA Hunter components
│   ├── bandarmology/               # Bandarmology / AK Tracker
│   ├── jendral/                    # Jendral Hunter
│   ├── journal/                    # Trade form & history
│   ├── research/                   # Research Screener
│   └── ui/                         # ShadCN UI primitives (JANGAN diubah manual)
├── hooks/                          # Custom React hooks (semua data fetching ada di sini)
├── lib/
│   ├── backtestEngine.ts           # Core backtest logic — KRITIS
│   ├── backtestTiming.ts           # Timing WIB/market hours
│   ├── bandarmologyParser.ts       # Parser data bandarmologi
│   ├── formulaEvaluator.ts         # Evaluasi formula custom
│   ├── formulaParser.ts            # Tokenizer + validator formula
│   ├── paramCalculator.ts          # Kalkulasi parameter screener
│   ├── positionCalculator.ts       # LIFO position tracking — KRITIS
│   ├── screenerStore.ts            # Singleton store hasil scan (in-memory)
│   └── utils.ts                    # Utilities umum
├── data/
│   ├── idxTickers.ts               # Master list semua ticker IDX
│   └── mockStocks.ts               # Mock data (dev only)
└── integrations/supabase/
    ├── client.ts                   # Supabase client init
    └── types.ts                    # Auto-generated DB types (JANGAN edit manual)

supabase/
├── functions/                      # 13 Edge Functions (Deno)
│   ├── yahoo-finance/
│   ├── yahoo-finance-ohlcv/
│   ├── yahoo-finance-history/
│   ├── yahoo-finance-backtest/
│   ├── yahoo-finance-fundamental/
│   ├── yahoo-finance-financial-report/
│   ├── yahoo-finance-screener/
│   ├── yahoo-finance-sk-screener/
│   ├── yahoo-finance-sk-analysis/
│   ├── yahoo-finance-swing-screener/
│   ├── yahoo-finance-swing-analysis/
│   ├── yahoo-finance-jendral/
│   └── gemini-insight/
└── migrations/                     # 28 SQL migrations (urutan penting!)
```

---

## 4. Semua Tabel Supabase

Semua tabel menggunakan RLS (Row Level Security). Setiap tabel punya kolom `user_id` yang terikat ke `auth.users`, kecuali tabel ARA yang bersifat global.

### `trades`
Jurnal transaksi inti.
```
id, user_id, ticker, trade_date, trade_type (BUY|SELL),
price, lots, total_amount, total_value, fee,
notes, category_id → trading_categories, created_at
```

### `trading_categories`
Kategori strategi trading user.
```
id, user_id, name, created_at
```

### `watchlist`
Watchlist sederhana ticker.
```
id, user_id, ticker, created_at
```

### `watchlist_rekomendasi`
Watchlist rekomendasi dengan konteks entry.
```
id, user_id, ticker, category_id → trading_categories,
entry_date, notes, created_at
```

### `wr_scanner`
Hasil scan + tracking backtest WR Scanner.
```
id, user_id, ticker, screener_names (JSON), tanggal_import,
tanggal_backtest, status (OPEN|WIN|LOSE), close_import,
high_price, pct_open_to_high, result, wl_kategori, notes,
param_1..param_8 (boolean flags), param_count, created_at
```

### `bandarmology_data`
Data bandarmologi harian (diimport manual).
```
id, user_id, tanggal_data, input_time, ticker,
rank_score, composite_pct, streak, streak_direction, is_new_entry,
kode_broker, pattern, market_cap, top1_pct, top1_broker,
value, daily_pct, weekly_pct, liquidity,
is_topl, is_top20, is_topv, data_tier, tier,
muncul_di_topl, muncul_di_topv, muncul_di_top,
source_count, created_at
```

### `ak_broker_data`
Raw data broker untuk AK Tracker.
```
id, user_id, tanggal, ticker, broker_code,
buy_value, buy_lot, buy_avg,
sell_value, sell_lot, sell_avg,
net_value, created_at
```
Unique constraint: `(user_id, broker_code, tanggal, ticker)`

### `ak_broker_scores`
Skor kalkulasi smart money per broker.
```
id, user_id, tanggal, ticker, broker_code,
score_total, tag, tag_vs_saham, tag_vs_ak,
streak_beli, streak_jual, is_reversal_buy, is_reversal_sell,
cumulative_net_5d, cumulative_net_10d, cumulative_net_20d,
avg_buy_rolling, buy_vs_avg_ratio, pct_of_market,
total_value_saham, value_source, created_at
```
Unique constraint: `(user_id, broker_code, tanggal, ticker)`

### `broker_profiles`
Konfigurasi profil broker yang dipantau.
```
id, user_id, broker_code, broker_name, color, is_active, created_at
```

### `modal_transactions`
Riwayat top up / withdraw modal.
```
id, user_id, tanggal, tipe (TOP_UP|WITHDRAW), jumlah, notes, created_at
```

### `accum_watch_history`
Watchlist saham dalam fase akumulasi.
```
id, user_id, ticker, tanggal_pertama_accum, tier_saat_masuk,
tanggal_masuk_superketat, hari_tunggu,
composite_saat_confirm, streak_saat_confirm,
status (WATCHING|CONFIRMED|EXPIRED), created_at
```

### `ara_events`
Event ARA (Auto Rejection Atas) — data global, bukan per user.
```
id, ticker, tanggal_ara,
harga_open, harga_high, harga_low, harga_close,
volume, value, pct_change, fraksi_harga, batas_ara, created_at
```

### `ara_pre_pattern`
Data price action H-7 sampai H-1 sebelum ARA.
```
id, ara_event_id → ara_events, ticker, tanggal_ara, hari,
open, high, low, close, volume, value, pct_change,
candle_color, gap_type,
close_vs_sma5, close_vs_sma20, close_vs_sma50,
bb_position, volume_spike, volume_vs_ma5, volume_vs_ma20,
rsi, rsi_zone,
macd_line, macd_signal, macd_histogram, macd_status, created_at
```

### `ara_watchlist`
Status dan skor ticker yang dipantau untuk pola ARA.
```
id, ticker, is_active, last_score, last_score_date,
pct_ara_terakhir, tanggal_ara_terakhir, total_ara_count,
created_at, updated_at
```

### `ara_watchlist_scores`
Skor harian per indikator untuk ticker ARA.
```
id, ticker, tanggal_score,
score_d1, score_d2, score_d3, score_d4, score_d5, score_d6, score_d7,
score_total,
d1_*..d7_* (kolom indikator per hari), created_at
```

### `custom_formulas`
Formula screener custom buatan user.
```
id, user_id, nama, deskripsi, formula, last_used, created_at
```

### `backtest_sessions`
Sesi hasil backtest formula.
```
id, user_id, nama, formula, formula_id → custom_formulas,
metode (JSON), threshold_bsjp, threshold_swing,
periode_historis, parameter_dipilih (JSON),
hasil_summary (JSON), notes, tanggal_run, created_at
```

### `sk_monitoring`
Monitoring masuk posisi Superketat.
```
id, user_id, ticker, tanggal_masuk, status,
close_day0, vv0_saat_masuk, vv1_saat_masuk, vm60_saat_masuk,
tma20, jalur_masuk, vok_tipe, ii_score, is_confluence,
macd_kondisi, stoch_kondisi, adx_kondisi, created_at
```

### `swing_monitoring`
Monitoring masuk posisi Swing.
```
id, user_id, ticker, screener_name, tanggal_masuk, status,
close_day0, tma20, ii_score,
macd_kondisi, stoch_kondisi, adx_kondisi, vok_tipe,
entry_day_rekomendasi, avg_pct_day_rekom, win_pct_day_rekom,
parameter_khusus (JSON), entry_notes, created_at
```

### `swing_analysis_cache`
Cache hasil analisis historis Swing (tidak perlu dihitung ulang tiap kali).
```
id, ticker, screener_name, tanggal_cache, total_events,
entry_day_rekom, action_score,
best_day (JSON), alt_day (JSON),
avg_pct_per_day (JSON), win_pct_per_day (JSON),
gap_up_rate (JSON), ranking (JSON), created_at
```

### `ai_insights`
Cache AI insight per ticker per hari (24 jam TTL).
```
id, user_id, ticker, tanggal, insight_data (JSON), rating, confidence, created_at
```
Unique constraint: `(user_id, ticker, tanggal)`

---

## 5. Fitur-Fitur Utama

### Trading Journal (`/journal`)
- Input trade BUY/SELL dengan kategori
- Kalkulasi posisi LIFO otomatis (`lib/positionCalculator.ts`)
- Unrealized/realized P&L per posisi

### Portfolio (`/portfolio`)
- Agregasi semua posisi terbuka
- Harga real-time via `useYahooFinance` (auto-refresh 30s)
- Kalkulasi equity total

### Modal & Equity (`/modal-equity`)
- Tracking top up / withdraw modal
- Grafik equity curve
- Return % vs modal bersih

### WR Scanner (`/wr-scanner`)
- Import ticker hasil screener harian
- Backtest otomatis: track harga H+1 sampai H+N
- 8 parameter boolean untuk evaluasi kualitas sinyal
- Kalender visual hasil scan per tanggal

### Analisa Historis (`/analisa-historis`)
- Korelasi antar parameter screener
- Win rate per kombinasi parameter
- Statistik agregat multi-periode

### Bandarmology (`/bandarmology`)
- Import data bandarmologi harian
- AK Tracker: tracking net buy/sell per broker per saham
- Smart Money Ranking: scoring broker berdasarkan akumulasi
- Streak detection, reversal detection

### Accum Watch (`/accum-watch`)
- Watchlist saham dalam fase akumulasi tier S/A/B
- Auto-sync dari data bandarmologi terbaru
- Status tracking: WATCHING → CONFIRMED → EXPIRED

### ARA Hunter (`/ara-hunter`)
- Live scanner ARA hari ini
- Historical scanner pola pre-ARA
- Pattern analysis: indikator teknikal H-7 s/d H-1
- Scoring sistem untuk prediksi potensi ARA

### Screener (`/screener`)
- Superketat Screener: filter teknikal ketat
- Swing Screener: filter teknikal untuk swing trade
- Hasil scan disimpan in-memory di `lib/screenerStore.ts`

### Research Screener (`/research-screener`)
- Formula editor custom dengan sintaks khusus
- Backtest formula terhadap data historis
- Session management untuk simpan hasil

### SK Monitoring & Swing Monitoring
- Catat saham yang masuk kriteria Superketat/Swing
- Tracking performa entry

### Jendral Hunter (`/jendral-hunter`)
- Deteksi pola "Jendral" (akumulasi besar broker tertentu)
- Historical panel per ticker

### Dashboard (`/`)
- Market overview IHSG
- Posisi aktif ringkasan
- Trading calendar

### Laporan Keuangan (`/laporan-keuangan`)
- Laporan P&L per periode
- Breakdown per kategori/ticker

### AI Insight
- Analisis saham via Gemini AI (11 seksi)
- Cache 24 jam per ticker/user/tanggal
- Dipanggil dari komponen `AiInsightRow`

---

## 6. Environment Variables

### Frontend — file `.env.local` di root project (dibaca Vite otomatis)
```env
VITE_SUPABASE_URL=https://lrvuysoxaauyfqgcctxi.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon public key — BUKAN service_role>
VITE_SUPABASE_PROJECT_ID=lrvuysoxaauyfqgcctxi
```
Diakses di kode via `import.meta.env.VITE_*`.
Template tersedia di `.env.example`.

### Edge Functions — set di Supabase Dashboard → Project Settings → Edge Functions
```env
GEMINI_API_KEY=<Google Gemini API key dari aistudio.google.com>
# SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY → auto-provided
```

---

## 7. Infrastruktur & Deployment

### URLs Production
- **GitHub Repo:** https://github.com/irvanbriand-hub/trade-irvan.git
- **Frontend (Vercel):** *(isi setelah deploy pertama)*
- **Supabase Project:** https://supabase.com/dashboard/project/lrvuysoxaauyfqgcctxi
- **Supabase URL:** https://lrvuysoxaauyfqgcctxi.supabase.co

---

### Local Development

**Prerequisites:** Node.js 18+, Supabase CLI (`npm install -g supabase`)

```bash
npm install
cp .env.example .env.local
# Edit .env.local — isi VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
npm run dev
# → http://localhost:8080
```

---

### Deploy ke Vercel

**Cara deploy pertama kali:**
1. Push repo ke GitHub
2. Buka vercel.com → New Project → Import repo
3. Framework Preset: **Vite** (auto-detected)
4. Build Command: `npm run build` (sudah benar)
5. Output Directory: `dist` (sudah benar)
6. Set Environment Variables (lihat daftar di bawah)
7. Deploy

**Auto-deploy setelah itu:** setiap `git push` ke branch `main` otomatis trigger deploy.

**Environment Variables yang wajib diset di Vercel Dashboard:**

| Variable | Keterangan | Cara dapat |
|----------|-----------|-----------|
| `VITE_SUPABASE_URL` | URL project Supabase | Supabase Dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/public key Supabase | Supabase Dashboard → Project Settings → API → anon (public) |
| `VITE_SUPABASE_PROJECT_ID` | ID project (`lrvuysoxaauyfqgcctxi`) | Bagian dari URL Supabase |

> **Tidak perlu** `SUPABASE_SERVICE_ROLE_KEY` di Vercel — itu hanya untuk script import data lokal.

---

### Deploy / Update Edge Functions

```bash
# Install Supabase CLI (sekali saja)
npm install -g supabase

# Login
supabase login

# Link ke project baru
supabase link --project-ref lrvuysoxaauyfqgcctxi

# Deploy semua 13 Edge Functions sekaligus
supabase functions deploy

# Deploy satu function saja (contoh)
supabase functions deploy gemini-insight
```

**Set secrets Edge Functions** (wajib untuk `gemini-insight`):
```bash
supabase secrets set GEMINI_API_KEY=AIza...
```
Atau via Supabase Dashboard → Edge Functions → Manage secrets.

> **GEMINI_API_KEY** didapat dari https://aistudio.google.com (gratis tier tersedia).

---

### Database

```bash
# Jalankan migration ke project baru (jika fresh setup)
supabase db push

# Generate ulang TypeScript types setelah schema berubah
supabase gen types typescript --project-id lrvuysoxaauyfqgcctxi \
  > src/integrations/supabase/types.ts
```

---

### Testing
```bash
npm run test
```

---

## 8. Hal-Hal Penting — JANGAN Diubah Tanpa Konfirmasi

### Logika Bisnis Kritis
- **`lib/positionCalculator.ts`** — algoritma LIFO untuk kalkulasi posisi. Perubahan bisa mengacaukan seluruh kalkulasi portfolio dan P&L.
- **`lib/backtestEngine.ts`** — core engine backtest. Perubahan metodologi akan membuat hasil historis tidak konsisten.
- **`lib/formulaParser.ts` + `lib/formulaEvaluator.ts`** — parser formula custom. Perubahan syntax bisa merusak formula yang sudah disimpan user.

### Database
- **`src/integrations/supabase/types.ts`** — file ini di-generate otomatis (`supabase gen types`). Jangan edit manual; selalu regenerate setelah schema berubah.
- **Urutan migrations** di `supabase/migrations/` — jangan diubah atau dihapus. Tambah migration baru jika perlu mengubah schema.
- **RLS policies** — semua tabel punya RLS. Jangan disable RLS atau ubah policy tanpa audit keamanan.
- **Unique constraints** pada `ak_broker_data` dan `ak_broker_scores` — dipakai untuk UPSERT logic. Jika diubah, semua import data AK Tracker akan rusak.

### UI & Komponen
- **`components/ui/`** — ShadCN UI components. Jangan edit manual; update via `npx shadcn-ui@latest add <component>`.
- **`data/idxTickers.ts`** — master list ticker IDX. Update hanya saat ada perubahan resmi dari BEI.

### Edge Functions
- **`gemini-insight`** — bergantung pada `GEMINI_API_KEY` (Google AI Studio). Set di Supabase Dashboard → Edge Functions env vars. Endpoint: Google Generative Language API OpenAI-compatible.
- **Semua `yahoo-finance-*` functions** — bergantung pada struktur response Yahoo Finance v8 API yang tidak resmi dan bisa berubah sewaktu-waktu.

### Arsitektur
- **`lib/screenerStore.ts`** — singleton in-memory store. Data scan tidak dipersist ke Supabase, hanya di-memory. Ini disengaja untuk performa; jangan pindahkan ke Supabase tanpa diskusi.
- **React Query** dipakai sebagai satu-satunya cache layer untuk semua data Supabase. Jangan bypass dengan state lokal untuk data server.
- **Semua data fetching ada di `hooks/`** — jangan panggil Supabase langsung dari komponen; selalu lewat hook.
