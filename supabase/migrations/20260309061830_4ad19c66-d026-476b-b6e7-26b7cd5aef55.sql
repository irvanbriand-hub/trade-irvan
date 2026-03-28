
-- Add user_id to trades
ALTER TABLE public.trades ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to trading_categories
ALTER TABLE public.trading_categories ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to watchlist
ALTER TABLE public.watchlist ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all access to trades" ON public.trades;
DROP POLICY IF EXISTS "Allow all access to trading_categories" ON public.trading_categories;
DROP POLICY IF EXISTS "Allow all access to watchlist" ON public.watchlist;

-- Trades RLS: users can only access their own data
CREATE POLICY "Users can view own trades" ON public.trades FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own trades" ON public.trades FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own trades" ON public.trades FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own trades" ON public.trades FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Trading categories RLS
CREATE POLICY "Users can view own categories" ON public.trading_categories FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own categories" ON public.trading_categories FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own categories" ON public.trading_categories FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own categories" ON public.trading_categories FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Watchlist RLS
CREATE POLICY "Users can view own watchlist" ON public.watchlist FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own watchlist" ON public.watchlist FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own watchlist" ON public.watchlist FOR DELETE TO authenticated USING (user_id = auth.uid());
