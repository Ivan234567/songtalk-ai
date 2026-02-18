-- Progress by scenario steps: store which step IDs were completed (for roleplay scenarios with steps)

-- agent_sessions: snapshot of completed step IDs for this conversation
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS completed_step_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN agent_sessions.completed_step_ids IS 'For roleplay: array of step ids completed in this session (e.g. ["pickup","destination","confirm"])';

-- roleplay_completions: which steps were done when user clicked "Завершить сценарий"
ALTER TABLE roleplay_completions
  ADD COLUMN IF NOT EXISTS completed_step_ids JSONB;

COMMENT ON COLUMN roleplay_completions.completed_step_ids IS 'Step ids completed at completion time (for scenarios with steps)';
