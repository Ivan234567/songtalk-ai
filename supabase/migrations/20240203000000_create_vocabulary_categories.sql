-- Migration: Create vocabulary categories tables
-- Description: Tables for grouping vocabulary words by themes/categories

-- ============================================================================
-- 1. vocabulary_categories - Категории/темы для слов
-- ============================================================================
-- Хранит категории, созданные пользователем для группировки слов

CREATE TABLE IF NOT EXISTS vocabulary_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Название категории
  description TEXT, -- Описание категории
  color TEXT DEFAULT '#3b82f6', -- Цвет категории (hex)
  icon TEXT, -- Иконка категории (emoji или название)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Уникальность: одно название категории на пользователя
  UNIQUE(user_id, name)
);

-- Индексы для vocabulary_categories
CREATE INDEX IF NOT EXISTS idx_vocabulary_categories_user_id ON vocabulary_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_categories_name ON vocabulary_categories(name);

-- ============================================================================
-- 2. user_vocabulary_categories - Связь many-to-many между словами и категориями
-- ============================================================================
-- Связывает слова из user_vocabulary с категориями

CREATE TABLE IF NOT EXISTS user_vocabulary_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id UUID NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES vocabulary_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Уникальность: одно слово может быть в категории только один раз
  UNIQUE(vocabulary_id, category_id)
);

-- Индексы для user_vocabulary_categories
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_categories_user_id ON user_vocabulary_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_categories_vocabulary_id ON user_vocabulary_categories(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_categories_category_id ON user_vocabulary_categories(category_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- vocabulary_categories: пользователи видят только свои категории
ALTER TABLE vocabulary_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own categories" ON vocabulary_categories;
CREATE POLICY "Users can view their own categories"
  ON vocabulary_categories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own categories" ON vocabulary_categories;
CREATE POLICY "Users can insert their own categories"
  ON vocabulary_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own categories" ON vocabulary_categories;
CREATE POLICY "Users can update their own categories"
  ON vocabulary_categories FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own categories" ON vocabulary_categories;
CREATE POLICY "Users can delete their own categories"
  ON vocabulary_categories FOR DELETE
  USING (auth.uid() = user_id);

-- user_vocabulary_categories: пользователи видят только свои связи
ALTER TABLE user_vocabulary_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own vocabulary categories" ON user_vocabulary_categories;
CREATE POLICY "Users can view their own vocabulary categories"
  ON user_vocabulary_categories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own vocabulary categories" ON user_vocabulary_categories;
CREATE POLICY "Users can insert their own vocabulary categories"
  ON user_vocabulary_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own vocabulary categories" ON user_vocabulary_categories;
CREATE POLICY "Users can update their own vocabulary categories"
  ON user_vocabulary_categories FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own vocabulary categories" ON user_vocabulary_categories;
CREATE POLICY "Users can delete their own vocabulary categories"
  ON user_vocabulary_categories FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Функция для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_vocabulary_categories_updated_at ON vocabulary_categories;
CREATE TRIGGER update_vocabulary_categories_updated_at
  BEFORE UPDATE ON vocabulary_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Функция для автоматической установки user_id в user_vocabulary_categories
CREATE OR REPLACE FUNCTION sync_vocabulary_categories_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Автоматически устанавливаем user_id из связанного vocabulary
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id
    FROM user_vocabulary
    WHERE id = NEW.vocabulary_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_vocabulary_categories_user_id_trigger ON user_vocabulary_categories;
CREATE TRIGGER sync_vocabulary_categories_user_id_trigger
  BEFORE INSERT ON user_vocabulary_categories
  FOR EACH ROW
  EXECUTE FUNCTION sync_vocabulary_categories_user_id();

-- ============================================================================
-- Views для удобных запросов
-- ============================================================================

-- Представление: слова с их категориями
CREATE OR REPLACE VIEW user_vocabulary_with_categories AS
SELECT 
  uv.id,
  uv.user_id,
  uv.word,
  uv.translations,
  uv.contexts,
  uv.difficulty_level,
  uv.part_of_speech,
  uv.mastery_level,
  uv.times_seen,
  uv.times_practiced,
  uv.notes,
  uv.created_at,
  uv.last_reviewed_at,
  uv.next_review_at,
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
FROM user_vocabulary uv
LEFT JOIN user_vocabulary_categories uvc ON uv.id = uvc.vocabulary_id
LEFT JOIN vocabulary_categories vc ON uvc.category_id = vc.id
GROUP BY uv.id, uv.user_id, uv.word, uv.translations, uv.contexts, 
         uv.difficulty_level, uv.part_of_speech, uv.mastery_level, 
         uv.times_seen, uv.times_practiced, uv.notes, uv.created_at, 
         uv.last_reviewed_at, uv.next_review_at;

-- Представление: категории с количеством слов
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
  COUNT(uvc.vocabulary_id) as word_count
FROM vocabulary_categories vc
LEFT JOIN user_vocabulary_categories uvc ON vc.id = uvc.category_id
GROUP BY vc.id, vc.user_id, vc.name, vc.description, vc.color, vc.icon, 
         vc.created_at, vc.updated_at;

-- ============================================================================
-- Комментарии к таблицам
-- ============================================================================

COMMENT ON TABLE vocabulary_categories IS 'Категории/темы для группировки слов в словаре';
COMMENT ON TABLE user_vocabulary_categories IS 'Связь many-to-many между словами и категориями';
COMMENT ON COLUMN vocabulary_categories.color IS 'Цвет категории в формате hex (например, #3b82f6)';
COMMENT ON COLUMN vocabulary_categories.icon IS 'Иконка категории (emoji или название иконки)';
