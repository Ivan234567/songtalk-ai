-- Несколько чатов с ИИ на пользователя (как в ChatGPT): список чатов, удаление
-- Переименовываем старую таблицу и создаём новую структуру
ALTER TABLE IF EXISTS ai_chat_sessions RENAME TO ai_chat_sessions_old;

CREATE TABLE ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Новый чат',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_chat_sessions_user_updated ON ai_chat_sessions(user_id, updated_at DESC);

-- Перенос данных: один старый чат → одна запись с id и заголовком из первого сообщения
INSERT INTO ai_chat_sessions (id, user_id, title, messages, created_at, updated_at)
SELECT
  gen_random_uuid(),
  user_id,
  COALESCE(
    NULLIF(TRIM(
      LEFT(
        (messages->0->>'content'),
        80
      )
    ), ''),
    'Чат'
  ),
  messages,
  COALESCE((updated_at - INTERVAL '1 second'), NOW()),
  updated_at
FROM ai_chat_sessions_old;

DROP TABLE ai_chat_sessions_old;

ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_chat_sessions"
  ON ai_chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_chat_sessions"
  ON ai_chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_chat_sessions"
  ON ai_chat_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai_chat_sessions"
  ON ai_chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE ai_chat_sessions IS 'AI chat sessions (ИИ in agent): multiple chats per user, each with title and messages';
