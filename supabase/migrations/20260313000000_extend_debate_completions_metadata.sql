-- Extend debate_completions with metadata for Debate v2 (safe/idempotent).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'debate_completions'
  ) THEN
    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS step_schema_version TEXT DEFAULT 'v2';

    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS micro_goals JSONB;

    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS feedback_json JSONB;
  ELSE
    RAISE NOTICE 'Table debate_completions does not exist. Apply debate_completions migration first.';
  END IF;
END $$;

