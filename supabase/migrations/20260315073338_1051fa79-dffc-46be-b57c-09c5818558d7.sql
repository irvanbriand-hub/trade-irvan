
CREATE TABLE public.swing_analysis_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker text NOT NULL,
  screener_name text NOT NULL,
  tanggal_cache date NOT NULL DEFAULT CURRENT_DATE,
  entry_day_rekom integer,
  win_pct_per_day jsonb DEFAULT '[]'::jsonb,
  avg_pct_per_day jsonb DEFAULT '[]'::jsonb,
  gap_up_rate jsonb DEFAULT '[]'::jsonb,
  action_score numeric DEFAULT 0,
  total_events integer DEFAULT 0,
  best_day jsonb,
  alt_day jsonb,
  ranking jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (ticker, screener_name, tanggal_cache)
);

ALTER TABLE public.swing_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read swing_analysis_cache"
  ON public.swing_analysis_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert swing_analysis_cache"
  ON public.swing_analysis_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update swing_analysis_cache"
  ON public.swing_analysis_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete swing_analysis_cache"
  ON public.swing_analysis_cache FOR DELETE
  TO authenticated
  USING (true);
