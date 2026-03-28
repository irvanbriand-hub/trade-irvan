
-- ARA Events table
CREATE TABLE public.ara_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  tanggal_ara date NOT NULL,
  harga_open numeric NOT NULL,
  harga_high numeric NOT NULL,
  harga_low numeric NOT NULL,
  harga_close numeric NOT NULL,
  pct_change numeric NOT NULL,
  volume numeric NOT NULL DEFAULT 0,
  value numeric NOT NULL DEFAULT 0,
  fraksi_harga text NOT NULL DEFAULT '<200',
  batas_ara numeric NOT NULL DEFAULT 35,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_events" ON public.ara_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert ara_events" ON public.ara_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can delete ara_events" ON public.ara_events FOR DELETE TO authenticated USING (true);

-- ARA Pre-Pattern table
CREATE TABLE public.ara_pre_pattern (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ara_event_id uuid REFERENCES public.ara_events(id) ON DELETE CASCADE NOT NULL,
  ticker text NOT NULL,
  tanggal_ara date NOT NULL,
  hari integer NOT NULL,
  open numeric, high numeric, low numeric, close numeric,
  volume numeric, value numeric, pct_change numeric,
  candle_color text, gap_type text,
  sma5 numeric, sma20 numeric, sma50 numeric,
  close_vs_sma5 text, close_vs_sma20 text, close_vs_sma50 text,
  rsi numeric, rsi_zone text,
  macd_line numeric, macd_signal numeric, macd_histogram numeric, macd_status text,
  bb_position text,
  volume_vs_ma5 numeric, volume_vs_ma20 numeric,
  volume_spike boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ara_pre_pattern ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ara_pre_pattern" ON public.ara_pre_pattern FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert ara_pre_pattern" ON public.ara_pre_pattern FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can delete ara_pre_pattern" ON public.ara_pre_pattern FOR DELETE TO authenticated USING (true);
