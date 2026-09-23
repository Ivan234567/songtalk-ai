-- «Моя ситуация»: карманные фразы, которые не обязаны прозвучать и которые ИИ не преподаёт.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'zh_scenario_vocab'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%usage%'
  LOOP
    EXECUTE format('ALTER TABLE zh_scenario_vocab DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE zh_scenario_vocab
  ADD CONSTRAINT zh_scenario_vocab_usage_check
  CHECK (usage IN ('must_say', 'model', 'pocket'));

COMMENT ON COLUMN zh_scenario_vocab.usage IS
  'must_say — ученик должен сказать сам; model — ИИ использует в своих репликах; pocket — фраза на случай, произносить не обязательно';
