-- Debate completions: snapshot metadata about topic source and normalization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'debate_completions'
  ) THEN
    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS topic_source TEXT CHECK (topic_source IN ('catalog', 'custom'));

    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS topic_original TEXT;

    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS topic_normalized TEXT;

    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS topic_language TEXT;

    ALTER TABLE public.debate_completions
      ADD COLUMN IF NOT EXISTS topic_validation_status TEXT CHECK (topic_validation_status IN ('valid', 'warning', 'rejected'));

    CREATE INDEX IF NOT EXISTS idx_debate_completions_user_topic_source_completed
      ON public.debate_completions(user_id, topic_source, completed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_debate_completions_user_topic_normalized
      ON public.debate_completions(user_id, topic_normalized)
      WHERE topic_normalized IS NOT NULL;
  ELSE
    RAISE NOTICE 'Table debate_completions does not exist. Apply debate_completions migration first.';
  END IF;
END $$;

