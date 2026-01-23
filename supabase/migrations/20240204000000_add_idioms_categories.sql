-- Migration: Add categories support for idioms
-- Description: Adds many-to-many relationship between idioms and categories

-- ============================================================================
-- user_idioms_categories - Связь many-to-many между идиомами и категориями
-- ============================================================================
-- Связывает идиомы из user_idioms с категориями

CREATE TABLE IF NOT EXISTS user_idioms_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idiom_id UUID NOT NULL REFERENCES user_idioms(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES vocabulary_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Уникальность: одна идиома может быть в категории только один раз
  UNIQUE(idiom_id, category_id)
);

-- Индексы для user_idioms_categories
CREATE INDEX IF NOT EXISTS idx_user_idioms_categories_user_id ON user_idioms_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_idioms_categories_idiom_id ON user_idioms_categories(idiom_id);
CREATE INDEX IF NOT EXISTS idx_user_idioms_categories_category_id ON user_idioms_categories(category_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- user_idioms_categories: пользователи видят только свои связи
ALTER TABLE user_idioms_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own idiom categories" ON user_idioms_categories;
CREATE POLICY "Users can view their own idiom categories"
  ON user_idioms_categories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own idiom categories" ON user_idioms_categories;
CREATE POLICY "Users can insert their own idiom categories"
  ON user_idioms_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own idiom categories" ON user_idioms_categories;
CREATE POLICY "Users can update their own idiom categories"
  ON user_idioms_categories FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own idiom categories" ON user_idioms_categories;
CREATE POLICY "Users can delete their own idiom categories"
  ON user_idioms_categories FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Функция для автоматической установки user_id в user_idioms_categories
CREATE OR REPLACE FUNCTION sync_idioms_categories_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Автоматически устанавливаем user_id из связанного idiom
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id
    FROM user_idioms
    WHERE id = NEW.idiom_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_idioms_categories_user_id_trigger ON user_idioms_categories;
CREATE TRIGGER sync_idioms_categories_user_id_trigger
  BEFORE INSERT ON user_idioms_categories
  FOR EACH ROW
  EXECUTE FUNCTION sync_idioms_categories_user_id();

-- ============================================================================
-- Views для удобных запросов
-- ============================================================================

-- Представление: идиомы с их категориями
CREATE OR REPLACE VIEW user_idioms_with_categories AS
SELECT 
  ui.id,
  ui.user_id,
  ui.phrase,
  ui.literal_translation,
  ui.meaning,
  ui.usage_examples,
  ui.source_video_id,
  ui.created_at,
  ui.updated_at,
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
FROM user_idioms ui
LEFT JOIN user_idioms_categories uic ON ui.id = uic.idiom_id
LEFT JOIN vocabulary_categories vc ON uic.category_id = vc.id
GROUP BY ui.id, ui.user_id, ui.phrase, ui.literal_translation, ui.meaning, 
         ui.usage_examples, ui.source_video_id, ui.created_at, ui.updated_at;

-- Обновляем представление категорий с количеством идиом
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
  COUNT(DISTINCT uic.idiom_id) as idiom_count
FROM vocabulary_categories vc
LEFT JOIN user_vocabulary_categories uvc ON vc.id = uvc.category_id
LEFT JOIN user_idioms_categories uic ON vc.id = uic.category_id
GROUP BY vc.id, vc.user_id, vc.name, vc.description, vc.color, vc.icon, 
         vc.created_at, vc.updated_at;

-- ============================================================================
-- Комментарии к таблицам
-- ============================================================================

COMMENT ON TABLE user_idioms_categories IS 'Связь many-to-many между идиомами и категориями';
