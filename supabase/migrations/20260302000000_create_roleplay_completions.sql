-- Roleplay scenario completions: one row per "Завершить сценарий" click per user
CREATE TABLE IF NOT EXISTS roleplay_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  scenario_title TEXT,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roleplay_completions_user_id ON roleplay_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_completions_user_scenario ON roleplay_completions(user_id, scenario_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_completions_completed_at ON roleplay_completions(completed_at DESC);

ALTER TABLE roleplay_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roleplay completions"
  ON roleplay_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own roleplay completions"
  ON roleplay_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
