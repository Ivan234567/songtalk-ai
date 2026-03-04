-- Evidence trail for 18+ consent confirmations.
-- One row per user + policy_version.

CREATE TABLE IF NOT EXISTS user_adult_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  confirmation_text TEXT NOT NULL,
  source TEXT,
  user_agent TEXT,
  confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_adult_confirmations_user_policy
  ON user_adult_confirmations(user_id, policy_version);

CREATE INDEX IF NOT EXISTS idx_user_adult_confirmations_user_confirmed
  ON user_adult_confirmations(user_id, confirmed_at DESC);

ALTER TABLE user_adult_confirmations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_adult_confirmations'
      AND policyname = 'Users can view own adult confirmations'
  ) THEN
    CREATE POLICY "Users can view own adult confirmations"
      ON user_adult_confirmations
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_adult_confirmations'
      AND policyname = 'Users can insert own adult confirmations'
  ) THEN
    CREATE POLICY "Users can insert own adult confirmations"
      ON user_adult_confirmations
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
