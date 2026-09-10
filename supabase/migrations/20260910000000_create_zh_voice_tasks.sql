-- Китайские голосовые задания: одно высказывание, не диалог.
-- Ролевые zh_scenarios / roleplay_completions не меняем.

CREATE TABLE IF NOT EXISTS zh_voice_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system')),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'voicemail'
    CHECK (type IN ('voicemail', 'explain', 'retell', 'picture')),
  hsk_level SMALLINT CHECK (hsk_level IS NULL OR (hsk_level >= 1 AND hsk_level <= 6)),
  archived BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT zh_voice_tasks_source_owner_chk CHECK (
    (source = 'user' AND user_id IS NOT NULL)
    OR (source = 'system' AND user_id IS NULL)
  )
);

COMMENT ON TABLE zh_voice_tasks IS 'Китайские голосовые задания: одно высказывание без персонажа';
COMMENT ON COLUMN zh_voice_tasks.payload IS 'JSON-контракт: instruction, checklist, vocabulary, stimulus, model_answer';
COMMENT ON COLUMN zh_voice_tasks.type IS 'voicemail | explain | retell | picture';

CREATE INDEX IF NOT EXISTS idx_zh_voice_tasks_user_archived
  ON zh_voice_tasks(user_id, archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_zh_voice_tasks_source
  ON zh_voice_tasks(source);
CREATE INDEX IF NOT EXISTS idx_zh_voice_tasks_hsk_type
  ON zh_voice_tasks(hsk_level, type);

CREATE TABLE IF NOT EXISTS zh_voice_task_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES zh_voice_tasks(id) ON DELETE SET NULL,
  hsk_level SMALLINT CHECK (hsk_level IS NULL OR (hsk_level >= 1 AND hsk_level <= 6)),
  transcript TEXT,
  duration_sec INTEGER,
  checklist_result JSONB,
  feedback TEXT,
  model_answer_zh TEXT,
  status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'checked', 'abandoned')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE zh_voice_task_attempts IS 'Попытки голосового задания; не смешивать с roleplay_completions';

CREATE INDEX IF NOT EXISTS idx_zh_voice_task_attempts_user_created
  ON zh_voice_task_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zh_voice_task_attempts_task
  ON zh_voice_task_attempts(task_id, created_at DESC);

ALTER TABLE zh_voice_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE zh_voice_task_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zh_voice_tasks_select_own_or_system"
  ON zh_voice_tasks FOR SELECT
  USING (source = 'system' OR auth.uid() = user_id);

CREATE POLICY "zh_voice_tasks_insert_own"
  ON zh_voice_tasks FOR INSERT
  WITH CHECK (source = 'user' AND auth.uid() = user_id);

CREATE POLICY "zh_voice_tasks_update_own"
  ON zh_voice_tasks FOR UPDATE
  USING (source = 'user' AND auth.uid() = user_id);

CREATE POLICY "zh_voice_tasks_delete_own"
  ON zh_voice_tasks FOR DELETE
  USING (source = 'user' AND auth.uid() = user_id);

CREATE POLICY "zh_voice_task_attempts_select_own"
  ON zh_voice_task_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "zh_voice_task_attempts_insert_own"
  ON zh_voice_task_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "zh_voice_task_attempts_update_own"
  ON zh_voice_task_attempts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "zh_voice_task_attempts_delete_own"
  ON zh_voice_task_attempts FOR DELETE
  USING (auth.uid() = user_id);
