-- Extend debate_sessions table: add completed_step_ids, difficulty, feedback, assessment_id
-- All fields are nullable for backward compatibility
-- This migration assumes debate_sessions table already exists (created by 20260307000000_create_debate_sessions.sql)

DO $$
BEGIN
  -- Check if table exists before altering
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debate_sessions') THEN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'debate_sessions' AND column_name = 'completed_step_ids') THEN
      ALTER TABLE debate_sessions ADD COLUMN completed_step_ids JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'debate_sessions' AND column_name = 'difficulty') THEN
      ALTER TABLE debate_sessions ADD COLUMN difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard'));
    END IF;

    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'debate_sessions' AND column_name = 'feedback') THEN
      ALTER TABLE debate_sessions ADD COLUMN feedback JSONB;
    END IF;

    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'debate_sessions' AND column_name = 'assessment_id') THEN
      ALTER TABLE debate_sessions ADD COLUMN assessment_id UUID REFERENCES speaking_assessments(id) ON DELETE SET NULL;
    END IF;

    -- Add comments
    COMMENT ON COLUMN debate_sessions.completed_step_ids IS 'Array of completed debate step IDs (e.g. ["opening", "main-argument"])';
    COMMENT ON COLUMN debate_sessions.difficulty IS 'Difficulty level of the debate topic: easy, medium, or hard';
    COMMENT ON COLUMN debate_sessions.feedback IS 'AI feedback after debate completion: {feedback, useful_phrase, useful_phrase_ru}';
    COMMENT ON COLUMN debate_sessions.assessment_id IS 'Reference to speaking assessment if user requested speech evaluation';

    -- Create index for assessment_id if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'debate_sessions' AND indexname = 'idx_debate_sessions_assessment_id') THEN
      CREATE INDEX idx_debate_sessions_assessment_id ON debate_sessions(assessment_id) WHERE assessment_id IS NOT NULL;
    END IF;
  ELSE
    RAISE NOTICE 'Table debate_sessions does not exist. Please apply migration 20260307000000_create_debate_sessions.sql first.';
  END IF;
END $$;
