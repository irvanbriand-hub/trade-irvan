
CREATE TABLE public.modal_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  tipe TEXT NOT NULL CHECK (tipe IN ('TOP_UP', 'WITHDRAW')),
  jumlah NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.modal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own modal_transactions" ON public.modal_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own modal_transactions" ON public.modal_transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own modal_transactions" ON public.modal_transactions FOR DELETE TO authenticated USING (user_id = auth.uid());
