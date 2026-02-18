-- Add difficulty and full debate settings to user_debate_topics
ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard'));

ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS user_position TEXT
    CHECK (user_position IS NULL OR user_position IN ('for', 'against'));

ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS micro_goal_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS who_starts TEXT NOT NULL DEFAULT 'ai'
    CHECK (who_starts IN ('ai', 'user'));
