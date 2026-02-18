-- Extend speaking_assessments.format to support debate assessments
-- Existing migration allows only: dialogue, monologue, presentation
-- Backend now stores debate assessments with format = 'debate'

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'speaking_assessments'
  ) THEN
    ALTER TABLE speaking_assessments
      DROP CONSTRAINT IF EXISTS speaking_assessments_format_check;

    ALTER TABLE speaking_assessments
      ADD CONSTRAINT speaking_assessments_format_check
      CHECK (format IN ('dialogue', 'monologue', 'presentation', 'debate'));
  ELSE
    RAISE NOTICE 'Table speaking_assessments does not exist. Apply 20260230000000_create_speaking_assessments.sql first.';
  END IF;
END $$;

