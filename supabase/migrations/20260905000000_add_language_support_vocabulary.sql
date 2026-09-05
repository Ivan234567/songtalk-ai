-- Migration: Add language support to vocabulary tables
-- Description: Добавляет поддержку китайского языка в словарь (Ступень 3)

-- ============================================================================
-- 1. Добавить колонку language в word_definitions_cache
-- ============================================================================

-- Сначала удаляем старый unique constraint и делаем составной ключ (word, language)
ALTER TABLE word_definitions_cache 
  DROP CONSTRAINT IF EXISTS word_definitions_cache_word_key;

-- Добавляем колонку language
ALTER TABLE word_definitions_cache
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'zh'));

-- Создаем составной unique constraint (word, language)
-- Сначала проверяем, не существует ли уже constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'word_definitions_cache_word_language_key'
  ) THEN
    ALTER TABLE word_definitions_cache
      ADD CONSTRAINT word_definitions_cache_word_language_key UNIQUE (word, language);
  END IF;
END $$;

-- Обновляем индексы
DROP INDEX IF EXISTS idx_word_definitions_cache_word;
CREATE INDEX IF NOT EXISTS idx_word_definitions_cache_word_language 
  ON word_definitions_cache(word, language);

-- Для китайского языка добавляем дополнительные поля
ALTER TABLE word_definitions_cache
  ADD COLUMN IF NOT EXISTS pinyin TEXT, -- Пиньинь для китайских слов
  ADD COLUMN IF NOT EXISTS hsk_level INTEGER CHECK (hsk_level IS NULL OR (hsk_level >= 1 AND hsk_level <= 6)); -- HSK 1-6

CREATE INDEX IF NOT EXISTS idx_word_definitions_cache_hsk ON word_definitions_cache(hsk_level) WHERE language = 'zh';

-- ============================================================================
-- 2. Добавить колонку language в user_vocabulary
-- ============================================================================

ALTER TABLE user_vocabulary
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'zh'));

-- Обновляем unique constraint: (user_id, word, language)
ALTER TABLE user_vocabulary 
  DROP CONSTRAINT IF EXISTS user_vocabulary_user_id_word_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_vocabulary_user_id_word_language_key'
  ) THEN
    ALTER TABLE user_vocabulary
      ADD CONSTRAINT user_vocabulary_user_id_word_language_key UNIQUE (user_id, word, language);
  END IF;
END $$;

-- Обновляем индексы
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_language ON user_vocabulary(user_id, language);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_difficulty_lang 
  ON user_vocabulary(user_id, difficulty_level, language);

-- Добавляем поля для китайского
ALTER TABLE user_vocabulary
  ADD COLUMN IF NOT EXISTS pinyin TEXT, -- Пиньинь для китайских слов
  ADD COLUMN IF NOT EXISTS hsk_level INTEGER CHECK (hsk_level IS NULL OR (hsk_level >= 1 AND hsk_level <= 6)); -- HSK уровень

-- ============================================================================
-- 3. Добавить колонку language в user_idioms
-- ============================================================================

ALTER TABLE user_idioms
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'zh'));

-- Обновляем unique constraint: (user_id, phrase, language)
ALTER TABLE user_idioms
  DROP CONSTRAINT IF EXISTS user_idioms_user_id_phrase_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_idioms_user_id_phrase_language_key'
  ) THEN
    ALTER TABLE user_idioms
      ADD CONSTRAINT user_idioms_user_id_phrase_language_key UNIQUE (user_id, phrase, language);
  END IF;
END $$;

-- Добавляем индекс для фильтрации по языку
CREATE INDEX IF NOT EXISTS idx_user_idioms_language ON user_idioms(user_id, language);

-- Добавляем поля для китайских 成语
ALTER TABLE user_idioms
  ADD COLUMN IF NOT EXISTS pinyin TEXT, -- Пиньинь для китайских идиом
  ADD COLUMN IF NOT EXISTS category TEXT; -- Категория идиомы (для Chinese можно хранить тип 成语)

-- ============================================================================
-- 4. Обновить vocabulary_progress с учетом языка
-- ============================================================================

ALTER TABLE vocabulary_progress
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'zh'));

-- Обновляем unique constraint: (user_id, word, language)
ALTER TABLE vocabulary_progress
  DROP CONSTRAINT IF EXISTS vocabulary_progress_user_id_word_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'vocabulary_progress_user_id_word_language_key'
  ) THEN
    ALTER TABLE vocabulary_progress
      ADD CONSTRAINT vocabulary_progress_user_id_word_language_key UNIQUE (user_id, word, language);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vocabulary_progress_language 
  ON vocabulary_progress(user_id, language);

-- ============================================================================
-- 5. Обновить word_occurrences с учетом языка
-- ============================================================================

ALTER TABLE word_occurrences
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'zh'));

-- Обновляем unique constraint: (word, video_id, segment_index, position_in_segment, language)
ALTER TABLE word_occurrences
  DROP CONSTRAINT IF EXISTS word_occurrences_word_video_id_segment_index_position_in_se_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'word_occurrences_word_video_lang_key'
  ) THEN
    ALTER TABLE word_occurrences
      ADD CONSTRAINT word_occurrences_word_video_lang_key 
      UNIQUE (word, video_id, segment_index, position_in_segment, language);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_word_occurrences_language 
  ON word_occurrences(user_id, language);

-- ============================================================================
-- 6. Обновить триггеры и функции
-- ============================================================================

-- Обновляем функцию создания vocabulary_progress с учетом языка
DROP FUNCTION IF EXISTS create_vocabulary_progress() CASCADE;
CREATE OR REPLACE FUNCTION create_vocabulary_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Создаем запись прогресса с учетом языка
  INSERT INTO vocabulary_progress (user_id, word, language, added_from_video_id, learning_status, next_review_at)
  VALUES (NEW.user_id, NEW.word, NEW.language, NULL, 'new', NOW())
  ON CONFLICT (user_id, word, language) DO UPDATE SET
    next_review_at = COALESCE(vocabulary_progress.next_review_at, NOW())
  WHERE vocabulary_progress.next_review_at IS NULL;
  
  -- Также обновляем next_review_at в user_vocabulary, если он NULL
  UPDATE user_vocabulary
  SET next_review_at = NOW()
  WHERE id = NEW.id AND next_review_at IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Пересоздаем триггер
DROP TRIGGER IF EXISTS create_vocabulary_progress_trigger ON user_vocabulary;
CREATE TRIGGER create_vocabulary_progress_trigger
  AFTER INSERT ON user_vocabulary
  FOR EACH ROW
  EXECUTE FUNCTION create_vocabulary_progress();

-- ============================================================================
-- 7. Обновить представления (views)
-- ============================================================================

-- Обновляем view с учетом новых полей
DROP VIEW IF EXISTS user_vocabulary_with_details;
CREATE OR REPLACE VIEW user_vocabulary_with_details AS
SELECT 
  uv.id,
  uv.user_id,
  uv.word,
  uv.language,
  uv.translations as user_translations,
  uv.contexts,
  uv.difficulty_level,
  uv.hsk_level,
  uv.pinyin,
  uv.part_of_speech,
  uv.mastery_level,
  uv.times_seen,
  uv.times_practiced,
  uv.notes,
  uv.created_at,
  uv.last_reviewed_at,
  uv.next_review_at,
  wdc.definitions as cached_definitions,
  wdc.phonetic_transcription,
  wdc.frequency_rank,
  wdc.example_sentences,
  wdc.pinyin as cached_pinyin,
  wdc.hsk_level as cached_hsk_level,
  vp.learning_status,
  vp.review_count,
  vp.last_review_score,
  vp.consecutive_correct,
  vp.consecutive_incorrect
FROM user_vocabulary uv
LEFT JOIN word_definitions_cache wdc ON uv.word = wdc.word AND uv.language = wdc.language
LEFT JOIN vocabulary_progress vp ON uv.user_id = vp.user_id AND uv.word = vp.word AND uv.language = vp.language;

-- Обновляем view для слов на повторение
DROP VIEW IF EXISTS words_to_review_today;
CREATE OR REPLACE VIEW words_to_review_today AS
SELECT 
  uv.user_id,
  uv.word,
  uv.language,
  uv.next_review_at,
  vp.learning_status,
  vp.review_count,
  vp.last_review_score
FROM user_vocabulary uv
JOIN vocabulary_progress vp ON uv.user_id = vp.user_id AND uv.word = vp.word AND uv.language = vp.language
WHERE uv.next_review_at IS NOT NULL
  AND uv.next_review_at <= NOW()
  AND vp.learning_status != 'mastered'
ORDER BY uv.next_review_at ASC;

-- Обновляем статистику с разделением по языкам
DROP VIEW IF EXISTS user_vocabulary_stats;
CREATE OR REPLACE VIEW user_vocabulary_stats AS
SELECT 
  user_id,
  language,
  COUNT(*) as total_words,
  COUNT(*) FILTER (WHERE mastery_level = 5) as mastered_words,
  COUNT(*) FILTER (WHERE mastery_level >= 3) as learning_words,
  COUNT(*) FILTER (WHERE mastery_level = 1) as new_words,
  -- CEFR для английского
  COUNT(*) FILTER (WHERE difficulty_level = 'A1') as a1_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'A2') as a2_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'B1') as b1_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'B2') as b2_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'C1') as c1_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'C2') as c2_words,
  -- HSK для китайского
  COUNT(*) FILTER (WHERE hsk_level = 1) as hsk1_words,
  COUNT(*) FILTER (WHERE hsk_level = 2) as hsk2_words,
  COUNT(*) FILTER (WHERE hsk_level = 3) as hsk3_words,
  COUNT(*) FILTER (WHERE hsk_level = 4) as hsk4_words,
  COUNT(*) FILTER (WHERE hsk_level = 5) as hsk5_words,
  COUNT(*) FILTER (WHERE hsk_level = 6) as hsk6_words,
  SUM(times_seen) as total_times_seen,
  SUM(times_practiced) as total_times_practiced,
  COUNT(*) FILTER (WHERE next_review_at IS NOT NULL AND next_review_at <= NOW()) as words_to_review
FROM user_vocabulary
GROUP BY user_id, language;

-- ============================================================================
-- 8. Комментарии
-- ============================================================================

COMMENT ON COLUMN user_vocabulary.language IS 'Язык слова: en (English) или zh (Chinese)';
COMMENT ON COLUMN user_vocabulary.pinyin IS 'Пиньинь для китайских слов';
COMMENT ON COLUMN user_vocabulary.hsk_level IS 'HSK уровень (1-6) для китайских слов';
COMMENT ON COLUMN user_idioms.language IS 'Язык идиомы: en (English idioms) или zh (成语)';
COMMENT ON COLUMN word_definitions_cache.language IS 'Язык определения: en или zh';
COMMENT ON COLUMN word_definitions_cache.pinyin IS 'Пиньинь для китайских слов';
COMMENT ON COLUMN word_definitions_cache.hsk_level IS 'HSK уровень (1-6) для китайских слов';
