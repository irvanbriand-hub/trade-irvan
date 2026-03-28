CREATE TABLE public.swing_monitoring (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticker text NOT NULL,
  screener_name text NOT NULL,
  tanggal_masuk date NOT NULL DEFAULT CURRENT_DATE,
  close_day0 numeric NOT NULL,
  ii_score numeric DEFAULT 0,
  tma20 numeric DEFAULT 0,
  vok_tipe text DEFAULT '',
  macd_kondisi text DEFAULT '',
  stoch_kondisi text DEFAULT '',
  adx_kondisi text DEFAULT '',
  parameter_khusus jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'MONITORING',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.swing_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own swing_monitoring" ON public.swing_monitoring FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own swing_monitoring" ON public.swing_monitoring FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own swing_monitoring" ON public.swing_monitoring FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own swing_monitoring" ON public.swing_monitoring FOR DELETE TO authenticated USING (user_id = auth.uid());