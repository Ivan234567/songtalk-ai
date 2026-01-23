-- Migration: Add categories support for phrasal verbs
-- Description: Adds many-to-many relationship between phrasal verbs and categories

-- ============================================================================
-- user_phrasal_verbs_categories - Связь many-to-many между фразовыми глаголами и категориями
-- ============================================================================
-- Связывает фразовые глаголы из user_phrasal_verbs с категориями

CREATE TABLE IF NOT EXISTS user_phrasal_verbs_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrasal_verb_id UUID NOT NULL REFERENCES user_phrasal_verbs(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES vocabulary_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Уникальность: один фразовый глагол может быть в категории только один раз
  UNIQUE(phrasal_verb_id, category_id)
);

-- Индексы для user_phrasal_verbs_categories
CREATE INDEX IF NOT EXISTS idx_user_phrasal_verbs_categories_user_id ON user_phrasal_verbs_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_phrasal_verbs_categories_phrasal_verb_id ON user_phrasal_verbs_categories(phrasal_verb_id);
CREATE INDEX IF NOT EXISTS idx_user_phrasal_verbs_categories_category_id ON user_phrasal_verbs_categories(category_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- user_phrasal_verbs_categories: пользователи видят только свои связи
ALTER TABLE user_phrasal_verbs_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own phrasal verb categories" ON user_phrasal_verbs_categories;
CREATE POLICY "Users can view their own phrasal verb categories"
  ON user_phrasal_verbs_categories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own phrasal verb categories" ON user_phrasal_verbs_categories;
CREATE POLICY "Users can insert their own phrasal verb categories"
  ON user_phrasal_verbs_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own phrasal verb categories" ON user_phrasal_verbs_categories;
CREATE POLICY "Users can update their own phrasal verb categories"
  ON user_phrasal_verbs_categories FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own phrasal verb categories" ON user_phrasal_verbs_categories;
CREATE POLICY "Users can delete their own phrasal verb categories"
  ON user_phrasal_verbs_categories FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Функция для автоматической установки user_id в user_phrasal_verbs_categories
CREATE OR REPLACE FUNCTION sync_phrasal_verbs_categories_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Автоматически устанавливаем user_id из связанного phrasal_verb
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id
    FROM user_phrasal_verbs
    WHERE id = NEW.phrasal_verb_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_phrasal_verbs_categories_user_id_trigger ON user_phrasal_verbs_categories;
CREATE TRIGGER sync_phrasal_verbs_categories_user_id_trigger
  BEFORE INSERT ON user_phrasal_verbs_categories
  FOR EACH ROW
  EXECUTE FUNCTION sync_phrasal_verbs_categories_user_id();

-- ============================================================================
-- Views для удобных запросов
-- ============================================================================

-- Представление: фразовые глаголы с их категориями
CREATE OR REPLACE VIEW user_phrasal_verbs_with_categories AS
SELECT 
  upv.id,
  upv.user_id,
  upv.phrase,
  upv.literal_translation,
  upv.meaning,
  upv.usage_examples,
  upv.source_video_id,
  upv.created_at,
  upv.updated_at,
  COALESCE(
    json_agg(
      json_build_object(
        'id', vc.id,
        'name', vc.name,
        'description', vc.description,
        'color', vc.color,
        'icon', vc.icon
      )
    ) FILTER (WHERE vc.id IS NOT NULL),
    '[]'::json
  ) as categories
FROM user_phrasal_verbs upv
LEFT JOIN user_phrasal_verbs_categories upvc ON upv.id = upvc.phrasal_verb_id
LEFT JOIN vocabulary_categories vc ON upvc.category_id = vc.id
GROUP BY upv.id, upv.user_id, upv.phrase, upv.literal_translation, upv.meaning, 
         upv.usage_examples, upv.source_video_id, upv.created_at, upv.updated_at;

-- Обновляем представление категорий с количеством фразовых глаголов
CREATE OR REPLACE VIEW vocabulary_categories_with_counts AS
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
  COUNT(DISTINCT upvc.phrasal_verb_id) as phrasal_verb_count
FROM vocabulary_categories vc
LEFT JOIN user_vocabulary_categories uvc ON vc.id = uvc.category_id
LEFT JOIN user_idioms_categories uic ON vc.id = uic.category_id
LEFT JOIN user_phrasal_verbs_categories upvc ON vc.id = upvc.category_id
GROUP BY vc.id, vc.user_id, vc.name, vc.description, vc.color, vc.icon, 
         vc.created_at, vc.updated_at;

-- ============================================================================
-- Комментарии к таблицам
-- ============================================================================

COMMENT ON TABLE user_phrasal_verbs_categories IS 'Связь many-to-many между фразовыми глаголами и категориями';
