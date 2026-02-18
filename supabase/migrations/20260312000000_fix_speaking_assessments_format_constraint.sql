-- Ensure speaking_assessments.format accepts 'debate' in all environments.
-- This migration is defensive: it drops any existing CHECK constraints that
-- reference the "format" column, then recreates a single canonical constraint.

DO $$
DECLARE
  c RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'speaking_assessments'
  ) THEN
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'speaking_assessments'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%format%'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.speaking_assessments DROP CONSTRAINT IF EXISTS %I',
        c.conname
      );
    END LOOP;

    ALTER TABLE public.speaking_assessments
      ADD CONSTRAINT speaking_assessments_format_check
      CHECK (format IN ('dialogue', 'monologue', 'presentation', 'debate'));
  ELSE
    RAISE NOTICE 'Table speaking_assessments does not exist. Apply base migrations first.';
  END IF;
END $$;

