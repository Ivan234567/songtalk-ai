-- Голоса «хотите ли китайский», пока режим спрятан из переключателя.
-- Смотреть ответы: таблица chinese_interest_votes в Supabase.

CREATE TABLE IF NOT EXISTS public.chinese_interest_votes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  want boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chinese_interest_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chinese_interest_votes_own_read ON public.chinese_interest_votes;
CREATE POLICY chinese_interest_votes_own_read
  ON public.chinese_interest_votes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
