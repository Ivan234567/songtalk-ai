-- Level of scenario at completion time (for user-created scenarios: A1, A2, B1, B2, C1 or easy, medium, hard)
ALTER TABLE roleplay_completions
  ADD COLUMN IF NOT EXISTS scenario_level TEXT;

COMMENT ON COLUMN roleplay_completions.scenario_level IS 'Level of scenario when completed (for user scenarios only)';
