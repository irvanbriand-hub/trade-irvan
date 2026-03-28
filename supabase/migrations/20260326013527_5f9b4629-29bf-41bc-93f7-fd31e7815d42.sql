ALTER TABLE public.ak_broker_scores 
ADD COLUMN IF NOT EXISTS total_value_saham numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS pct_of_market numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS value_source text DEFAULT 'FALLBACK_HARDCODED';