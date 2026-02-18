-- Debate sessions: add metadata for topic origin/normalization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'debate_sessions'
  ) THEN
    ALTER TABLE public.debate_sessions
      ADD COLUMN IF NOT EXISTS topic_source TEXT CHECK (topic_source IN ('catalog', 'custom'));

    ALTER TABLE public.debate_sessions
      ADD COLUMN IF NOT EXISTS topic_original TEXT;

    ALTER TABLE public.debate_sessions
      ADD COLUMN IF NOT EXISTS topic_normalized TEXT;

    ALTER TABLE public.debate_sessions
      ADD COLUMN IF NOT EXISTS topic_language TEXT;

    ALTER TABLE public.debate_sessions
      ADD COLUMN IF NOT EXISTS topic_validation_status TEXT CHECK (topic_validation_status IN ('valid', 'warning', 'rejected'));

    CREATE INDEX IF NOT EXISTS idx_debate_sessions_user_topic_source_created
      ON public.debate_sessions(user_id, topic_source, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_debate_sessions_user_topic_normalized
      ON public.debate_sessions(user_id, topic_normalized)
      WHERE topic_normalized IS NOT NULL;
  ELSE
    RAISE NOTICE 'Table debate_sessions does not exist. Apply debate_sessions migration first.';
  END IF;
END $$;

