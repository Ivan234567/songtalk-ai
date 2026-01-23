-- Migration: Fix existing words without next_review_at
-- Description: Устанавливает next_review_at для существующих слов, у которых его нет

-- Обновляем vocabulary_progress - устанавливаем next_review_at для всех слов, где он NULL
UPDATE vocabulary_progress
SET next_review_at = NOW()
WHERE next_review_at IS NULL;

-- Обновляем user_vocabulary - устанавливаем next_review_at для всех слов, где он NULL
UPDATE user_vocabulary
SET next_review_at = NOW()
WHERE next_review_at IS NULL;
