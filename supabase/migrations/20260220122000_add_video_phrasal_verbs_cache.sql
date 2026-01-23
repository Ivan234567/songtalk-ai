-- Migration: Add phrasal verbs cache per video
-- Description: Добавляет колонку для хранения результатов анализа фразовых глаголов в видео

ALTER TABLE user_videos
ADD COLUMN IF NOT EXISTS phrasal_verbs JSONB DEFAULT '[]'::jsonb;
