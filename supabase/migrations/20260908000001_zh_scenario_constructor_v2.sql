-- Конструктор китайских сценариев v2: обязательные слова vs слова ИИ.
-- Характер собеседника и грамматический фокус живут в payload JSON.

ALTER TABLE zh_scenario_vocab
  ADD COLUMN IF NOT EXISTS usage TEXT NOT NULL DEFAULT 'model'
  CHECK (usage IN ('must_say', 'model'));

COMMENT ON COLUMN zh_scenario_vocab.usage IS
  'must_say — ученик должен сказать сам; model — ИИ использует в своих репликах';
