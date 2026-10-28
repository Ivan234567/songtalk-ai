-- Слово списка принадлежит шагу цели сценария.
ALTER TABLE vocab_list_items
  ADD COLUMN IF NOT EXISTS step_key TEXT;

COMMENT ON COLUMN vocab_list_items.step_key IS
  'Нормализованный заголовок шага, который это слово помогает закрыть';
