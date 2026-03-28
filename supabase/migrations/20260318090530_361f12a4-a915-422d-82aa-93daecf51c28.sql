
-- Custom formulas table
CREATE TABLE public.custom_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nama text NOT NULL,
  deskripsi text DEFAULT '',
  formula text NOT NULL,
  last_used timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom_formulas" ON public.custom_formulas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own custom_formulas" ON public.custom_formulas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own custom_formulas" ON public.custom_formulas FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own custom_formulas" ON public.custom_formulas FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Backtest sessions table
CREATE TABLE public.backtest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nama text NOT NULL,
  formula text NOT NULL,
  formula_id uuid REFERENCES public.custom_formulas(id) ON DELETE SET NULL,
  metode jsonb NOT NULL DEFAULT '[]'::jsonb,
  threshold_bsjp numeric DEFAULT 2,
  threshold_swing numeric DEFAULT 5,
  periode_historis text DEFAULT '1y',
  parameter_dipilih jsonb DEFAULT '[]'::jsonb,
  hasil_summary jsonb DEFAULT '{}'::jsonb,
  notes text DEFAULT '',
  tanggal_run timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backtest_sessions" ON public.backtest_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own backtest_sessions" ON public.backtest_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own backtest_sessions" ON public.backtest_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own backtest_sessions" ON public.backtest_sessions FOR DELETE TO authenticated USING (user_id = auth.uid());
