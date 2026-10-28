-- Сессия практики помнит, из какого списка взяли ≤5 слов (этап 1 курса).

ALTER TABLE vocab_dialogue_sessions
  ADD COLUMN IF NOT EXISTS list_id UUID;

ALTER TABLE vocab_dialogue_sessions
  DROP CONSTRAINT IF EXISTS vocab_dialogue_sessions_list_fk;

ALTER TABLE vocab_dialogue_sessions
  ADD CONSTRAINT vocab_dialogue_sessions_list_fk
  FOREIGN KEY (list_id)
  REFERENCES vocab_lists (id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_dialogue_sessions_list
  ON vocab_dialogue_sessions (user_id, list_id, created_at DESC)
  WHERE list_id IS NOT NULL;

COMMENT ON COLUMN vocab_dialogue_sessions.list_id IS
  'Список-источник пятёрки сессии; NULL если слова собраны без списка.';
