-- Primary-привязка списка к сценарию / дебату / свободному чату (этап 1 курса).
-- language уже есть. source расширяем значением ai.

ALTER TABLE vocab_lists
  DROP CONSTRAINT IF EXISTS vocab_lists_source_check;

ALTER TABLE vocab_lists
  ADD CONSTRAINT vocab_lists_source_check
  CHECK (source IN ('system', 'user', 'custom', 'ai'));

ALTER TABLE vocab_lists
  ADD COLUMN IF NOT EXISTS bound_kind TEXT
    CHECK (bound_kind IS NULL OR bound_kind IN ('scenario', 'debate', 'chat')),
  ADD COLUMN IF NOT EXISTS bound_ref TEXT
    CHECK (bound_ref IS NULL OR char_length(btrim(bound_ref)) BETWEEN 1 AND 160),
  ADD COLUMN IF NOT EXISTS bound_origin TEXT
    CHECK (bound_origin IS NULL OR bound_origin IN ('system', 'user')),
  ADD COLUMN IF NOT EXISTS bound_label TEXT
    CHECK (bound_label IS NULL OR char_length(btrim(bound_label)) BETWEEN 1 AND 160);

-- Либо полной привязки нет, либо kind+ref заданы вместе.
ALTER TABLE vocab_lists
  DROP CONSTRAINT IF EXISTS vocab_lists_bound_pair_check;

ALTER TABLE vocab_lists
  ADD CONSTRAINT vocab_lists_bound_pair_check
  CHECK (
    (bound_kind IS NULL AND bound_ref IS NULL AND bound_origin IS NULL AND bound_label IS NULL)
    OR (bound_kind IS NOT NULL AND bound_ref IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_vocab_lists_bound
  ON vocab_lists (user_id, language, bound_kind, bound_ref)
  WHERE bound_ref IS NOT NULL;

COMMENT ON COLUMN vocab_lists.bound_kind IS
  'Primary-привязка: scenario | debate | chat. NULL = общий список без модуля.';
COMMENT ON COLUMN vocab_lists.bound_ref IS
  'Opaque id сценария / дебат-топика / freestyle. Системные id — строки каталога, личные — UUID.';
COMMENT ON COLUMN vocab_lists.bound_origin IS
  'system = каталог, user = личный сценарий/дебат.';
COMMENT ON COLUMN vocab_lists.bound_label IS
  'Подпись для бейджа в словаре (денормализованное название сцены/темы).';
