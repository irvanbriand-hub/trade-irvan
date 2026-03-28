
-- Create trading categories table
CREATE TABLE public.trading_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trades table
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ticker TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
  price NUMERIC NOT NULL,
  lots INTEGER NOT NULL,
  category_id UUID REFERENCES public.trading_categories(id) ON DELETE SET NULL,
  notes TEXT,
  total_value NUMERIC GENERATED ALWAYS AS (price * lots * 100) STORED,
  fee NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN trade_type = 'BUY' THEN price * lots * 100 * 0.0015
      WHEN trade_type = 'SELL' THEN price * lots * 100 * 0.0025
      ELSE 0
    END
  ) STORED,
  total_amount NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN trade_type = 'BUY' THEN price * lots * 100 * 1.0015
      WHEN trade_type = 'SELL' THEN price * lots * 100 * 0.9975
      ELSE 0
    END
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create watchlist table
CREATE TABLE public.watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (allow all access for single user)
ALTER TABLE public.trading_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

-- Open policies for single user app
CREATE POLICY "Allow all access to trading_categories" ON public.trading_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to trades" ON public.trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to watchlist" ON public.watchlist FOR ALL USING (true) WITH CHECK (true);

-- Insert default categories
INSERT INTO public.trading_categories (name) VALUES 
  ('Day Trading - BPJS'),
  ('Day Trading - BSJP'),
  ('Swing Trading'),
  ('Scalping'),
  ('Position Trading');
