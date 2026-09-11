-- Разделение английских и китайских оценок речи / сессий агента.

ALTER TABLE speaking_assessments
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'zh'));

COMMENT ON COLUMN speaking_assessments.language IS 'Язык оценки: en (TEFL) или zh (китайская рубрика)';

CREATE INDEX IF NOT EXISTS idx_speaking_assessments_user_language
  ON speaking_assessments(user_id, language, created_at DESC);

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'zh'));

COMMENT ON COLUMN agent_sessions.language IS 'Язык сессии собеседника: en или zh';

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_language
  ON agent_sessions(user_id, language, created_at DESC);
