ALTER TABLE public.sk_monitoring 
ADD COLUMN IF NOT EXISTS jalur_masuk text DEFAULT '',
ADD COLUMN IF NOT EXISTS ii_score numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tma20 numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vok_tipe text DEFAULT '',
ADD COLUMN IF NOT EXISTS macd_kondisi text DEFAULT '',
ADD COLUMN IF NOT EXISTS stoch_kondisi text DEFAULT '',
ADD COLUMN IF NOT EXISTS adx_kondisi text DEFAULT '';