-- Security journal: user account actions (login/logout/password/reset/email change)

CREATE TABLE IF NOT EXISTS user_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('login', 'logout', 'password_change', 'password_reset_request', 'email_change')
  ),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_security_events_user_created
  ON user_security_events(user_id, created_at DESC);

ALTER TABLE user_security_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_security_events'
      AND policyname = 'Users can view own security events'
  ) THEN
    CREATE POLICY "Users can view own security events"
      ON user_security_events
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
      AND tablename = 'user_security_events'
      AND policyname = 'Users can insert own security events'
  ) THEN
    CREATE POLICY "Users can insert own security events"
      ON user_security_events
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
