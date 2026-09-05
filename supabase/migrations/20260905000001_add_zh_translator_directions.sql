-- Add Chinese translator directions to translator_history

ALTER TABLE translator_history
  DROP CONSTRAINT IF EXISTS translator_history_direction_check;

ALTER TABLE translator_history
  ADD CONSTRAINT translator_history_direction_check
  CHECK (direction IN ('en-ru', 'ru-en', 'zh-ru', 'ru-zh'));
