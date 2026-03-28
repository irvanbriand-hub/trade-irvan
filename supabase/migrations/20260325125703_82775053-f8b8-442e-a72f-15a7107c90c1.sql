
-- AK Broker Data table
CREATE TABLE public.ak_broker_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tanggal DATE NOT NULL,
  ticker TEXT NOT NULL,
  buy_value NUMERIC,
  buy_lot NUMERIC,
  buy_avg NUMERIC,
  sell_value NUMERIC,
  sell_lot NUMERIC,
  sell_avg NUMERIC,
  net_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ak_broker_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ak_broker_data" ON public.ak_broker_data FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own ak_broker_data" ON public.ak_broker_data FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own ak_broker_data" ON public.ak_broker_data FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own ak_broker_data" ON public.ak_broker_data FOR DELETE TO authenticated USING (user_id = auth.uid());

-- AK Broker Scores table
CREATE TABLE public.ak_broker_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tanggal DATE NOT NULL,
  ticker TEXT NOT NULL,
  score_total NUMERIC NOT NULL DEFAULT 0,
  tag TEXT NOT NULL DEFAULT 'NORMAL',
  tag_vs_saham TEXT NOT NULL DEFAULT 'NORMAL',
  tag_vs_ak TEXT NOT NULL DEFAULT 'NORMAL',
  streak_beli INTEGER NOT NULL DEFAULT 0,
  streak_jual INTEGER NOT NULL DEFAULT 0,
  is_reversal_buy BOOLEAN NOT NULL DEFAULT false,
  is_reversal_sell BOOLEAN NOT NULL DEFAULT false,
  cumulative_net_5d NUMERIC DEFAULT 0,
  cumulative_net_10d NUMERIC DEFAULT 0,
  cumulative_net_20d NUMERIC DEFAULT 0,
  avg_buy_rolling NUMERIC DEFAULT 0,
  buy_vs_avg_ratio NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ak_broker_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ak_broker_scores" ON public.ak_broker_scores FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own ak_broker_scores" ON public.ak_broker_scores FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own ak_broker_scores" ON public.ak_broker_scores FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own ak_broker_scores" ON public.ak_broker_scores FOR DELETE TO authenticated USING (user_id = auth.uid());
