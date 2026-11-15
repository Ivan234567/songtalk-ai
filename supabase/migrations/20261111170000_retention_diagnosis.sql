-- Проверка удержания хранится в тех же сессиях и событиях.
-- Окно 7 или 30 суток записано на цели и копируется в событие.
-- Такое событие не меняет карточку SM-2.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'vocab_dialogue_sessions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%chat%'
    AND pg_get_constraintdef(con.oid) ILIKE '%roleplay%'
    AND pg_get_constraintdef(con.oid) ILIKE '%debate%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%retention%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.vocab_dialogue_sessions DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.vocab_dialogue_sessions
  DROP CONSTRAINT IF EXISTS vocab_dialogue_sessions_mode_check;

ALTER TABLE public.vocab_dialogue_sessions
  ADD CONSTRAINT vocab_dialogue_sessions_mode_check
  CHECK (mode IN ('chat', 'roleplay', 'debate', 'retention'));

ALTER TABLE public.vocab_dialogue_targets
  ADD COLUMN IF NOT EXISTS retention_days SMALLINT;

ALTER TABLE public.vocab_dialogue_targets
  DROP CONSTRAINT IF EXISTS vocab_dialogue_targets_retention_days_check;

ALTER TABLE public.vocab_dialogue_targets
  ADD CONSTRAINT vocab_dialogue_targets_retention_days_check
  CHECK (retention_days IS NULL OR retention_days IN (7, 30));

ALTER TABLE public.vocab_dialogue_targets
  DROP CONSTRAINT IF EXISTS vocab_dialogue_targets_retention_holds_schedule;

ALTER TABLE public.vocab_dialogue_targets
  ADD CONSTRAINT vocab_dialogue_targets_retention_holds_schedule
  CHECK (retention_days IS NULL OR moves_schedule IS FALSE);

ALTER TABLE public.vocab_review_events
  ADD COLUMN IF NOT EXISTS retention_days SMALLINT;

ALTER TABLE public.vocab_review_events
  DROP CONSTRAINT IF EXISTS vocab_review_events_retention_days_check;

ALTER TABLE public.vocab_review_events
  ADD CONSTRAINT vocab_review_events_retention_days_check
  CHECK (retention_days IS NULL OR retention_days IN (7, 30));

ALTER TABLE public.vocab_review_events
  DROP CONSTRAINT IF EXISTS vocab_review_events_retention_holds_schedule;

ALTER TABLE public.vocab_review_events
  ADD CONSTRAINT vocab_review_events_retention_holds_schedule
  CHECK (
    retention_days IS NULL
    OR (
      ease_before = ease_after
      AND interval_before = interval_after
      AND repetitions_before = repetitions_after
      AND lapses_before = lapses_after
      AND due_before IS NOT DISTINCT FROM due_after
    )
  );

CREATE INDEX IF NOT EXISTS idx_vocab_review_events_retention
  ON public.vocab_review_events (user_id, sense_id, retention_days, created_at)
  WHERE retention_days IS NOT NULL;

CREATE OR REPLACE FUNCTION public.commit_vocab_dialogue_assessment(
  p_user_id UUID,
  p_dialogue_session_id UUID,
  p_language TEXT,
  p_client_request_id TEXT,
  p_reviewed_at TIMESTAMP WITH TIME ZONE,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_request_id TEXT;
  v_session public.vocab_dialogue_sessions%ROWTYPE;
  v_item JSONB;
  v_target public.vocab_dialogue_targets%ROWTYPE;
  v_state public.vocab_srs_states%ROWTYPE;
  v_event public.vocab_review_events%ROWTYPE;
  v_sense_id UUID;
  v_verdict TEXT;
  v_quality INTEGER;
  v_evidence TEXT;
  v_hint_used BOOLEAN;
  v_expected_ease NUMERIC;
  v_expected_interval INTEGER;
  v_expected_repetitions INTEGER;
  v_expected_lapses INTEGER;
  v_expected_due TIMESTAMP WITH TIME ZONE;
  v_next_ease NUMERIC;
  v_next_interval INTEGER;
  v_next_repetitions INTEGER;
  v_next_due TIMESTAMP WITH TIME ZONE;
  v_lapses_after INTEGER;
  v_updated INTEGER;
  v_count INTEGER;
  v_index INTEGER;
  v_target_count INTEGER;
  v_results JSONB := '[]'::jsonb;
  v_moving BOOLEAN;
BEGIN
  v_request_id := NULLIF(pg_catalog.btrim(COALESCE(p_client_request_id, '')), '');

  IF p_user_id IS NULL
     OR p_dialogue_session_id IS NULL
     OR v_request_id IS NULL
     OR p_reviewed_at IS NULL
     OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'commit_vocab_dialogue_assessment arguments are incomplete'
      USING ERRCODE = '22023';
  END IF;

  IF p_language IS DISTINCT FROM 'en' AND p_language IS DISTINCT FROM 'zh' THEN
    RAISE EXCEPTION 'commit_vocab_dialogue_assessment language must be en or zh'
      USING ERRCODE = '22023';
  END IF;

  v_count := pg_catalog.jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 5 THEN
    RAISE EXCEPTION 'commit_vocab_dialogue_assessment item count is outside 1..5'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text),
    pg_catalog.hashtext(p_dialogue_session_id::text)
  );

  SELECT *
  INTO v_session
  FROM public.vocab_dialogue_sessions
  WHERE id = p_dialogue_session_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.user_id IS DISTINCT FROM p_user_id
     OR v_session.language IS DISTINCT FROM p_language
     OR v_session.mode NOT IN ('chat', 'roleplay', 'debate', 'retention')
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found', 'items', '[]'::jsonb, 'replayed', false);
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_target_count
  FROM public.vocab_dialogue_targets
  WHERE dialogue_session_id = p_dialogue_session_id
    AND user_id = p_user_id;

  IF v_target_count IS DISTINCT FROM v_count THEN
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'items', '[]'::jsonb, 'replayed', false);
  END IF;

  IF v_session.status = 'assessed' THEN
    FOR v_event IN
      SELECT *
      FROM public.vocab_review_events
      WHERE dialogue_session_id = p_dialogue_session_id
        AND user_id = p_user_id
        AND source = 'dialogue'
        AND card_type = 'production'
      ORDER BY created_at
    LOOP
      v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'sense_id', v_event.sense_id,
        'verdict', v_event.verdict,
        'due_at', v_event.due_after,
        'interval_days', v_event.interval_after,
        'replayed', true
      ));
    END LOOP;
    RETURN pg_catalog.jsonb_build_object('status', 'replayed', 'items', v_results, 'replayed', true);
  END IF;

  IF v_session.status IS DISTINCT FROM 'active' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'items', '[]'::jsonb, 'replayed', false);
  END IF;

  FOR v_index IN 0..(v_count - 1) LOOP
    v_item := p_items -> v_index;
    v_sense_id := (v_item->>'sense_id')::uuid;
    v_verdict := v_item->>'verdict';
    v_quality := (v_item->>'quality')::integer;
    v_evidence := NULLIF(pg_catalog.btrim(COALESCE(v_item->>'evidence_text', '')), '');
    v_expected_ease := (v_item->>'expected_ease')::numeric;
    v_expected_interval := (v_item->>'expected_interval_days')::integer;
    v_expected_repetitions := (v_item->>'expected_repetitions')::integer;
    v_expected_lapses := (v_item->>'expected_lapses')::integer;
    v_expected_due := (v_item->>'expected_due_at')::timestamptz;
    v_next_ease := (v_item->>'next_ease')::numeric;
    v_next_interval := (v_item->>'next_interval_days')::integer;
    v_next_repetitions := (v_item->>'next_repetitions')::integer;
    v_next_due := (v_item->>'next_due_at')::timestamptz;

    IF v_verdict IS NULL OR v_quality IS NULL THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment verdict and quality are required'
        USING ERRCODE = '22023';
    END IF;

    IF NOT (
      (v_verdict = 'produced' AND v_quality = 5)
      OR (v_verdict = 'wrong_sense' AND v_quality = 1)
      OR (v_verdict IN ('hinted', 'mentioned', 'unused', 'echoed', 'no_opportunity') AND v_quality = 0)
    ) THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment verdict and quality are not a dialogue pair'
        USING ERRCODE = '22023';
    END IF;

    IF v_verdict = 'produced' AND v_evidence IS NULL THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment produced evidence is required'
        USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_target
    FROM public.vocab_dialogue_targets
    WHERE dialogue_session_id = p_dialogue_session_id
      AND user_id = p_user_id
      AND sense_id = v_sense_id;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('status', 'not_found', 'items', '[]'::jsonb, 'replayed', false);
    END IF;

    IF v_session.mode = 'retention' AND v_target.retention_days IS NULL THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment retention window is required'
        USING ERRCODE = '22023';
    END IF;

    IF v_session.mode IS DISTINCT FROM 'retention' AND v_target.retention_days IS NOT NULL THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment retention window belongs to a retention session'
        USING ERRCODE = '22023';
    END IF;

    v_moving := v_verdict IN ('produced', 'wrong_sense')
      AND v_target.moves_schedule IS TRUE
      AND v_target.retention_days IS NULL
      AND v_session.mode IS DISTINCT FROM 'retention';

    IF NOT v_moving AND (
      v_next_ease IS DISTINCT FROM v_expected_ease
      OR v_next_interval IS DISTINCT FROM v_expected_interval
      OR v_next_repetitions IS DISTINCT FROM v_expected_repetitions
      OR v_next_due IS DISTINCT FROM v_expected_due
    ) THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment non-moving verdict changes the schedule'
        USING ERRCODE = '22023';
    END IF;

    IF v_verdict = 'produced' AND (
      public.vocab_text_contains_headword(v_evidence, v_target.headword) IS NOT TRUE
      OR NOT EXISTS (
        SELECT 1
        FROM public.vocab_dialogue_turns turn
        WHERE turn.dialogue_session_id = p_dialogue_session_id
          AND turn.user_id = p_user_id
          AND turn.role = 'user'
          AND pg_catalog.strpos(turn.content, v_evidence) > 0
      )
    ) THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment produced evidence is not a user turn'
        USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_state
    FROM public.vocab_srs_states
    WHERE sense_id = v_sense_id
      AND user_id = p_user_id
      AND card_type = 'production'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('status', 'not_found', 'items', '[]'::jsonb, 'replayed', false);
    END IF;

    IF v_state.ease_factor IS DISTINCT FROM v_expected_ease
       OR v_state.interval_days IS DISTINCT FROM v_expected_interval
       OR v_state.repetitions IS DISTINCT FROM v_expected_repetitions
       OR v_state.lapses IS DISTINCT FROM v_expected_lapses
       OR v_state.due_at IS DISTINCT FROM v_expected_due
    THEN
      RETURN pg_catalog.jsonb_build_object('status', 'stale_state', 'items', '[]'::jsonb, 'replayed', false);
    END IF;
  END LOOP;

  FOR v_index IN 0..(v_count - 1) LOOP
    v_item := p_items -> v_index;
    v_sense_id := (v_item->>'sense_id')::uuid;
    v_verdict := v_item->>'verdict';
    v_quality := (v_item->>'quality')::integer;
    v_evidence := NULLIF(pg_catalog.btrim(COALESCE(v_item->>'evidence_text', '')), '');
    v_hint_used := v_verdict = 'hinted';
    v_expected_ease := (v_item->>'expected_ease')::numeric;
    v_expected_interval := (v_item->>'expected_interval_days')::integer;
    v_expected_repetitions := (v_item->>'expected_repetitions')::integer;
    v_expected_lapses := (v_item->>'expected_lapses')::integer;
    v_expected_due := (v_item->>'expected_due_at')::timestamptz;
    v_next_ease := (v_item->>'next_ease')::numeric;
    v_next_interval := (v_item->>'next_interval_days')::integer;
    v_next_repetitions := (v_item->>'next_repetitions')::integer;
    v_next_due := (v_item->>'next_due_at')::timestamptz;

    SELECT *
    INTO v_target
    FROM public.vocab_dialogue_targets
    WHERE dialogue_session_id = p_dialogue_session_id
      AND user_id = p_user_id
      AND sense_id = v_sense_id;

    v_moving := v_verdict IN ('produced', 'wrong_sense')
      AND v_target.moves_schedule IS TRUE
      AND v_target.retention_days IS NULL
      AND v_session.mode IS DISTINCT FROM 'retention';

    SELECT *
    INTO v_state
    FROM public.vocab_srs_states
    WHERE sense_id = v_sense_id
      AND user_id = p_user_id
      AND card_type = 'production'
    FOR UPDATE;

    IF v_moving AND v_quality < 3 THEN
      v_lapses_after := v_state.lapses + 1;
    ELSE
      v_lapses_after := v_state.lapses;
    END IF;

    INSERT INTO public.vocab_review_events (
      user_id, sense_id, card_type, quality, verdict, source, hint_used, evidence_text,
      dialogue_session_id, client_request_id, retention_days,
      ease_before, ease_after, interval_before, interval_after,
      repetitions_before, repetitions_after, lapses_before, lapses_after,
      due_before, due_after, created_at
    ) VALUES (
      p_user_id, v_sense_id, 'production', v_quality, v_verdict, 'dialogue', v_hint_used, v_evidence,
      p_dialogue_session_id, v_request_id || ':' || v_sense_id::text, v_target.retention_days,
      v_state.ease_factor, v_next_ease, v_state.interval_days, v_next_interval,
      v_state.repetitions, v_next_repetitions, v_state.lapses, v_lapses_after,
      v_state.due_at, v_next_due, p_reviewed_at
    );

    IF v_moving THEN
      UPDATE public.vocab_srs_states
      SET
        ease_factor = v_next_ease,
        interval_days = v_next_interval,
        repetitions = v_next_repetitions,
        lapses = v_lapses_after,
        due_at = v_next_due,
        last_reviewed_at = p_reviewed_at
      WHERE id = v_state.id
        AND user_id = p_user_id
        AND sense_id = v_sense_id
        AND card_type = 'production';

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN
        RAISE EXCEPTION 'commit_vocab_dialogue_assessment production update affected % rows', v_updated
          USING ERRCODE = '40001';
      END IF;
    END IF;

    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'sense_id', v_sense_id,
      'verdict', v_verdict,
      'due_at', v_next_due,
      'interval_days', v_next_interval,
      'replayed', false
    ));
  END LOOP;

  UPDATE public.vocab_dialogue_sessions
  SET status = 'assessed', assessed_at = p_reviewed_at
  WHERE id = p_dialogue_session_id
    AND user_id = p_user_id
    AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'commit_vocab_dialogue_assessment session update affected % rows', v_updated
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object('status', 'applied', 'items', v_results, 'replayed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) TO service_role;
