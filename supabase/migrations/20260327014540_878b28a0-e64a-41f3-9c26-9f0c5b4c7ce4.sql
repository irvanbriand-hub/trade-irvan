
-- 1. Create broker_profiles table
CREATE TABLE public.broker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  broker_code text NOT NULL,
  broker_name text NOT NULL,
  color text DEFAULT '#00D4FF',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, broker_code)
);

ALTER TABLE public.broker_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broker_profiles" ON public.broker_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own broker_profiles" ON public.broker_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own broker_profiles" ON public.broker_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own broker_profiles" ON public.broker_profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2. Add broker_code to ak_broker_data
ALTER TABLE public.ak_broker_data ADD COLUMN IF NOT EXISTS broker_code text DEFAULT 'AK';

-- 3. Add broker_code to ak_broker_scores
ALTER TABLE public.ak_broker_scores ADD COLUMN IF NOT EXISTS broker_code text DEFAULT 'AK';

-- 4. Drop old unique constraints and add new ones
ALTER TABLE public.ak_broker_data DROP CONSTRAINT IF EXISTS unique_user_date_ticker;
ALTER TABLE public.ak_broker_data ADD CONSTRAINT unique_broker_date_ticker UNIQUE (user_id, broker_code, tanggal, ticker);

ALTER TABLE public.ak_broker_scores DROP CONSTRAINT IF EXISTS unique_score_user_date_ticker;
ALTER TABLE public.ak_broker_scores ADD CONSTRAINT unique_score_broker_date_ticker UNIQUE (user_id, broker_code, tanggal, ticker);

-- 5. Insert default broker AK for existing users
INSERT INTO public.broker_profiles (user_id, broker_code, broker_name, color)
SELECT DISTINCT user_id, 'AK', 'Broker AK', '#00D4FF'
FROM public.ak_broker_data
ON CONFLICT DO NOTHING;

-- 6. Add indexes
CREATE INDEX IF NOT EXISTS idx_ak_broker_date ON public.ak_broker_data(user_id, broker_code, tanggal);
CREATE INDEX IF NOT EXISTS idx_ak_scores_date ON public.ak_broker_scores(user_id, broker_code, tanggal);
