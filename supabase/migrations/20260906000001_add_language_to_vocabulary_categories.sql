-- Категории словаря разделены по языку: en и zh независимы.

ALTER TABLE vocabulary_categories
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'zh'));

ALTER TABLE vocabulary_categories
  DROP CONSTRAINT IF EXISTS vocabulary_categories_user_id_name_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vocabulary_categories_user_id_name_language_key'
  ) THEN
    ALTER TABLE vocabulary_categories
      ADD CONSTRAINT vocabulary_categories_user_id_name_language_key UNIQUE (user_id, name, language);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vocabulary_categories_user_language
  ON vocabulary_categories(user_id, language);

-- Старые категории остаются английскими (DEFAULT 'en').
-- Снимаем ошибочные связи китайских слов/成语 с английскими категориями.
DELETE FROM user_vocabulary_categories uvc
USING user_vocabulary uv, vocabulary_categories vc
WHERE uvc.vocabulary_id = uv.id
  AND uvc.category_id = vc.id
  AND COALESCE(uv.language, 'en') IS DISTINCT FROM vc.language;

DELETE FROM user_idioms_categories uic
USING user_idioms ui, vocabulary_categories vc
WHERE uic.idiom_id = ui.id
  AND uic.category_id = vc.id
  AND COALESCE(ui.language, 'en') IS DISTINCT FROM vc.language;

DROP VIEW IF EXISTS vocabulary_categories_with_counts;
CREATE VIEW vocabulary_categories_with_counts AS
SELECT
  vc.id,
  vc.user_id,
  vc.name,
  vc.description,
  vc.color,
  vc.icon,
  vc.created_at,
  vc.updated_at,
  COUNT(DISTINCT uvc.vocabulary_id) as word_count,
  COUNT(DISTINCT uic.idiom_id) as idiom_count,
  COUNT(DISTINCT upvc.phrasal_verb_id) as phrasal_verb_count,
  vc.language
FROM vocabulary_categories vc
LEFT JOIN user_vocabulary_categories uvc ON vc.id = uvc.category_id
LEFT JOIN user_idioms_categories uic ON vc.id = uic.category_id
LEFT JOIN user_phrasal_verbs_categories upvc ON vc.id = upvc.category_id
GROUP BY vc.id, vc.user_id, vc.name, vc.description, vc.color, vc.icon,
         vc.created_at, vc.updated_at, vc.language;

COMMENT ON COLUMN vocabulary_categories.language IS 'Язык категории: en (English) или zh (Chinese)';
