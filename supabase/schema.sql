-- Пример схемы для тестирования real-time
-- Выполните этот SQL в Supabase SQL Editor

-- Создание тестовой таблицы
CREATE TABLE IF NOT EXISTS test_table (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Включение Realtime для таблицы
ALTER PUBLICATION supabase_realtime ADD TABLE test_table;

-- Создание индекса для производительности
CREATE INDEX IF NOT EXISTS idx_test_table_created_at ON test_table(created_at);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_test_table_updated_at 
    BEFORE UPDATE ON test_table 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Пример таблицы для SongTalk AI (можно расширить)
CREATE TABLE IF NOT EXISTS songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  lyrics TEXT,
  audio_url TEXT,
  difficulty_level INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Включение Realtime для таблицы songs
ALTER PUBLICATION supabase_realtime ADD TABLE songs;

-- Индексы для songs
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_difficulty ON songs(difficulty_level);

-- Триггер для songs
CREATE TRIGGER update_songs_updated_at 
    BEFORE UPDATE ON songs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Пример таблицы для пользовательского прогресса
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
  words_learned INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Включение Realtime для user_progress
ALTER PUBLICATION supabase_realtime ADD TABLE user_progress;

-- Индексы для user_progress
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_song_id ON user_progress(song_id);

-- Триггер для user_progress
CREATE TRIGGER update_user_progress_updated_at 
    BEFORE UPDATE ON user_progress 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
