-- Optional scenario for agent sessions (roleplay mode)
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS scenario_id TEXT,
  ADD COLUMN IF NOT EXISTS scenario_title TEXT;

COMMENT ON COLUMN agent_sessions.scenario_id IS 'ID of roleplay scenario when session was started in roleplay mode';
COMMENT ON COLUMN agent_sessions.scenario_title IS 'Display title of scenario for UI when opening session from history';
