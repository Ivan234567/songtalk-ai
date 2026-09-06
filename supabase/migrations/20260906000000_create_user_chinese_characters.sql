-- Migration: Create user_chinese_characters
-- Description: Отдельный словарь иероглифов (汉字) для китайского режима

-- ============================================================================
-- 1. user_chinese_characters — персональный словарь иероглифов
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_chinese_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character TEXT NOT NULL,
  pinyin TEXT,
  translations JSONB DEFAULT '[]'::jsonb,
  radical TEXT,
  stroke_count INTEGER CHECK (stroke_count IS NULL OR stroke_count > 0),
  hsk_level INTEGER CHECK (hsk_level IS NULL OR (hsk_level >= 1 AND hsk_level <= 6)),
  notes TEXT,
  mastery_level INTEGER DEFAULT 1 CHECK (mastery_level >= 1 AND mastery_level <= 5),
  times_seen INTEGER DEFAULT 0,
  times_practiced INTEGER DEFAULT 0,
  contexts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  next_review_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, character),
  CONSTRAINT user_chinese_characters_single_hanzi CHECK (
    char_length(character) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_user_chinese_characters_user_id
  ON user_chinese_characters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_chinese_characters_hsk
  ON user_chinese_characters(user_id, hsk_level);
CREATE INDEX IF NOT EXISTS idx_user_chinese_characters_pinyin
  ON user_chinese_characters(user_id, pinyin);
CREATE INDEX IF NOT EXISTS idx_user_chinese_characters_next_review
  ON user_chinese_characters(user_id, next_review_at)
  WHERE next_review_at IS NOT NULL;

ALTER TABLE user_chinese_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own chinese characters" ON user_chinese_characters;
CREATE POLICY "Users can view their own chinese characters"
  ON user_chinese_characters FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own chinese characters" ON user_chinese_characters;
CREATE POLICY "Users can insert their own chinese characters"
  ON user_chinese_characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own chinese characters" ON user_chinese_characters;
CREATE POLICY "Users can update their own chinese characters"
  ON user_chinese_characters FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own chinese characters" ON user_chinese_characters;
CREATE POLICY "Users can delete their own chinese characters"
  ON user_chinese_characters FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_chinese_characters_updated_at ON user_chinese_characters;
CREATE TRIGGER update_user_chinese_characters_updated_at
  BEFORE UPDATE ON user_chinese_characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_chinese_characters IS 'Персональный словарь иероглифов (汉字) для китайского режима';
COMMENT ON COLUMN user_chinese_characters.character IS 'Один иероглиф (simplified Chinese)';
COMMENT ON COLUMN user_chinese_characters.pinyin IS 'Пиньинь с тонами';
COMMENT ON COLUMN user_chinese_characters.radical IS 'Ключ / радикал (部首)';
COMMENT ON COLUMN user_chinese_characters.stroke_count IS 'Количество черт';
COMMENT ON COLUMN user_chinese_characters.hsk_level IS 'HSK уровень 1–6';
