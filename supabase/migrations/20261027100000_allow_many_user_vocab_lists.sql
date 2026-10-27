-- Несколько своих списков не должны склеиваться из-за пустого system_key.
-- Уникальность стартового набора остаётся только когда system_key задан.

ALTER TABLE vocab_lists
  DROP CONSTRAINT IF EXISTS vocab_lists_user_id_language_system_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS vocab_lists_system_key_uidx
  ON vocab_lists (user_id, language, system_key)
  WHERE system_key IS NOT NULL;
