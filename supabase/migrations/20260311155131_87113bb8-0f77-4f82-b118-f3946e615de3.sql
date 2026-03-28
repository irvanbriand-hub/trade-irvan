
CREATE TABLE public.sk_monitoring (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  tanggal_masuk DATE NOT NULL DEFAULT CURRENT_DATE,
  close_day0 NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'MONITORING',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sk_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sk_monitoring" ON public.sk_monitoring FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own sk_monitoring" ON public.sk_monitoring FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own sk_monitoring" ON public.sk_monitoring FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own sk_monitoring" ON public.sk_monitoring FOR DELETE TO authenticated USING (user_id = auth.uid());
