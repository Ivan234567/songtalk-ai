-- User-created roleplay scenarios (AI-generated or manually edited).
-- Same gameplay as system scenarios; payload matches RoleplayScenario shape.
CREATE TABLE IF NOT EXISTS user_roleplay_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'medium',
  archived BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN user_roleplay_scenarios.level IS 'A1, A2, B1, B2, C1 or easy, medium, hard — for filters and display';
COMMENT ON COLUMN user_roleplay_scenarios.archived IS 'Archived scenarios are hidden from main list, can be restored';
COMMENT ON COLUMN user_roleplay_scenarios.payload IS 'Full scenario: systemPrompt, goal, goalRu, steps, setting, characterOpening, etc.';

CREATE INDEX IF NOT EXISTS idx_user_roleplay_scenarios_user_id ON user_roleplay_scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roleplay_scenarios_user_archived ON user_roleplay_scenarios(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_user_roleplay_scenarios_updated_at ON user_roleplay_scenarios(updated_at DESC);

ALTER TABLE user_roleplay_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own user_roleplay_scenarios"
  ON user_roleplay_scenarios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user_roleplay_scenarios"
  ON user_roleplay_scenarios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user_roleplay_scenarios"
  ON user_roleplay_scenarios FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own user_roleplay_scenarios"
  ON user_roleplay_scenarios FOR DELETE
  USING (auth.uid() = user_id);
