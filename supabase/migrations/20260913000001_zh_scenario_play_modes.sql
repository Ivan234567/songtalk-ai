-- Ситуативные диалоги 2.0: режим попытки + лёгкая память сцены.
-- Карточка zh_scenarios не размножается. play_mode — свойство прохождения.

ALTER TABLE roleplay_completions
  ADD COLUMN IF NOT EXISTS play_mode TEXT NOT NULL DEFAULT 'rehearsal';

ALTER TABLE roleplay_completions
  DROP CONSTRAINT IF EXISTS roleplay_completions_play_mode_chk;

ALTER TABLE roleplay_completions
  ADD CONSTRAINT roleplay_completions_play_mode_chk
  CHECK (play_mode IN ('rehearsal', 'life', 'stress'));

COMMENT ON COLUMN roleplay_completions.play_mode IS
  'Режим попытки китайского сценария: rehearsal / life / stress. Старые строки = rehearsal.';

CREATE INDEX IF NOT EXISTS idx_roleplay_completions_user_scenario_mode
  ON roleplay_completions(user_id, scenario_id, play_mode);

CREATE TABLE IF NOT EXISTS zh_scenario_memories (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES zh_scenarios(id) ON DELETE CASCADE,
  facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scenario_id)
);

COMMENT ON TABLE zh_scenario_memories IS
  '1–3 факта прошлой попытки той же китайской сцены. Не «мир», только (user, scenario).';

ALTER TABLE zh_scenario_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zh_scenario_memories_select_own" ON zh_scenario_memories;
CREATE POLICY "zh_scenario_memories_select_own"
  ON zh_scenario_memories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "zh_scenario_memories_upsert_own" ON zh_scenario_memories;
CREATE POLICY "zh_scenario_memories_upsert_own"
  ON zh_scenario_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "zh_scenario_memories_update_own" ON zh_scenario_memories;
CREATE POLICY "zh_scenario_memories_update_own"
  ON zh_scenario_memories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "zh_scenario_memories_delete_own" ON zh_scenario_memories;
CREATE POLICY "zh_scenario_memories_delete_own"
  ON zh_scenario_memories FOR DELETE
  USING (auth.uid() = user_id);

-- Предсказуемые осложнения стресса для системного каталога HSK 1.
UPDATE zh_scenarios
SET payload = payload || jsonb_build_object(
  'stress_twist_ru',
  CASE id::text
    WHEN 'a1080000-0000-4000-8000-000000000001' THEN 'Шумно, однокурсник не расслышал имя и просит повторить.'
    WHEN 'a1080000-0000-4000-8000-000000000002' THEN 'Он перебивает и сначала думает, что ты учитель, не студент.'
    WHEN 'a1080000-0000-4000-8000-000000000003' THEN 'Собеседник путает, кто мама, и надо поправить.'
    WHEN 'a1080000-0000-4000-8000-000000000004' THEN 'Он не расслышал возраст и спрашивает ещё раз.'
    WHEN 'a1080000-0000-4000-8000-000000000005' THEN 'Часы спешат / он занят и просит сказать время ещё раз.'
    WHEN 'a1080000-0000-4000-8000-000000000006' THEN 'Нужного размера нет. Предложи другой или спроси, когда будет.'
    WHEN 'a1080000-0000-4000-8000-000000000007' THEN 'Блюда нет. Надо выбрать другое из того, что есть.'
    WHEN 'a1080000-0000-4000-8000-000000000008' THEN 'Водитель не расслышал адрес школы и торопится.'
    WHEN 'a1080000-0000-4000-8000-000000000009' THEN 'Прохожий сначала показывает не ту сторону, надо уточнить.'
    WHEN 'a1080000-0000-4000-8000-00000000000a' THEN 'Собеседник не согласен с погодой и переспрашивает.'
    ELSE 'Собеседник один раз не расслышал и просит повторить. Цель сцены та же.'
  END
)
WHERE source = 'system'
  AND id IN (
    'a1080000-0000-4000-8000-000000000001',
    'a1080000-0000-4000-8000-000000000002',
    'a1080000-0000-4000-8000-000000000003',
    'a1080000-0000-4000-8000-000000000004',
    'a1080000-0000-4000-8000-000000000005',
    'a1080000-0000-4000-8000-000000000006',
    'a1080000-0000-4000-8000-000000000007',
    'a1080000-0000-4000-8000-000000000008',
    'a1080000-0000-4000-8000-000000000009',
    'a1080000-0000-4000-8000-00000000000a'
  );
