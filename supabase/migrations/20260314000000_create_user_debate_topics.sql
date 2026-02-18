-- User-defined debate topics (for "My topics" in Debate mode)
CREATE TABLE IF NOT EXISTS user_debate_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL CHECK (char_length(trim(topic)) > 0),
  topic_key TEXT NOT NULL CHECK (char_length(trim(topic_key)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_debate_topics_user_id
  ON user_debate_topics(user_id);

CREATE INDEX IF NOT EXISTS idx_user_debate_topics_updated_at
  ON user_debate_topics(updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_debate_topics_user_topic_key_unique
  ON user_debate_topics(user_id, topic_key);

ALTER TABLE user_debate_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user_debate_topics" ON user_debate_topics;
CREATE POLICY "Users can view own user_debate_topics"
  ON user_debate_topics FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own user_debate_topics" ON user_debate_topics;
CREATE POLICY "Users can insert own user_debate_topics"
  ON user_debate_topics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own user_debate_topics" ON user_debate_topics;
CREATE POLICY "Users can update own user_debate_topics"
  ON user_debate_topics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own user_debate_topics" ON user_debate_topics;
CREATE POLICY "Users can delete own user_debate_topics"
  ON user_debate_topics FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE user_debate_topics IS 'User-defined debate topics list ("My topics" for Debate mode)';
