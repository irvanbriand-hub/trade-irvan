ALTER TABLE public.sk_monitoring 
ADD COLUMN IF NOT EXISTS is_confluence boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS vv0_saat_masuk numeric,
ADD COLUMN IF NOT EXISTS vv1_saat_masuk numeric,
ADD COLUMN IF NOT EXISTS vm60_saat_masuk numeric;