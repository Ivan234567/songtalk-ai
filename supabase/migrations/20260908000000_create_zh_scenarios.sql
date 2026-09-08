-- Китайские сценарии (MVP этап 1): карточка, шаги, словарь.
-- Английские user_roleplay_scenarios не меняем.

CREATE TABLE IF NOT EXISTS zh_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system')),
  title TEXT NOT NULL,
  description TEXT,
  hsk_level SMALLINT CHECK (hsk_level IS NULL OR (hsk_level >= 1 AND hsk_level <= 6)),
  textbook_title TEXT,
  lesson_no TEXT,
  starter TEXT NOT NULL DEFAULT 'ai' CHECK (starter IN ('ai', 'user')),
  formality TEXT NOT NULL DEFAULT 'nin' CHECK (formality IN ('ni', 'nin', 'mixed')),
  slang_mode TEXT NOT NULL DEFAULT 'off' CHECK (slang_mode IN ('off', 'light')),
  archived BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT zh_scenarios_source_owner_chk CHECK (
    (source = 'user' AND user_id IS NOT NULL)
    OR (source = 'system' AND user_id IS NULL)
  )
);

COMMENT ON TABLE zh_scenarios IS 'Китайские ролевые сценарии: пользовательские и системные';
COMMENT ON COLUMN zh_scenarios.payload IS 'Полный JSON-контракт (goals, openings, user_role, steps/vocab дублируются в дочерних таблицах)';
COMMENT ON COLUMN zh_scenarios.lesson_no IS 'Свободный текст: Урок 12, Unit 3';
COMMENT ON COLUMN zh_scenarios.starter IS 'Кто начинает по умолчанию: ai (собеседник) или user';

CREATE INDEX IF NOT EXISTS idx_zh_scenarios_user_archived
  ON zh_scenarios(user_id, archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_zh_scenarios_source
  ON zh_scenarios(source);
CREATE INDEX IF NOT EXISTS idx_zh_scenarios_hsk
  ON zh_scenarios(hsk_level);
CREATE INDEX IF NOT EXISTS idx_zh_scenarios_textbook
  ON zh_scenarios(textbook_title);

CREATE TABLE IF NOT EXISTS zh_scenario_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES zh_scenarios(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title_ru TEXT NOT NULL,
  expected_user_action TEXT NOT NULL,
  ai_context TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  example_zh TEXT,
  UNIQUE (scenario_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_zh_scenario_steps_scenario
  ON zh_scenario_steps(scenario_id, sort_order);

CREATE TABLE IF NOT EXISTS zh_scenario_vocab (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES zh_scenarios(id) ON DELETE CASCADE,
  hanzi TEXT NOT NULL,
  pinyin TEXT NOT NULL DEFAULT '',
  translation_ru TEXT NOT NULL DEFAULT '',
  hsk_level SMALLINT CHECK (hsk_level IS NULL OR (hsk_level >= 1 AND hsk_level <= 6)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_zh_scenario_vocab_scenario
  ON zh_scenario_vocab(scenario_id, sort_order);

ALTER TABLE zh_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE zh_scenario_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE zh_scenario_vocab ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zh_scenarios_select_own_or_system"
  ON zh_scenarios FOR SELECT
  USING (source = 'system' OR auth.uid() = user_id);

CREATE POLICY "zh_scenarios_insert_own"
  ON zh_scenarios FOR INSERT
  WITH CHECK (source = 'user' AND auth.uid() = user_id);

CREATE POLICY "zh_scenarios_update_own"
  ON zh_scenarios FOR UPDATE
  USING (source = 'user' AND auth.uid() = user_id);

CREATE POLICY "zh_scenarios_delete_own"
  ON zh_scenarios FOR DELETE
  USING (source = 'user' AND auth.uid() = user_id);

CREATE POLICY "zh_scenario_steps_select"
  ON zh_scenario_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM zh_scenarios s
      WHERE s.id = scenario_id
        AND (s.source = 'system' OR s.user_id = auth.uid())
    )
  );

CREATE POLICY "zh_scenario_steps_mutate_own"
  ON zh_scenario_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM zh_scenarios s
      WHERE s.id = scenario_id
        AND s.source = 'user'
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zh_scenarios s
      WHERE s.id = scenario_id
        AND s.source = 'user'
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "zh_scenario_vocab_select"
  ON zh_scenario_vocab FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM zh_scenarios s
      WHERE s.id = scenario_id
        AND (s.source = 'system' OR s.user_id = auth.uid())
    )
  );

CREATE POLICY "zh_scenario_vocab_mutate_own"
  ON zh_scenario_vocab FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM zh_scenarios s
      WHERE s.id = scenario_id
        AND s.source = 'user'
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zh_scenarios s
      WHERE s.id = scenario_id
        AND s.source = 'user'
        AND s.user_id = auth.uid()
    )
  );

ALTER TABLE roleplay_completions
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'zh'));

COMMENT ON COLUMN roleplay_completions.language IS 'Язык сценария: en или zh';

CREATE INDEX IF NOT EXISTS idx_roleplay_completions_user_language
  ON roleplay_completions(user_id, language, completed_at DESC);
