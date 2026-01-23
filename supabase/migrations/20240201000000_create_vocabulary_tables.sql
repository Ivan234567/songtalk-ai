-- Migration: Create vocabulary learning tables
-- Description: Tables for vocabulary learning features in SongTalk AI

-- ============================================================================
-- 1. word_definitions_cache - Кэш определений слов (общая таблица)
-- ============================================================================
-- Хранит переводы, транскрипции и метаданные для всех слов
-- Не требует RLS, так как это общий кэш для всех пользователей

CREATE TABLE IF NOT EXISTS word_definitions_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL UNIQUE, -- Нормализованное слово (lowercase, без пунктуации)
  definitions JSONB NOT NULL DEFAULT '[]'::jsonb, -- Массив переводов: [{"translation": "...", "source": "..."}, ...]
  phonetic_transcription TEXT, -- Фонетическая транскрипция (IPA)
  part_of_speech TEXT, -- noun, verb, adjective, adverb, etc.
  frequency_rank INTEGER, -- Частота слова в языке (1 = самое частое)
  difficulty_level TEXT CHECK (difficulty_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')), -- Уровень CEFR
  is_phrase BOOLEAN DEFAULT FALSE, -- Флаг для фразовых глаголов и идиом
  example_sentences JSONB DEFAULT '[]'::jsonb, -- Примеры использования
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для word_definitions_cache
CREATE INDEX IF NOT EXISTS idx_word_definitions_cache_word ON word_definitions_cache(word);
CREATE INDEX IF NOT EXISTS idx_word_definitions_cache_difficulty ON word_definitions_cache(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_word_definitions_cache_pos ON word_definitions_cache(part_of_speech);

-- ============================================================================
-- 2. user_vocabulary - Персональный словарь пользователя
-- ============================================================================
-- Хранит слова, добавленные пользователем в свой словарь

CREATE TABLE IF NOT EXISTS user_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL, -- Нормализованное слово (lowercase)
  translations JSONB DEFAULT '[]'::jsonb, -- Личные переводы/заметки пользователя
  contexts JSONB DEFAULT '[]'::jsonb, -- Примеры из песен: [{"video_id": "...", "text": "...", "timestamp": ...}, ...]
  difficulty_level TEXT CHECK (difficulty_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  part_of_speech TEXT,
  mastery_level INTEGER DEFAULT 1 CHECK (mastery_level >= 1 AND mastery_level <= 5), -- 1=новое, 5=освоено
  times_seen INTEGER DEFAULT 0, -- Сколько раз встречалось в песнях
  times_practiced INTEGER DEFAULT 0, -- Сколько раз практиковалось
  notes TEXT, -- Личные заметки пользователя
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_reviewed_at TIMESTAMP WITH TIME ZONE, -- Последнее повторение
  next_review_at TIMESTAMP WITH TIME ZONE, -- Следующее повторение (SRS)
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Уникальность: одно слово на пользователя
  UNIQUE(user_id, word)
);

-- Индексы для user_vocabulary
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_id ON user_vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_word ON user_vocabulary(word);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_difficulty ON user_vocabulary(user_id, difficulty_level);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_next_review ON user_vocabulary(user_id, next_review_at) WHERE next_review_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_mastery ON user_vocabulary(user_id, mastery_level);

-- ============================================================================
-- 3. word_occurrences - Слова в песнях
-- ============================================================================
-- Отслеживает, где и когда слова встречаются в песнях

CREATE TABLE IF NOT EXISTS word_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL, -- Нормализованное слово
  video_id UUID NOT NULL REFERENCES user_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Для быстрых запросов
  segment_index INTEGER, -- Индекс сегмента в transcription_segments
  position_in_segment INTEGER, -- Позиция слова в сегменте
  context_text TEXT, -- Текст вокруг слова (предложение или фраза)
  original_text TEXT, -- Оригинальное написание слова в тексте (с заглавными буквами, пунктуацией)
  timestamp_start REAL, -- Время начала произношения слова (секунды)
  timestamp_end REAL, -- Время окончания произношения слова (секунды)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Индекс для быстрого поиска всех вхождений слова в видео
  UNIQUE(word, video_id, segment_index, position_in_segment)
);

-- Индексы для word_occurrences
CREATE INDEX IF NOT EXISTS idx_word_occurrences_word ON word_occurrences(word);
CREATE INDEX IF NOT EXISTS idx_word_occurrences_video_id ON word_occurrences(video_id);
CREATE INDEX IF NOT EXISTS idx_word_occurrences_user_id ON word_occurrences(user_id);
CREATE INDEX IF NOT EXISTS idx_word_occurrences_user_word ON word_occurrences(user_id, word);
CREATE INDEX IF NOT EXISTS idx_word_occurrences_video_segment ON word_occurrences(video_id, segment_index);

-- ============================================================================
-- 4. vocabulary_progress - Прогресс изучения слов
-- ============================================================================
-- Отслеживает прогресс пользователя в изучении конкретных слов

CREATE TABLE IF NOT EXISTS vocabulary_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  added_from_video_id UUID REFERENCES user_videos(id) ON DELETE SET NULL, -- Из какой песни добавлено
  learning_status TEXT NOT NULL DEFAULT 'new' CHECK (learning_status IN ('new', 'learning', 'mastered', 'forgotten')),
  review_count INTEGER DEFAULT 0, -- Количество повторений
  last_review_score REAL CHECK (last_review_score IS NULL OR (last_review_score >= 0 AND last_review_score <= 1)), -- 0-1, где 1 = полностью знает
  consecutive_correct INTEGER DEFAULT 0, -- Подряд правильных ответов
  consecutive_incorrect INTEGER DEFAULT 0, -- Подряд неправильных ответов
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  next_review_at TIMESTAMP WITH TIME ZONE, -- Для алгоритма интервального повторения
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Один прогресс на слово у пользователя
  UNIQUE(user_id, word)
);

-- Индексы для vocabulary_progress
CREATE INDEX IF NOT EXISTS idx_vocabulary_progress_user_id ON vocabulary_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_progress_word ON vocabulary_progress(word);
CREATE INDEX IF NOT EXISTS idx_vocabulary_progress_user_status ON vocabulary_progress(user_id, learning_status);
CREATE INDEX IF NOT EXISTS idx_vocabulary_progress_next_review ON vocabulary_progress(user_id, next_review_at) WHERE next_review_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vocabulary_progress_video ON vocabulary_progress(added_from_video_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- user_vocabulary: пользователи видят только свой словарь
ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own vocabulary" ON user_vocabulary;
CREATE POLICY "Users can view their own vocabulary"
  ON user_vocabulary FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own vocabulary" ON user_vocabulary;
CREATE POLICY "Users can insert their own vocabulary"
  ON user_vocabulary FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own vocabulary" ON user_vocabulary;
CREATE POLICY "Users can update their own vocabulary"
  ON user_vocabulary FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own vocabulary" ON user_vocabulary;
CREATE POLICY "Users can delete their own vocabulary"
  ON user_vocabulary FOR DELETE
  USING (auth.uid() = user_id);

-- word_occurrences: пользователи видят только свои песни
ALTER TABLE word_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view word occurrences in their videos" ON word_occurrences;
CREATE POLICY "Users can view word occurrences in their videos"
  ON word_occurrences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert word occurrences for their videos" ON word_occurrences;
CREATE POLICY "Users can insert word occurrences for their videos"
  ON word_occurrences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update word occurrences in their videos" ON word_occurrences;
CREATE POLICY "Users can update word occurrences in their videos"
  ON word_occurrences FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete word occurrences from their videos" ON word_occurrences;
CREATE POLICY "Users can delete word occurrences from their videos"
  ON word_occurrences FOR DELETE
  USING (auth.uid() = user_id);

-- vocabulary_progress: пользователи видят только свой прогресс
ALTER TABLE vocabulary_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own progress" ON vocabulary_progress;
CREATE POLICY "Users can view their own progress"
  ON vocabulary_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own progress" ON vocabulary_progress;
CREATE POLICY "Users can insert their own progress"
  ON vocabulary_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own progress" ON vocabulary_progress;
CREATE POLICY "Users can update their own progress"
  ON vocabulary_progress FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own progress" ON vocabulary_progress;
CREATE POLICY "Users can delete their own progress"
  ON vocabulary_progress FOR DELETE
  USING (auth.uid() = user_id);

-- word_definitions_cache: читать могут все, писать - только через сервисный ключ
-- Сервисный ключ автоматически обходит RLS, поэтому разрешаем все операции
-- Обычные пользователи могут только читать
ALTER TABLE word_definitions_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view word definitions cache" ON word_definitions_cache;
CREATE POLICY "Anyone can view word definitions cache"
  ON word_definitions_cache FOR SELECT
  USING (true);

-- Пользователи не могут вставлять/обновлять/удалять напрямую (только через backend с сервисным ключом)
-- Backend с сервисным ключом автоматически обходит RLS
DROP POLICY IF EXISTS "Users cannot modify definitions cache" ON word_definitions_cache;
CREATE POLICY "Users cannot modify definitions cache"
  ON word_definitions_cache FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Users cannot update definitions cache" ON word_definitions_cache;
CREATE POLICY "Users cannot update definitions cache"
  ON word_definitions_cache FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "Users cannot delete definitions cache" ON word_definitions_cache;
CREATE POLICY "Users cannot delete definitions cache"
  ON word_definitions_cache FOR DELETE
  USING (false);

-- ============================================================================
-- Triggers and Functions
-- ============================================================================

-- Функция для автоматического обновления updated_at
-- (уже существует, но добавим для новых таблиц)
DROP TRIGGER IF EXISTS update_user_vocabulary_updated_at ON user_vocabulary;
CREATE TRIGGER update_user_vocabulary_updated_at
  BEFORE UPDATE ON user_vocabulary
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vocabulary_progress_updated_at ON vocabulary_progress;
CREATE TRIGGER update_vocabulary_progress_updated_at
  BEFORE UPDATE ON vocabulary_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_word_definitions_cache_updated_at ON word_definitions_cache;
CREATE TRIGGER update_word_definitions_cache_updated_at
  BEFORE UPDATE ON word_definitions_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Функция для нормализации слова (удаление пунктуации, lowercase)
CREATE OR REPLACE FUNCTION normalize_word(input_word TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Приводим к lowercase и удаляем пунктуацию в начале/конце
  -- Оставляем апострофы для слов типа "don't", "I'm"
  RETURN LOWER(TRIM(REGEXP_REPLACE(input_word, '^[^a-zA-Z0-9'']+|[^a-zA-Z0-9'']+$', '', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Функция для синхронизации user_id в word_occurrences с user_videos
CREATE OR REPLACE FUNCTION sync_word_occurrences_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Автоматически устанавливаем user_id из связанного video
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id
    FROM user_videos
    WHERE id = NEW.video_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_word_occurrences_user_id_trigger ON word_occurrences;
CREATE TRIGGER sync_word_occurrences_user_id_trigger
  BEFORE INSERT ON word_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION sync_word_occurrences_user_id();

-- Функция для автоматического создания vocabulary_progress при добавлении слова в user_vocabulary
CREATE OR REPLACE FUNCTION create_vocabulary_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Создаем запись прогресса, если её еще нет
  -- Устанавливаем next_review_at = NOW() для немедленного повторения
  INSERT INTO vocabulary_progress (user_id, word, added_from_video_id, learning_status, next_review_at)
  VALUES (NEW.user_id, NEW.word, NULL, 'new', NOW())
  ON CONFLICT (user_id, word) DO UPDATE SET
    next_review_at = COALESCE(vocabulary_progress.next_review_at, NOW())
  WHERE vocabulary_progress.next_review_at IS NULL;
  
  -- Также обновляем next_review_at в user_vocabulary, если он NULL
  UPDATE user_vocabulary
  SET next_review_at = NOW()
  WHERE id = NEW.id AND next_review_at IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_vocabulary_progress_trigger ON user_vocabulary;
CREATE TRIGGER create_vocabulary_progress_trigger
  AFTER INSERT ON user_vocabulary
  FOR EACH ROW
  EXECUTE FUNCTION create_vocabulary_progress();

-- ============================================================================
-- Views для удобных запросов
-- ============================================================================

-- Представление: слова пользователя с определениями и прогрессом
CREATE OR REPLACE VIEW user_vocabulary_with_details AS
SELECT 
  uv.id,
  uv.user_id,
  uv.word,
  uv.translations as user_translations,
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
  wdc.definitions as cached_definitions,
  wdc.phonetic_transcription,
  wdc.frequency_rank,
  wdc.example_sentences,
  vp.learning_status,
  vp.review_count,
  vp.last_review_score,
  vp.consecutive_correct,
  vp.consecutive_incorrect
FROM user_vocabulary uv
LEFT JOIN word_definitions_cache wdc ON uv.word = wdc.word
LEFT JOIN vocabulary_progress vp ON uv.user_id = vp.user_id AND uv.word = vp.word;

-- Представление: слова для повторения сегодня (SRS)
CREATE OR REPLACE VIEW words_to_review_today AS
SELECT 
  uv.user_id,
  uv.word,
  uv.next_review_at,
  vp.learning_status,
  vp.review_count,
  vp.last_review_score
FROM user_vocabulary uv
JOIN vocabulary_progress vp ON uv.user_id = vp.user_id AND uv.word = vp.word
WHERE uv.next_review_at IS NOT NULL
  AND uv.next_review_at <= NOW()
  AND vp.learning_status != 'mastered'
ORDER BY uv.next_review_at ASC;

-- Представление: статистика по словам пользователя
CREATE OR REPLACE VIEW user_vocabulary_stats AS
SELECT 
  user_id,
  COUNT(*) as total_words,
  COUNT(*) FILTER (WHERE mastery_level = 5) as mastered_words,
  COUNT(*) FILTER (WHERE mastery_level >= 3) as learning_words,
  COUNT(*) FILTER (WHERE mastery_level = 1) as new_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'A1') as a1_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'A2') as a2_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'B1') as b1_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'B2') as b2_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'C1') as c1_words,
  COUNT(*) FILTER (WHERE difficulty_level = 'C2') as c2_words,
  SUM(times_seen) as total_times_seen,
  SUM(times_practiced) as total_times_practiced,
  COUNT(*) FILTER (WHERE next_review_at IS NOT NULL AND next_review_at <= NOW()) as words_to_review
FROM user_vocabulary
GROUP BY user_id;

-- ============================================================================
-- Комментарии к таблицам и колонкам
-- ============================================================================

COMMENT ON TABLE word_definitions_cache IS 'Кэш определений слов - общая таблица для всех пользователей';
COMMENT ON TABLE user_vocabulary IS 'Персональный словарь пользователя';
COMMENT ON TABLE word_occurrences IS 'Вхождения слов в песнях пользователей';
COMMENT ON TABLE vocabulary_progress IS 'Прогресс изучения слов пользователем';

COMMENT ON COLUMN user_vocabulary.mastery_level IS '1 = новое, 2-3 = изучаю, 4-5 = освоено';
COMMENT ON COLUMN vocabulary_progress.last_review_score IS '0.0 = не знает, 1.0 = полностью знает';
COMMENT ON COLUMN word_occurrences.original_text IS 'Оригинальное написание слова в тексте (с заглавными буквами)';
