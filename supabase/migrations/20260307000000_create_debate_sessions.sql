-- Debate sessions: history of debate conversations per user
CREATE TABLE IF NOT EXISTS debate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  user_position TEXT NOT NULL CHECK (user_position IN ('for', 'against')),
  ai_position TEXT NOT NULL CHECK (ai_position IN ('for', 'against')),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debate_sessions_user_id ON debate_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_debate_sessions_created_at ON debate_sessions(created_at DESC);

ALTER TABLE debate_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own debate sessions" ON debate_sessions;
CREATE POLICY "Users can view own debate sessions"
  ON debate_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own debate sessions" ON debate_sessions;
CREATE POLICY "Users can insert own debate sessions"
  ON debate_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own debate sessions" ON debate_sessions;
CREATE POLICY "Users can update own debate sessions"
  ON debate_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own debate sessions" ON debate_sessions;
CREATE POLICY "Users can delete own debate sessions"
  ON debate_sessions FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE debate_sessions IS 'Debate sessions: user debates with AI on various topics';
