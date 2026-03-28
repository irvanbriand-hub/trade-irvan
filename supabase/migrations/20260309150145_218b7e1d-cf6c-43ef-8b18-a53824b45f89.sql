
-- Create wr_scanner table
CREATE TABLE public.wr_scanner (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  screener_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  tanggal_import DATE NOT NULL DEFAULT CURRENT_DATE,
  tanggal_backtest DATE,
  status TEXT NOT NULL DEFAULT 'OPEN',
  open_price NUMERIC,
  high_price NUMERIC,
  pct_open_to_high NUMERIC,
  result TEXT,
  wl_kategori TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wr_scanner ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own wr_scanner" ON public.wr_scanner FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own wr_scanner" ON public.wr_scanner FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own wr_scanner" ON public.wr_scanner FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own wr_scanner" ON public.wr_scanner FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Enable realtime (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE public.wr_scanner;
