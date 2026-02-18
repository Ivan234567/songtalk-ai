-- Add slang/profanity style settings for debate topics (parity with roleplay settings)
ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS slang_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (slang_mode IN ('off', 'light', 'heavy'));

ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS allow_profanity BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS ai_may_use_profanity BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_debate_topics
  ADD COLUMN IF NOT EXISTS profanity_intensity TEXT NOT NULL DEFAULT 'light'
    CHECK (profanity_intensity IN ('light', 'medium', 'hard'));
