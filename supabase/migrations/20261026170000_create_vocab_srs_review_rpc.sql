-- Атомарная запись дневной оценки recognition.
-- Формулу SM-2 считает backend (applySm2Review) и передаёт оба снимка.
-- lapses здесь только увеличивается на 1 при quality < 3.
-- Функция не вызывается из этой миграции и не пишет тестовые строки.
-- Вызов: service_role через supabase.rpc. SECURITY INVOKER, без обхода прав владельца.

CREATE OR REPLACE FUNCTION public.commit_vocab_srs_review(
  p_user_id UUID,
  p_sense_id UUID,
  p_language TEXT,
  p_client_request_id TEXT,
  p_verdict TEXT,
  p_quality INTEGER,
  p_reviewed_at TIMESTAMP WITH TIME ZONE,
  p_expected_ease NUMERIC,
  p_expected_interval_days INTEGER,
  p_expected_repetitions INTEGER,
  p_expected_lapses INTEGER,
  p_expected_due_at TIMESTAMP WITH TIME ZONE,
  p_next_ease NUMERIC,
  p_next_interval_days INTEGER,
  p_next_repetitions INTEGER,
  p_next_due_at TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_request_id TEXT;
  v_event public.vocab_review_events%ROWTYPE;
  v_sense public.vocab_senses%ROWTYPE;
  v_state public.vocab_srs_states%ROWTYPE;
  v_lapses_after INTEGER;
  v_updated INTEGER;
BEGIN
  v_request_id := NULLIF(
    pg_catalog.btrim(COALESCE(p_client_request_id, '')),
    ''
  );

  IF p_user_id IS NULL
     OR p_sense_id IS NULL
     OR v_request_id IS NULL
     OR p_reviewed_at IS NULL
     OR p_expected_ease IS NULL
     OR p_expected_interval_days IS NULL
     OR p_expected_repetitions IS NULL
     OR p_expected_lapses IS NULL
     OR p_expected_due_at IS NULL
     OR p_next_ease IS NULL
     OR p_next_interval_days IS NULL
     OR p_next_repetitions IS NULL
     OR p_next_due_at IS NULL
  THEN
    RAISE EXCEPTION 'commit_vocab_srs_review arguments are incomplete'
      USING ERRCODE = '22023';
  END IF;

  IF p_language IS DISTINCT FROM 'en' AND p_language IS DISTINCT FROM 'zh' THEN
    RAISE EXCEPTION 'commit_vocab_srs_review language must be en or zh'
      USING ERRCODE = '22023';
  END IF;

  IF p_verdict IS NULL OR p_quality IS NULL THEN
    RAISE EXCEPTION 'commit_vocab_srs_review verdict and quality are required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (p_verdict = 'again' AND p_quality = 1)
    OR (p_verdict = 'hard' AND p_quality = 3)
    OR (p_verdict = 'good' AND p_quality = 4)
    OR (p_verdict = 'easy' AND p_quality = 5)
  ) THEN
    RAISE EXCEPTION 'commit_vocab_srs_review verdict and quality are not a daily review pair'
      USING ERRCODE = '22023';
  END IF;

  IF p_next_ease < 1.3
     OR p_next_interval_days < 0
     OR p_next_repetitions < 0
  THEN
    RAISE EXCEPTION 'commit_vocab_srs_review next state is outside vocab_srs_states checks'
      USING ERRCODE = '22023';
  END IF;

  -- Один ключ запроса сериализуется на время транзакции.
  -- Совпадение hash только ставит лишние вызовы в очередь: событие ищется по реальным user_id и client_request_id.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text),
    pg_catalog.hashtext(v_request_id)
  );

  -- Сначала значение и язык. Чужой или отсутствующий sense не открывает журнал.
  -- Дальше для новой оценки: recognition FOR UPDATE, затем запись события и состояния.
  SELECT *
  INTO v_sense
  FROM public.vocab_senses
  WHERE id = p_sense_id
  FOR SHARE;

  IF NOT FOUND
     OR v_sense.user_id IS DISTINCT FROM p_user_id
     OR v_sense.language IS DISTINCT FROM p_language
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'sense_id', p_sense_id,
      'client_request_id', v_request_id,
      'quality', NULL,
      'verdict', NULL,
      'due_at', NULL,
      'interval_days', NULL,
      'repetitions', NULL,
      'replayed', false
    );
  END IF;

  SELECT *
  INTO v_event
  FROM public.vocab_review_events
  WHERE user_id = p_user_id
    AND client_request_id = v_request_id;

  IF FOUND THEN
    IF v_event.sense_id = p_sense_id
       AND v_event.card_type = 'recognition'
       AND v_event.source = 'daily_review'
       AND v_event.dialogue_session_id IS NULL
       AND v_event.verdict = p_verdict
       AND v_event.quality = p_quality
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'replayed',
        'sense_id', v_event.sense_id,
        'client_request_id', v_request_id,
        'quality', v_event.quality,
        'verdict', v_event.verdict,
        'due_at', v_event.due_after,
        'interval_days', v_event.interval_after,
        'repetitions', v_event.repetitions_after,
        'replayed', true
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'sense_id', p_sense_id,
      'client_request_id', v_request_id,
      'quality', NULL,
      'verdict', NULL,
      'due_at', NULL,
      'interval_days', NULL,
      'repetitions', NULL,
      'replayed', false
    );
  END IF;

  SELECT *
  INTO v_state
  FROM public.vocab_srs_states
  WHERE sense_id = p_sense_id
    AND user_id = p_user_id
    AND card_type = 'recognition'
  FOR UPDATE;

  IF NOT FOUND
     OR v_state.user_id IS DISTINCT FROM v_sense.user_id
     OR v_state.sense_id IS DISTINCT FROM p_sense_id
     OR v_state.card_type IS DISTINCT FROM 'recognition'
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'sense_id', p_sense_id,
      'client_request_id', v_request_id,
      'quality', NULL,
      'verdict', NULL,
      'due_at', NULL,
      'interval_days', NULL,
      'repetitions', NULL,
      'replayed', false
    );
  END IF;

  SELECT *
  INTO v_event
  FROM public.vocab_review_events
  WHERE user_id = p_user_id
    AND client_request_id = v_request_id;

  IF FOUND THEN
    IF v_event.sense_id = p_sense_id
       AND v_event.card_type = 'recognition'
       AND v_event.source = 'daily_review'
       AND v_event.dialogue_session_id IS NULL
       AND v_event.verdict = p_verdict
       AND v_event.quality = p_quality
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'replayed',
        'sense_id', v_event.sense_id,
        'client_request_id', v_request_id,
        'quality', v_event.quality,
        'verdict', v_event.verdict,
        'due_at', v_event.due_after,
        'interval_days', v_event.interval_after,
        'repetitions', v_event.repetitions_after,
        'replayed', true
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'sense_id', p_sense_id,
      'client_request_id', v_request_id,
      'quality', NULL,
      'verdict', NULL,
      'due_at', NULL,
      'interval_days', NULL,
      'repetitions', NULL,
      'replayed', false
    );
  END IF;

  IF v_state.ease_factor IS DISTINCT FROM p_expected_ease
     OR v_state.interval_days IS DISTINCT FROM p_expected_interval_days
     OR v_state.repetitions IS DISTINCT FROM p_expected_repetitions
     OR v_state.lapses IS DISTINCT FROM p_expected_lapses
     OR v_state.due_at IS DISTINCT FROM p_expected_due_at
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'stale_state',
      'sense_id', p_sense_id,
      'client_request_id', v_request_id,
      'quality', NULL,
      'verdict', NULL,
      'due_at', NULL,
      'interval_days', NULL,
      'repetitions', NULL,
      'replayed', false
    );
  END IF;

  IF p_quality < 3 THEN
    v_lapses_after := v_state.lapses + 1;
  ELSE
    v_lapses_after := v_state.lapses;
  END IF;

  IF v_lapses_after < 0 THEN
    RAISE EXCEPTION 'commit_vocab_srs_review lapses would become negative'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.vocab_review_events (
    user_id,
    sense_id,
    card_type,
    quality,
    verdict,
    source,
    hint_used,
    evidence_text,
    dialogue_session_id,
    client_request_id,
    ease_before,
    ease_after,
    interval_before,
    interval_after,
    repetitions_before,
    repetitions_after,
    lapses_before,
    lapses_after,
    due_before,
    due_after,
    created_at
  ) VALUES (
    p_user_id,
    p_sense_id,
    'recognition',
    p_quality,
    p_verdict,
    'daily_review',
    FALSE,
    NULL,
    NULL,
    v_request_id,
    v_state.ease_factor,
    p_next_ease,
    v_state.interval_days,
    p_next_interval_days,
    v_state.repetitions,
    p_next_repetitions,
    v_state.lapses,
    v_lapses_after,
    v_state.due_at,
    p_next_due_at,
    p_reviewed_at
  );

  UPDATE public.vocab_srs_states
  SET
    ease_factor = p_next_ease,
    interval_days = p_next_interval_days,
    repetitions = p_next_repetitions,
    lapses = v_lapses_after,
    due_at = p_next_due_at,
    last_reviewed_at = p_reviewed_at
  WHERE id = v_state.id
    AND user_id = p_user_id
    AND sense_id = p_sense_id
    AND card_type = 'recognition'
    AND ease_factor = v_state.ease_factor
    AND interval_days = v_state.interval_days
    AND repetitions = v_state.repetitions
    AND lapses = v_state.lapses
    AND due_at = v_state.due_at;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'commit_vocab_srs_review recognition update affected % rows', v_updated
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'applied',
    'sense_id', p_sense_id,
    'client_request_id', v_request_id,
    'quality', p_quality,
    'verdict', p_verdict,
    'due_at', p_next_due_at,
    'interval_days', p_next_interval_days,
    'repetitions', p_next_repetitions,
    'replayed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_vocab_srs_review(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.commit_vocab_srs_review(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE
) FROM anon;

REVOKE ALL ON FUNCTION public.commit_vocab_srs_review(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.commit_vocab_srs_review(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE
) TO service_role;

COMMENT ON FUNCTION public.commit_vocab_srs_review(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE,
  NUMERIC,
  INTEGER,
  INTEGER,
  TIMESTAMP WITH TIME ZONE
) IS
  'Атомарно пишет daily_review и обновляет recognition. Повтор того же ключа возвращает журнал и не откатывает карточку. SM-2 в функции нет.';
