
ALTER TABLE public.bandarmology_data 
ADD COLUMN IF NOT EXISTS rank_score integer,
ADD COLUMN IF NOT EXISTS is_new_entry boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_top20 boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS data_tier text NOT NULL DEFAULT 'PARTIAL';
