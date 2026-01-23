-- Migration: Add idioms cache per video
-- Description: Добавляет колонку для хранения результатов анализа идиом в видео

ALTER TABLE user_videos
ADD COLUMN IF NOT EXISTS idioms JSONB DEFAULT '[]'::jsonb;

