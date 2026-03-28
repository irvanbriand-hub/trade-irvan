
CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticker text NOT NULL,
  tanggal date NOT NULL DEFAULT CURRENT_DATE,
  insight_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rating text,
  confidence text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_insights" ON public.ai_insights FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own ai_insights" ON public.ai_insights FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own ai_insights" ON public.ai_insights FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own ai_insights" ON public.ai_insights FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX idx_ai_insights_ticker_date_user ON public.ai_insights (user_id, ticker, tanggal);
