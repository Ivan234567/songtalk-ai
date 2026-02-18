-- Add archived column to user_debate_topics (for archive feature like in roleplay scenarios)
ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_debate_topics_archived
  ON user_debate_topics(user_id, archived);
