
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  merchant TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL DEFAULT '기타',
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO anon, authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.expenses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert" ON public.expenses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update" ON public.expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete" ON public.expenses FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX expenses_spent_at_idx ON public.expenses (spent_at DESC);
