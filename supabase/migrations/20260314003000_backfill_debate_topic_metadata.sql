-- Backfill topic metadata for existing debate rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'debate_completions'
  ) THEN
    UPDATE public.debate_completions
    SET
      topic_source = COALESCE(topic_source, CASE WHEN topic_ru IS NOT NULL THEN 'catalog' ELSE 'custom' END),
      topic_original = COALESCE(topic_original, topic),
      topic_normalized = COALESCE(topic_normalized, trim(regexp_replace(topic, '\s+', ' ', 'g'))),
      topic_language = COALESCE(topic_language, CASE
        WHEN topic ~ '[А-Яа-яЁё]' AND topic !~ '[A-Za-z]' THEN 'ru'
        WHEN topic ~ '[A-Za-z]' AND topic !~ '[А-Яа-яЁё]' THEN 'en'
        ELSE 'unknown'
      END),
      topic_validation_status = COALESCE(topic_validation_status, 'valid')
    WHERE topic_source IS NULL
      OR topic_original IS NULL
      OR topic_normalized IS NULL
      OR topic_language IS NULL
      OR topic_validation_status IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'debate_sessions'
  ) THEN
    UPDATE public.debate_sessions ds
    SET
      topic_source = COALESCE(
        ds.topic_source,
        (
          SELECT dc.topic_source
          FROM public.debate_completions dc
          WHERE dc.debate_session_id = ds.id
            AND dc.topic_source IS NOT NULL
          ORDER BY dc.completed_at DESC
          LIMIT 1
        ),
        'custom'
      ),
      topic_original = COALESCE(ds.topic_original, ds.topic),
      topic_normalized = COALESCE(ds.topic_normalized, trim(regexp_replace(ds.topic, '\s+', ' ', 'g'))),
      topic_language = COALESCE(ds.topic_language, CASE
        WHEN ds.topic ~ '[А-Яа-яЁё]' AND ds.topic !~ '[A-Za-z]' THEN 'ru'
        WHEN ds.topic ~ '[A-Za-z]' AND ds.topic !~ '[А-Яа-яЁё]' THEN 'en'
        ELSE 'unknown'
      END),
      topic_validation_status = COALESCE(ds.topic_validation_status, 'valid')
    WHERE ds.topic_source IS NULL
      OR ds.topic_original IS NULL
      OR ds.topic_normalized IS NULL
      OR ds.topic_language IS NULL
      OR ds.topic_validation_status IS NULL;
  END IF;
END $$;

