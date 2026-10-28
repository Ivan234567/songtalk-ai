-- Тематические ключи списка для fit со сценарием/дебатом (этап 1).

ALTER TABLE vocab_lists
  ADD COLUMN IF NOT EXISTS theme_keys TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_vocab_lists_theme_keys
  ON vocab_lists
  USING GIN (theme_keys);

COMMENT ON COLUMN vocab_lists.theme_keys IS
  'Канонические темы списка (home, food, travel…) для фильтра и ранжирования без LLM.';
