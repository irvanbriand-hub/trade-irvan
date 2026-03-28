
-- Table: bandarmology_data
CREATE TABLE public.bandarmology_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tanggal_data DATE NOT NULL,
  input_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ticker TEXT NOT NULL,
  composite_pct NUMERIC,
  top1_pct NUMERIC,
  top1_broker TEXT,
  value NUMERIC,
  daily_pct NUMERIC,
  weekly_pct NUMERIC,
  pattern TEXT DEFAULT '',
  liquidity TEXT,
  market_cap TEXT DEFAULT '',
  streak INTEGER,
  streak_direction TEXT,
  kode_broker TEXT,
  muncul_di_topl BOOLEAN NOT NULL DEFAULT false,
  muncul_di_topv BOOLEAN NOT NULL DEFAULT false,
  muncul_di_top BOOLEAN NOT NULL DEFAULT false,
  source_count INTEGER NOT NULL DEFAULT 1,
  tier TEXT NOT NULL DEFAULT 'C',
  is_topv BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bandarmology_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bandarmology_data" ON public.bandarmology_data FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own bandarmology_data" ON public.bandarmology_data FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own bandarmology_data" ON public.bandarmology_data FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own bandarmology_data" ON public.bandarmology_data FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Table: accum_watch_history
CREATE TABLE public.accum_watch_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  tanggal_pertama_accum DATE NOT NULL,
  tier_saat_masuk TEXT NOT NULL DEFAULT 'C',
  tanggal_masuk_superketat DATE,
  hari_tunggu INTEGER,
  composite_saat_confirm NUMERIC,
  streak_saat_confirm INTEGER,
  status TEXT NOT NULL DEFAULT 'WATCHING',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accum_watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accum_watch_history" ON public.accum_watch_history FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own accum_watch_history" ON public.accum_watch_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own accum_watch_history" ON public.accum_watch_history FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own accum_watch_history" ON public.accum_watch_history FOR DELETE TO authenticated USING (user_id = auth.uid());
