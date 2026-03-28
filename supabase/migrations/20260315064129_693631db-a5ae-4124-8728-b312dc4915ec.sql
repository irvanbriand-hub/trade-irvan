ALTER TABLE public.swing_monitoring 
ADD COLUMN IF NOT EXISTS entry_day_rekomendasi integer,
ADD COLUMN IF NOT EXISTS win_pct_day_rekom numeric,
ADD COLUMN IF NOT EXISTS avg_pct_day_rekom numeric,
ADD COLUMN IF NOT EXISTS entry_notes text DEFAULT '';