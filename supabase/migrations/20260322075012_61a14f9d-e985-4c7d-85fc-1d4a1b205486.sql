
CREATE TABLE public.ara_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  tanggal_ara_terakhir date,
  pct_ara_terakhir numeric,
  total_ara_count integer DEFAULT 0,
  last_score numeric DEFAULT 0,
  last_score_date date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_watchlist" ON public.ara_watchlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert ara_watchlist" ON public.ara_watchlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update ara_watchlist" ON public.ara_watchlist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete ara_watchlist" ON public.ara_watchlist FOR DELETE TO authenticated USING (true);

CREATE TABLE public.ara_watchlist_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  tanggal_score date NOT NULL DEFAULT CURRENT_DATE,
  score_d1 numeric DEFAULT 0,
  score_d2 numeric DEFAULT 0,
  score_d3 numeric DEFAULT 0,
  score_d4 numeric DEFAULT 0,
  score_d5 numeric DEFAULT 0,
  score_d6 numeric DEFAULT 0,
  score_d7 numeric DEFAULT 0,
  d1_candle boolean, d1_volume_spike boolean, d1_gap_type text, d1_close_vs_sma5 text, d1_close_vs_sma20 text, d1_close_vs_sma50 text, d1_rsi_zone text, d1_macd_status text, d1_bb_position text, d1_value_ok boolean,
  d2_candle boolean, d2_volume_spike boolean, d2_gap_type text, d2_close_vs_sma5 text, d2_close_vs_sma20 text, d2_close_vs_sma50 text, d2_rsi_zone text, d2_macd_status text, d2_bb_position text, d2_value_ok boolean,
  d3_candle boolean, d3_volume_spike boolean, d3_gap_type text, d3_close_vs_sma5 text, d3_close_vs_sma20 text, d3_close_vs_sma50 text, d3_rsi_zone text, d3_macd_status text, d3_bb_position text, d3_value_ok boolean,
  d4_candle boolean, d4_volume_spike boolean, d4_gap_type text, d4_close_vs_sma5 text, d4_close_vs_sma20 text, d4_close_vs_sma50 text, d4_rsi_zone text, d4_macd_status text, d4_bb_position text, d4_value_ok boolean,
  d5_candle boolean, d5_volume_spike boolean, d5_gap_type text, d5_close_vs_sma5 text, d5_close_vs_sma20 text, d5_close_vs_sma50 text, d5_rsi_zone text, d5_macd_status text, d5_bb_position text, d5_value_ok boolean,
  d6_candle boolean, d6_volume_spike boolean, d6_gap_type text, d6_close_vs_sma5 text, d6_close_vs_sma20 text, d6_close_vs_sma50 text, d6_rsi_zone text, d6_macd_status text, d6_bb_position text, d6_value_ok boolean,
  d7_candle boolean, d7_volume_spike boolean, d7_gap_type text, d7_close_vs_sma5 text, d7_close_vs_sma20 text, d7_close_vs_sma50 text, d7_rsi_zone text, d7_macd_status text, d7_bb_position text, d7_value_ok boolean,
  score_total numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_watchlist_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_watchlist_scores" ON public.ara_watchlist_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert ara_watchlist_scores" ON public.ara_watchlist_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update ara_watchlist_scores" ON public.ara_watchlist_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete ara_watchlist_scores" ON public.ara_watchlist_scores FOR DELETE TO authenticated USING (true);
