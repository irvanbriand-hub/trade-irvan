
CREATE TABLE public.watchlist_rekomendasi (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  category_id UUID REFERENCES public.trading_categories(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.watchlist_rekomendasi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wl_rekomendasi" ON public.watchlist_rekomendasi FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own wl_rekomendasi" ON public.watchlist_rekomendasi FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own wl_rekomendasi" ON public.watchlist_rekomendasi FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own wl_rekomendasi" ON public.watchlist_rekomendasi FOR DELETE TO authenticated USING (user_id = auth.uid());
