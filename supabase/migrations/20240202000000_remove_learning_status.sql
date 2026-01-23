-- Migration: Remove learning_status from vocabulary_progress
-- Description: Remove learning_status column and related indexes/views

-- ============================================================================
-- 1. Update views to remove learning_status (MUST BE DONE BEFORE DROPPING COLUMN)
-- ============================================================================

-- Update words_to_review_today view first (it directly references learning_status)
DROP VIEW IF EXISTS words_to_review_today;

CREATE OR REPLACE VIEW words_to_review_today AS
SELECT 
  uv.user_id,
  uv.word,
  uv.next_review_at,
  vp.review_count,
  vp.last_review_score
FROM user_vocabulary uv
JOIN vocabulary_progress vp ON uv.user_id = vp.user_id AND uv.word = vp.word
WHERE uv.next_review_at IS NOT NULL
  AND uv.next_review_at <= NOW()
ORDER BY uv.next_review_at ASC;

-- Update user_vocabulary_with_details view
DROP VIEW IF EXISTS user_vocabulary_with_details;

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
  vp.review_count,
  vp.last_review_score,
  vp.consecutive_correct,
  vp.consecutive_incorrect
FROM user_vocabulary uv
LEFT JOIN word_definitions_cache wdc ON uv.word = wdc.word
LEFT JOIN vocabulary_progress vp ON uv.user_id = vp.user_id AND uv.word = vp.word;

-- ============================================================================
-- 2. Drop index on learning_status
-- ============================================================================
DROP INDEX IF EXISTS idx_vocabulary_progress_user_status;

-- ============================================================================
-- 3. Remove learning_status column from vocabulary_progress
-- ============================================================================
ALTER TABLE vocabulary_progress DROP COLUMN IF EXISTS learning_status;

-- ============================================================================
-- 5. Update trigger function to remove learning_status
-- ============================================================================
CREATE OR REPLACE FUNCTION create_vocabulary_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Создаем запись прогресса, если её еще нет
  -- Устанавливаем next_review_at = NOW() для немедленного повторения
  INSERT INTO vocabulary_progress (user_id, word, added_from_video_id, next_review_at)
  VALUES (NEW.user_id, NEW.word, NULL, NOW())
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
