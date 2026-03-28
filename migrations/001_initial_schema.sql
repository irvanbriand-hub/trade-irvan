-- =============================================================================
-- Trading Journal — Initial Schema
-- migrations/001_initial_schema.sql
--
-- Consolidated dari 24 migration files Supabase Lovable (20260308 → 20260327).
-- Sumber: supabase/migrations/ + analisa backup trading-app-backup-2026-03-29.json
--
-- CARA PAKAI:
--   Paste & jalankan seluruh file ini di Supabase SQL Editor (project baru).
--   Jalankan SEKALI pada project kosong. Jangan dijalankan ulang.
--
-- PENTING — GENERATED COLUMNS di tabel `trades`:
--   total_value, fee, total_amount adalah GENERATED ALWAYS AS (computed).
--   Saat import data dari backup, JANGAN include kolom-kolom ini dalam INSERT.
--   Nilainya akan dihitung otomatis oleh database.
--
-- URUTAN CREATE TABLE (respek foreign key):
--   1.  trading_categories       (parent dari trades, watchlist_rekomendasi)
--   2.  trades                   (→ trading_categories)
--   3.  watchlist
--   4.  watchlist_rekomendasi    (→ trading_categories)
--   5.  modal_transactions
--   6.  wr_scanner
--   7.  sk_monitoring
--   8.  swing_monitoring
--   9.  swing_analysis_cache
--   10. bandarmology_data
--   11. accum_watch_history
--   12. ai_insights
--   13. custom_formulas          (parent dari backtest_sessions)
--   14. backtest_sessions        (→ custom_formulas)
--   15. ara_events               (parent dari ara_pre_pattern)
--   16. ara_pre_pattern          (→ ara_events)
--   17. ara_watchlist
--   18. ara_watchlist_scores
--   19. ak_broker_data
--   20. ak_broker_scores
--   21. broker_profiles
-- =============================================================================


-- =============================================================================
-- 1. trading_categories
-- =============================================================================
CREATE TABLE public.trading_categories (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trading_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own categories"
  ON public.trading_categories FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own categories"
  ON public.trading_categories FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own categories"
  ON public.trading_categories FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own categories"
  ON public.trading_categories FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_trading_categories_user ON public.trading_categories(user_id);


-- =============================================================================
-- 2. trades
--
-- PENTING: total_value, fee, total_amount adalah GENERATED ALWAYS AS (computed).
-- Saat import dari backup JSON, SKIP kolom-kolom ini — nilainya auto-calculated.
-- Formula:
--   total_value  = price * lots * 100
--   fee (BUY)    = price * lots * 100 * 0.0015
--   fee (SELL)   = price * lots * 100 * 0.0025
--   total_amount (BUY)  = price * lots * 100 * 1.0015
--   total_amount (SELL) = price * lots * 100 * 0.9975
-- =============================================================================
CREATE TABLE public.trades (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  ticker       TEXT        NOT NULL,
  trade_type   TEXT        NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
  price        NUMERIC     NOT NULL,
  lots         INTEGER     NOT NULL,
  category_id  UUID        REFERENCES public.trading_categories(id) ON DELETE SET NULL,
  notes        TEXT,
  -- Computed columns — DO NOT INSERT these from backup
  total_value  NUMERIC     GENERATED ALWAYS AS (price * lots * 100) STORED,
  fee          NUMERIC     GENERATED ALWAYS AS (
                             CASE
                               WHEN trade_type = 'BUY'  THEN price * lots * 100 * 0.0015
                               WHEN trade_type = 'SELL' THEN price * lots * 100 * 0.0025
                               ELSE 0
                             END
                           ) STORED,
  total_amount NUMERIC     GENERATED ALWAYS AS (
                             CASE
                               WHEN trade_type = 'BUY'  THEN price * lots * 100 * 1.0015
                               WHEN trade_type = 'SELL' THEN price * lots * 100 * 0.9975
                               ELSE 0
                             END
                           ) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trades"
  ON public.trades FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own trades"
  ON public.trades FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own trades"
  ON public.trades FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own trades"
  ON public.trades FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_trades_user_date ON public.trades(user_id, trade_date DESC);
CREATE INDEX idx_trades_user_ticker ON public.trades(user_id, ticker);


-- =============================================================================
-- 3. watchlist
--
-- CATATAN: Unique constraint hanya pada (user_id, ticker) — satu user
-- tidak bisa duplikat ticker, tapi antar user boleh sama.
-- =============================================================================
CREATE TABLE public.watchlist (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist"
  ON public.watchlist FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own watchlist"
  ON public.watchlist FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own watchlist"
  ON public.watchlist FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 4. watchlist_rekomendasi
-- =============================================================================
CREATE TABLE public.watchlist_rekomendasi (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker      TEXT        NOT NULL,
  category_id UUID        REFERENCES public.trading_categories(id) ON DELETE SET NULL,
  entry_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.watchlist_rekomendasi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wl_rekomendasi"
  ON public.watchlist_rekomendasi FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own wl_rekomendasi"
  ON public.watchlist_rekomendasi FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own wl_rekomendasi"
  ON public.watchlist_rekomendasi FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own wl_rekomendasi"
  ON public.watchlist_rekomendasi FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 5. modal_transactions
-- =============================================================================
CREATE TABLE public.modal_transactions (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tanggal    DATE        NOT NULL DEFAULT CURRENT_DATE,
  tipe       TEXT        NOT NULL CHECK (tipe IN ('TOP_UP', 'WITHDRAW')),
  jumlah     NUMERIC     NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.modal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own modal_transactions"
  ON public.modal_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own modal_transactions"
  ON public.modal_transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own modal_transactions"
  ON public.modal_transactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_modal_transactions_user ON public.modal_transactions(user_id, tanggal);


-- =============================================================================
-- 6. wr_scanner
--
-- screener_names: JSONB array of text, e.g. ["BB Mid Bounce", "MA50 Support"]
-- param_*: boolean flags, nama kolom spesifik (bukan param_1..8)
--   param_pr, param_v_ma20, param_ma_plus, param_l_pl,
--   param_h_ph, param_ol_hc, param_c_vwap, param_v_ma5
-- =============================================================================
CREATE TABLE public.wr_scanner (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker           TEXT        NOT NULL,
  screener_names   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tanggal_import   DATE        NOT NULL DEFAULT CURRENT_DATE,
  tanggal_backtest DATE,
  status           TEXT        NOT NULL DEFAULT 'OPEN',
  close_import     NUMERIC,
  high_price       NUMERIC,
  pct_open_to_high NUMERIC,
  result           TEXT,
  wl_kategori      TEXT,
  notes            TEXT,
  -- 8 parameter boolean flags
  param_pr         BOOLEAN,
  param_v_ma20     BOOLEAN,
  param_ma_plus    BOOLEAN,
  param_l_pl       BOOLEAN,
  param_h_ph       BOOLEAN,
  param_ol_hc      BOOLEAN,
  param_c_vwap     BOOLEAN,
  param_v_ma5      BOOLEAN,
  param_count      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wr_scanner ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wr_scanner"
  ON public.wr_scanner FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own wr_scanner"
  ON public.wr_scanner FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own wr_scanner"
  ON public.wr_scanner FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own wr_scanner"
  ON public.wr_scanner FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_wr_scanner_user_import ON public.wr_scanner(user_id, tanggal_import DESC);


-- =============================================================================
-- 7. sk_monitoring
-- =============================================================================
CREATE TABLE public.sk_monitoring (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker           TEXT        NOT NULL,
  tanggal_masuk    DATE        NOT NULL DEFAULT CURRENT_DATE,
  close_day0       NUMERIC     NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'MONITORING',
  -- Added in migration 20260314
  jalur_masuk      TEXT        DEFAULT '',
  ii_score         NUMERIC     DEFAULT 0,
  tma20            NUMERIC     DEFAULT 0,
  vok_tipe         TEXT        DEFAULT '',
  macd_kondisi     TEXT        DEFAULT '',
  stoch_kondisi    TEXT        DEFAULT '',
  adx_kondisi      TEXT        DEFAULT '',
  -- Added in migration 20260315
  is_confluence    BOOLEAN     DEFAULT false,
  vv0_saat_masuk   NUMERIC,
  vv1_saat_masuk   NUMERIC,
  vm60_saat_masuk  NUMERIC,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sk_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sk_monitoring"
  ON public.sk_monitoring FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sk_monitoring"
  ON public.sk_monitoring FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sk_monitoring"
  ON public.sk_monitoring FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own sk_monitoring"
  ON public.sk_monitoring FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 8. swing_monitoring
-- =============================================================================
CREATE TABLE public.swing_monitoring (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker                TEXT        NOT NULL,
  screener_name         TEXT        NOT NULL,
  tanggal_masuk         DATE        NOT NULL DEFAULT CURRENT_DATE,
  close_day0            NUMERIC     NOT NULL,
  ii_score              NUMERIC     DEFAULT 0,
  tma20                 NUMERIC     DEFAULT 0,
  vok_tipe              TEXT        DEFAULT '',
  macd_kondisi          TEXT        DEFAULT '',
  stoch_kondisi         TEXT        DEFAULT '',
  adx_kondisi           TEXT        DEFAULT '',
  parameter_khusus      JSONB       DEFAULT '{}'::jsonb,
  status                TEXT        NOT NULL DEFAULT 'MONITORING',
  -- Added in migration 20260315064129
  entry_day_rekomendasi INTEGER,
  win_pct_day_rekom     NUMERIC,
  avg_pct_day_rekom     NUMERIC,
  entry_notes           TEXT        DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.swing_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own swing_monitoring"
  ON public.swing_monitoring FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own swing_monitoring"
  ON public.swing_monitoring FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own swing_monitoring"
  ON public.swing_monitoring FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own swing_monitoring"
  ON public.swing_monitoring FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 9. swing_analysis_cache
--
-- Global cache — tidak ada user_id, siapapun bisa baca/tulis.
-- Unique on (ticker, screener_name, tanggal_cache).
-- =============================================================================
CREATE TABLE public.swing_analysis_cache (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker           TEXT        NOT NULL,
  screener_name    TEXT        NOT NULL,
  tanggal_cache    DATE        NOT NULL DEFAULT CURRENT_DATE,
  entry_day_rekom  INTEGER,
  win_pct_per_day  JSONB       DEFAULT '[]'::jsonb,
  avg_pct_per_day  JSONB       DEFAULT '[]'::jsonb,
  gap_up_rate      JSONB       DEFAULT '[]'::jsonb,
  action_score     NUMERIC     DEFAULT 0,
  total_events     INTEGER     DEFAULT 0,
  best_day         JSONB,
  alt_day          JSONB,
  ranking          JSONB       DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker, screener_name, tanggal_cache)
);

ALTER TABLE public.swing_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read swing_analysis_cache"
  ON public.swing_analysis_cache FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert swing_analysis_cache"
  ON public.swing_analysis_cache FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update swing_analysis_cache"
  ON public.swing_analysis_cache FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete swing_analysis_cache"
  ON public.swing_analysis_cache FOR DELETE TO authenticated
  USING (true);

CREATE INDEX idx_swing_cache_ticker_screener ON public.swing_analysis_cache(ticker, screener_name, tanggal_cache DESC);


-- =============================================================================
-- 10. bandarmology_data
-- =============================================================================
CREATE TABLE public.bandarmology_data (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tanggal_data     DATE        NOT NULL,
  input_time       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ticker           TEXT        NOT NULL,
  composite_pct    NUMERIC,
  top1_pct         NUMERIC,
  top1_broker      TEXT,
  value            NUMERIC,
  daily_pct        NUMERIC,
  weekly_pct       NUMERIC,
  pattern          TEXT        DEFAULT '',
  liquidity        TEXT,
  market_cap       TEXT        DEFAULT '',
  streak           INTEGER,
  streak_direction TEXT,
  kode_broker      TEXT,
  muncul_di_topl   BOOLEAN     NOT NULL DEFAULT false,
  muncul_di_topv   BOOLEAN     NOT NULL DEFAULT false,
  muncul_di_top    BOOLEAN     NOT NULL DEFAULT false,
  source_count     INTEGER     NOT NULL DEFAULT 1,
  tier             TEXT        NOT NULL DEFAULT 'C',
  is_topv          BOOLEAN     NOT NULL DEFAULT false,
  -- Added in migration 20260315104228
  rank_score       INTEGER,
  is_new_entry     BOOLEAN     NOT NULL DEFAULT false,
  is_top20         BOOLEAN     NOT NULL DEFAULT false,
  data_tier        TEXT        NOT NULL DEFAULT 'PARTIAL',
  -- Added in migration 20260315110257
  is_topl          BOOLEAN     DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bandarmology_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bandarmology_data"
  ON public.bandarmology_data FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own bandarmology_data"
  ON public.bandarmology_data FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own bandarmology_data"
  ON public.bandarmology_data FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bandarmology_data"
  ON public.bandarmology_data FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_bandarmology_user_tanggal ON public.bandarmology_data(user_id, tanggal_data DESC);
CREATE INDEX idx_bandarmology_user_tanggal_tier ON public.bandarmology_data(user_id, tanggal_data, tier);


-- =============================================================================
-- 11. accum_watch_history
-- =============================================================================
CREATE TABLE public.accum_watch_history (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker                  TEXT        NOT NULL,
  tanggal_pertama_accum   DATE        NOT NULL,
  tier_saat_masuk         TEXT        NOT NULL DEFAULT 'C',
  tanggal_masuk_superketat DATE,
  hari_tunggu             INTEGER,
  composite_saat_confirm  NUMERIC,
  streak_saat_confirm     INTEGER,
  status                  TEXT        NOT NULL DEFAULT 'WATCHING',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accum_watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accum_watch_history"
  ON public.accum_watch_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own accum_watch_history"
  ON public.accum_watch_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own accum_watch_history"
  ON public.accum_watch_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own accum_watch_history"
  ON public.accum_watch_history FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 12. ai_insights
--
-- Cache AI per (user_id, ticker, tanggal) — 24 jam TTL di level aplikasi.
-- insight_data: JSONB besar berisi 11 seksi analisis.
-- =============================================================================
CREATE TABLE public.ai_insights (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker       TEXT        NOT NULL,
  tanggal      DATE        NOT NULL DEFAULT CURRENT_DATE,
  insight_data JSONB       NOT NULL DEFAULT '{}'::jsonb,
  rating       TEXT,
  confidence   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own ai_insights"
  ON public.ai_insights FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own ai_insights"
  ON public.ai_insights FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own ai_insights"
  ON public.ai_insights FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Unique index — juga dipakai untuk UPSERT onConflict
CREATE UNIQUE INDEX idx_ai_insights_user_ticker_date
  ON public.ai_insights (user_id, ticker, tanggal);


-- =============================================================================
-- 13. custom_formulas
-- =============================================================================
CREATE TABLE public.custom_formulas (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nama        TEXT        NOT NULL,
  deskripsi   TEXT        DEFAULT '',
  formula     TEXT        NOT NULL,
  last_used   TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom_formulas"
  ON public.custom_formulas FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own custom_formulas"
  ON public.custom_formulas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own custom_formulas"
  ON public.custom_formulas FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own custom_formulas"
  ON public.custom_formulas FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 14. backtest_sessions
-- =============================================================================
CREATE TABLE public.backtest_sessions (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nama               TEXT        NOT NULL,
  formula            TEXT        NOT NULL,
  formula_id         UUID        REFERENCES public.custom_formulas(id) ON DELETE SET NULL,
  metode             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  threshold_bsjp     NUMERIC     DEFAULT 2,
  threshold_swing    NUMERIC     DEFAULT 5,
  periode_historis   TEXT        DEFAULT '1y',
  parameter_dipilih  JSONB       DEFAULT '[]'::jsonb,
  hasil_summary      JSONB       DEFAULT '{}'::jsonb,
  notes              TEXT        DEFAULT '',
  tanggal_run        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backtest_sessions"
  ON public.backtest_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own backtest_sessions"
  ON public.backtest_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own backtest_sessions"
  ON public.backtest_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own backtest_sessions"
  ON public.backtest_sessions FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- 15. ara_events
--
-- Global — tidak ada user_id. Data ARA event IDX.
-- =============================================================================
CREATE TABLE public.ara_events (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker       TEXT        NOT NULL,
  tanggal_ara  DATE        NOT NULL,
  harga_open   NUMERIC     NOT NULL,
  harga_high   NUMERIC     NOT NULL,
  harga_low    NUMERIC     NOT NULL,
  harga_close  NUMERIC     NOT NULL,
  pct_change   NUMERIC     NOT NULL,
  volume       NUMERIC     NOT NULL DEFAULT 0,
  value        NUMERIC     NOT NULL DEFAULT 0,
  fraksi_harga TEXT        NOT NULL DEFAULT '<200',
  batas_ara    NUMERIC     NOT NULL DEFAULT 35,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_events"
  ON public.ara_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert ara_events"
  ON public.ara_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can delete ara_events"
  ON public.ara_events FOR DELETE TO authenticated
  USING (true);

CREATE INDEX idx_ara_events_ticker ON public.ara_events(ticker, tanggal_ara DESC);


-- =============================================================================
-- 16. ara_pre_pattern
--
-- Global — FK ke ara_events, ON DELETE CASCADE.
-- hari: negatif = sebelum ARA (e.g. -1 = hari sebelum ARA, -7 = 7 hari sebelum)
-- =============================================================================
CREATE TABLE public.ara_pre_pattern (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ara_event_id    UUID        NOT NULL REFERENCES public.ara_events(id) ON DELETE CASCADE,
  ticker          TEXT        NOT NULL,
  tanggal_ara     DATE        NOT NULL,
  hari            INTEGER     NOT NULL,
  open            NUMERIC,
  high            NUMERIC,
  low             NUMERIC,
  close           NUMERIC,
  volume          NUMERIC,
  value           NUMERIC,
  pct_change      NUMERIC,
  candle_color    TEXT,
  gap_type        TEXT,
  -- Raw SMA values
  sma5            NUMERIC,
  sma20           NUMERIC,
  sma50           NUMERIC,
  -- Relative position vs SMA
  close_vs_sma5   TEXT,
  close_vs_sma20  TEXT,
  close_vs_sma50  TEXT,
  -- RSI
  rsi             NUMERIC,
  rsi_zone        TEXT,
  -- MACD
  macd_line       NUMERIC,
  macd_signal     NUMERIC,
  macd_histogram  NUMERIC,
  macd_status     TEXT,
  -- Bollinger Bands
  bb_position     TEXT,
  -- Volume ratios
  volume_vs_ma5   NUMERIC,
  volume_vs_ma20  NUMERIC,
  volume_spike    BOOLEAN     DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_pre_pattern ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_pre_pattern"
  ON public.ara_pre_pattern FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert ara_pre_pattern"
  ON public.ara_pre_pattern FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can delete ara_pre_pattern"
  ON public.ara_pre_pattern FOR DELETE TO authenticated
  USING (true);

CREATE INDEX idx_ara_pre_pattern_event ON public.ara_pre_pattern(ara_event_id);
CREATE INDEX idx_ara_pre_pattern_ticker ON public.ara_pre_pattern(ticker, tanggal_ara DESC);


-- =============================================================================
-- 17. ara_watchlist
--
-- Global — tidak ada user_id. Status & skor ticker ARA.
-- =============================================================================
CREATE TABLE public.ara_watchlist (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker              TEXT        NOT NULL,
  tanggal_ara_terakhir DATE,
  pct_ara_terakhir    NUMERIC,
  total_ara_count     INTEGER     DEFAULT 0,
  last_score          NUMERIC     DEFAULT 0,
  last_score_date     DATE,
  is_active           BOOLEAN     DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_watchlist"
  ON public.ara_watchlist FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert ara_watchlist"
  ON public.ara_watchlist FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update ara_watchlist"
  ON public.ara_watchlist FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete ara_watchlist"
  ON public.ara_watchlist FOR DELETE TO authenticated
  USING (true);


-- =============================================================================
-- 18. ara_watchlist_scores
--
-- Global — tidak ada user_id. Skor harian per indikator untuk 7 hari pre-ARA.
-- =============================================================================
CREATE TABLE public.ara_watchlist_scores (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker         TEXT        NOT NULL,
  tanggal_score  DATE        NOT NULL DEFAULT CURRENT_DATE,
  -- Scores per day (percentage 0–100)
  score_d1       NUMERIC     DEFAULT 0,
  score_d2       NUMERIC     DEFAULT 0,
  score_d3       NUMERIC     DEFAULT 0,
  score_d4       NUMERIC     DEFAULT 0,
  score_d5       NUMERIC     DEFAULT 0,
  score_d6       NUMERIC     DEFAULT 0,
  score_d7       NUMERIC     DEFAULT 0,
  score_total    NUMERIC     DEFAULT 0,
  -- Day 1 indicator detail
  d1_candle         BOOLEAN, d1_volume_spike BOOLEAN, d1_gap_type TEXT,
  d1_close_vs_sma5  TEXT,    d1_close_vs_sma20 TEXT, d1_close_vs_sma50 TEXT,
  d1_rsi_zone       TEXT,    d1_macd_status TEXT, d1_bb_position TEXT, d1_value_ok BOOLEAN,
  -- Day 2
  d2_candle         BOOLEAN, d2_volume_spike BOOLEAN, d2_gap_type TEXT,
  d2_close_vs_sma5  TEXT,    d2_close_vs_sma20 TEXT, d2_close_vs_sma50 TEXT,
  d2_rsi_zone       TEXT,    d2_macd_status TEXT, d2_bb_position TEXT, d2_value_ok BOOLEAN,
  -- Day 3
  d3_candle         BOOLEAN, d3_volume_spike BOOLEAN, d3_gap_type TEXT,
  d3_close_vs_sma5  TEXT,    d3_close_vs_sma20 TEXT, d3_close_vs_sma50 TEXT,
  d3_rsi_zone       TEXT,    d3_macd_status TEXT, d3_bb_position TEXT, d3_value_ok BOOLEAN,
  -- Day 4
  d4_candle         BOOLEAN, d4_volume_spike BOOLEAN, d4_gap_type TEXT,
  d4_close_vs_sma5  TEXT,    d4_close_vs_sma20 TEXT, d4_close_vs_sma50 TEXT,
  d4_rsi_zone       TEXT,    d4_macd_status TEXT, d4_bb_position TEXT, d4_value_ok BOOLEAN,
  -- Day 5
  d5_candle         BOOLEAN, d5_volume_spike BOOLEAN, d5_gap_type TEXT,
  d5_close_vs_sma5  TEXT,    d5_close_vs_sma20 TEXT, d5_close_vs_sma50 TEXT,
  d5_rsi_zone       TEXT,    d5_macd_status TEXT, d5_bb_position TEXT, d5_value_ok BOOLEAN,
  -- Day 6
  d6_candle         BOOLEAN, d6_volume_spike BOOLEAN, d6_gap_type TEXT,
  d6_close_vs_sma5  TEXT,    d6_close_vs_sma20 TEXT, d6_close_vs_sma50 TEXT,
  d6_rsi_zone       TEXT,    d6_macd_status TEXT, d6_bb_position TEXT, d6_value_ok BOOLEAN,
  -- Day 7
  d7_candle         BOOLEAN, d7_volume_spike BOOLEAN, d7_gap_type TEXT,
  d7_close_vs_sma5  TEXT,    d7_close_vs_sma20 TEXT, d7_close_vs_sma50 TEXT,
  d7_rsi_zone       TEXT,    d7_macd_status TEXT, d7_bb_position TEXT, d7_value_ok BOOLEAN,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_watchlist_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_watchlist_scores"
  ON public.ara_watchlist_scores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert ara_watchlist_scores"
  ON public.ara_watchlist_scores FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update ara_watchlist_scores"
  ON public.ara_watchlist_scores FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete ara_watchlist_scores"
  ON public.ara_watchlist_scores FOR DELETE TO authenticated
  USING (true);

CREATE INDEX idx_ara_watchlist_scores_ticker_date
  ON public.ara_watchlist_scores(ticker, tanggal_score DESC);


-- =============================================================================
-- 19. ak_broker_data
--
-- Unique constraint: (user_id, broker_code, tanggal, ticker)
-- Dipakai untuk UPSERT onConflict di useAkTracker.ts
-- =============================================================================
CREATE TABLE public.ak_broker_data (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tanggal     DATE        NOT NULL,
  ticker      TEXT        NOT NULL,
  broker_code TEXT        NOT NULL DEFAULT 'AK',
  buy_value   NUMERIC,
  buy_lot     NUMERIC,
  buy_avg     NUMERIC,
  sell_value  NUMERIC,
  sell_lot    NUMERIC,
  sell_avg    NUMERIC,
  net_value   NUMERIC     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_broker_date_ticker
    UNIQUE (user_id, broker_code, tanggal, ticker)
);

ALTER TABLE public.ak_broker_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ak_broker_data"
  ON public.ak_broker_data FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own ak_broker_data"
  ON public.ak_broker_data FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own ak_broker_data"
  ON public.ak_broker_data FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own ak_broker_data"
  ON public.ak_broker_data FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_ak_broker_data_date
  ON public.ak_broker_data(user_id, broker_code, tanggal DESC);


-- =============================================================================
-- 20. ak_broker_scores
--
-- Unique constraint: (user_id, broker_code, tanggal, ticker)
-- Dipakai untuk UPSERT onConflict di useAkTracker.ts
-- =============================================================================
CREATE TABLE public.ak_broker_scores (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tanggal             DATE        NOT NULL,
  ticker              TEXT        NOT NULL,
  broker_code         TEXT        NOT NULL DEFAULT 'AK',
  score_total         NUMERIC     NOT NULL DEFAULT 0,
  tag                 TEXT        NOT NULL DEFAULT 'NORMAL',
  tag_vs_saham        TEXT        NOT NULL DEFAULT 'NORMAL',
  tag_vs_ak           TEXT        NOT NULL DEFAULT 'NORMAL',
  streak_beli         INTEGER     NOT NULL DEFAULT 0,
  streak_jual         INTEGER     NOT NULL DEFAULT 0,
  is_reversal_buy     BOOLEAN     NOT NULL DEFAULT false,
  is_reversal_sell    BOOLEAN     NOT NULL DEFAULT false,
  cumulative_net_5d   NUMERIC     DEFAULT 0,
  cumulative_net_10d  NUMERIC     DEFAULT 0,
  cumulative_net_20d  NUMERIC     DEFAULT 0,
  avg_buy_rolling     NUMERIC     DEFAULT 0,
  buy_vs_avg_ratio    NUMERIC     DEFAULT 0,
  -- Added in migration 20260326013527
  total_value_saham   NUMERIC     DEFAULT 0,
  pct_of_market       NUMERIC     DEFAULT 0,
  value_source        TEXT        DEFAULT 'FALLBACK_HARDCODED',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_score_broker_date_ticker
    UNIQUE (user_id, broker_code, tanggal, ticker)
);

ALTER TABLE public.ak_broker_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ak_broker_scores"
  ON public.ak_broker_scores FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own ak_broker_scores"
  ON public.ak_broker_scores FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own ak_broker_scores"
  ON public.ak_broker_scores FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own ak_broker_scores"
  ON public.ak_broker_scores FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_ak_broker_scores_date
  ON public.ak_broker_scores(user_id, broker_code, tanggal DESC);


-- =============================================================================
-- 21. broker_profiles
--
-- Unique constraint: (user_id, broker_code) — satu user, satu kode broker.
-- =============================================================================
CREATE TABLE public.broker_profiles (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_code TEXT        NOT NULL,
  broker_name TEXT        NOT NULL,
  color       TEXT        DEFAULT '#00D4FF',
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, broker_code)
);

ALTER TABLE public.broker_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broker_profiles"
  ON public.broker_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own broker_profiles"
  ON public.broker_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own broker_profiles"
  ON public.broker_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own broker_profiles"
  ON public.broker_profiles FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- VERIFIKASI
-- Jalankan query ini setelah migration untuk memastikan semua tabel terbuat:
--
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_type = 'BASE TABLE'
-- ORDER BY table_name;
--
-- Expected: 21 tabel:
--   accum_watch_history, ai_insights, ak_broker_data, ak_broker_scores,
--   ara_events, ara_pre_pattern, ara_watchlist, ara_watchlist_scores,
--   backtest_sessions, bandarmology_data, broker_profiles, custom_formulas,
--   modal_transactions, sk_monitoring, swing_analysis_cache, swing_monitoring,
--   trades, trading_categories, watchlist, watchlist_rekomendasi, wr_scanner
-- =============================================================================
