-- Диагностика переноса хранится в тех же сессиях, целях и событиях.
-- Ситуации обучения и удержания до этой миграции нигде не записаны.
-- Новые занятия смогут сохранить ситуацию в vocab_dialogue_sessions.situation.
-- Старые NULL не заполняются и не используются как baseline.
-- Одна старая сессия без ситуации не блокирует перенос, если есть
-- более новая доказанная ситуация обучения и доказанное удержание.
-- Baseline — ровно две записи из строк БД: самое раннее доказанное обучение
-- и самое раннее доказанное удержание. Позже добавленные занятия пару не меняют.
-- novelty_ok и transfer_confirmed считает только сервер.
-- Подтверждение переноса у смысла одно. Повторные попытки остаются в журнале
-- с transfer_confirmed = false.
-- После события переноса поля доказательства не меняются.
-- Обновление события и так запрещено vocab_review_events_append_only_trigger.
-- Этот файл дублирует запрет по каждому полю, включая обе стороны SM-2.
-- Завершение сессии (status, assessed_at) остаётся возможным.
-- Карточка SM-2 событием переноса не обновляется.
-- Занятие переноса этим файлом не создаётся. Миграция удержания не изменяется.

-- ---------------------------------------------------------------------------
-- Форма ситуации. Числа, null, массивы и объекты вместо строк не подходят.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vocab_situation_valid(p_situation JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN pg_catalog.jsonb_typeof(p_situation) IS DISTINCT FROM 'object' THEN FALSE
    WHEN (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_object_keys(p_situation)
    ) IS DISTINCT FROM 6 THEN FALSE
    WHEN NOT (
      p_situation ? 'roles'
      AND p_situation ? 'relationship'
      AND p_situation ? 'location'
      AND p_situation ? 'channel'
      AND p_situation ? 'circumstances'
      AND p_situation ? 'intent'
    ) THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_situation->'roles') IS DISTINCT FROM 'array' THEN FALSE
    WHEN pg_catalog.jsonb_array_length(p_situation->'roles') NOT BETWEEN 1 AND 3 THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_situation->'relationship') IS DISTINCT FROM 'string' THEN FALSE
    WHEN p_situation->>'relationship' NOT IN (
      'service', 'work', 'authority', 'friendship', 'strangers', 'family', 'study'
    ) THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_situation->'location') IS DISTINCT FROM 'string' THEN FALSE
    WHEN p_situation->>'location' NOT IN (
      'shop', 'office', 'home', 'street', 'school', 'cafe', 'transport', 'clinic', 'public'
    ) THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_situation->'channel') IS DISTINCT FROM 'string' THEN FALSE
    WHEN p_situation->>'channel' NOT IN ('in_person', 'phone', 'message') THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_situation->'circumstances') IS DISTINCT FROM 'string' THEN FALSE
    WHEN p_situation->>'circumstances' NOT IN ('everyday', 'work', 'urgent', 'formal', 'conflict') THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_situation->'intent') IS DISTINCT FROM 'string' THEN FALSE
    WHEN p_situation->>'intent' NOT IN (
      'request', 'refuse', 'explain', 'persuade', 'agree', 'disagree',
      'support', 'clarify', 'negotiate', 'apologize', 'complain', 'suggest'
    ) THEN FALSE
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_situation->'roles') AS role(value)
      WHERE pg_catalog.jsonb_typeof(role.value) IS DISTINCT FROM 'string'
         OR (role.value #>> '{}') NOT IN (
           'customer', 'seller', 'colleague', 'manager', 'employee', 'friend',
           'stranger', 'student', 'teacher', 'host', 'guest', 'family'
         )
    ) THEN FALSE
    ELSE (
      SELECT pg_catalog.count(DISTINCT role.value #>> '{}')
      FROM pg_catalog.jsonb_array_elements(p_situation->'roles') AS role(value)
    ) = pg_catalog.jsonb_array_length(p_situation->'roles')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.vocab_role_set(p_situation JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(role.value #>> '{}' ORDER BY role.value #>> '{}'),
    '[]'::jsonb
  )
  FROM pg_catalog.jsonb_array_elements(p_situation->'roles') AS role(value)
  WHERE pg_catalog.jsonb_typeof(role.value) = 'string';
$function$;

CREATE OR REPLACE FUNCTION public.vocab_context_differs(p_left JSONB, p_right JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN public.vocab_situation_valid(p_left) IS NOT TRUE
      OR public.vocab_situation_valid(p_right) IS NOT TRUE
      THEN FALSE
    ELSE
      p_left->>'relationship' IS DISTINCT FROM p_right->>'relationship'
      OR p_left->>'location' IS DISTINCT FROM p_right->>'location'
      OR p_left->>'channel' IS DISTINCT FROM p_right->>'channel'
      OR p_left->>'circumstances' IS DISTINCT FROM p_right->>'circumstances'
      OR public.vocab_role_set(p_left) IS DISTINCT FROM public.vocab_role_set(p_right)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.vocab_situations_differ(p_left JSONB, p_right JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT public.vocab_context_differs(p_left, p_right)
    AND pg_catalog.jsonb_typeof(p_left->'intent') = 'string'
    AND pg_catalog.jsonb_typeof(p_right->'intent') = 'string'
    AND p_left->>'intent' IS DISTINCT FROM p_right->>'intent';
$function$;

CREATE OR REPLACE FUNCTION public.vocab_situation_same(p_left JSONB, p_right JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT public.vocab_situation_valid(p_left)
    AND public.vocab_situation_valid(p_right)
    AND public.vocab_context_differs(p_left, p_right) IS NOT TRUE
    AND p_left->>'intent' IS NOT DISTINCT FROM p_right->>'intent';
$function$;

-- Ровно та форма, которую возвращает vocab_transfer_baseline_records:
-- два объекта, сначала learning, затем retention, без лишних ключей.
CREATE OR REPLACE FUNCTION public.vocab_transfer_baseline_valid(p_baseline JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN pg_catalog.jsonb_typeof(p_baseline) IS DISTINCT FROM 'array' THEN FALSE
    WHEN pg_catalog.jsonb_array_length(p_baseline) IS DISTINCT FROM 2 THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_baseline->0) IS DISTINCT FROM 'object' THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_baseline->1) IS DISTINCT FROM 'object' THEN FALSE
    WHEN (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_object_keys(p_baseline->0)
    ) IS DISTINCT FROM 2 THEN FALSE
    WHEN (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_object_keys(p_baseline->1)
    ) IS DISTINCT FROM 2 THEN FALSE
    WHEN NOT (p_baseline->0 ? 'source' AND p_baseline->0 ? 'situation') THEN FALSE
    WHEN NOT (p_baseline->1 ? 'source' AND p_baseline->1 ? 'situation') THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_baseline->0->'source') IS DISTINCT FROM 'string' THEN FALSE
    WHEN pg_catalog.jsonb_typeof(p_baseline->1->'source') IS DISTINCT FROM 'string' THEN FALSE
    WHEN p_baseline->0->>'source' IS DISTINCT FROM 'learning' THEN FALSE
    WHEN p_baseline->1->>'source' IS DISTINCT FROM 'retention' THEN FALSE
    WHEN public.vocab_situation_valid(p_baseline->0->'situation') IS NOT TRUE THEN FALSE
    WHEN public.vocab_situation_valid(p_baseline->1->'situation') IS NOT TRUE THEN FALSE
    ELSE TRUE
  END;
$function$;

CREATE OR REPLACE FUNCTION public.vocab_transfer_is_novel(p_situation JSONB, p_baseline JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN public.vocab_situation_valid(p_situation) IS NOT TRUE THEN FALSE
    WHEN public.vocab_transfer_baseline_valid(p_baseline) IS NOT TRUE THEN FALSE
    ELSE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_baseline) AS item(value)
      WHERE public.vocab_situations_differ(p_situation, item.value->'situation') IS NOT TRUE
    )
  END;
$function$;

-- ---------------------------------------------------------------------------
-- Колонки. Ограничение режима шага 4 известно по имени.
-- ---------------------------------------------------------------------------

ALTER TABLE public.vocab_dialogue_sessions
  DROP CONSTRAINT IF EXISTS vocab_dialogue_sessions_mode_check;

ALTER TABLE public.vocab_dialogue_sessions
  ADD CONSTRAINT vocab_dialogue_sessions_mode_check
  CHECK (mode IN ('chat', 'roleplay', 'debate', 'retention', 'transfer'));

ALTER TABLE public.vocab_dialogue_sessions
  ADD COLUMN IF NOT EXISTS situation JSONB;

ALTER TABLE public.vocab_dialogue_sessions
  DROP CONSTRAINT IF EXISTS vocab_dialogue_sessions_situation_valid;

ALTER TABLE public.vocab_dialogue_sessions
  ADD CONSTRAINT vocab_dialogue_sessions_situation_valid
  CHECK (situation IS NULL OR public.vocab_situation_valid(situation));

ALTER TABLE public.vocab_dialogue_sessions
  DROP CONSTRAINT IF EXISTS vocab_dialogue_sessions_transfer_situation;

ALTER TABLE public.vocab_dialogue_sessions
  ADD CONSTRAINT vocab_dialogue_sessions_transfer_situation
  CHECK (mode IS DISTINCT FROM 'transfer' OR situation IS NOT NULL);

ALTER TABLE public.vocab_dialogue_targets
  ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.vocab_dialogue_targets
  ADD COLUMN IF NOT EXISTS baseline_situations JSONB;

ALTER TABLE public.vocab_dialogue_targets
  ADD COLUMN IF NOT EXISTS novelty_ok BOOLEAN;

ALTER TABLE public.vocab_dialogue_targets
  DROP CONSTRAINT IF EXISTS vocab_dialogue_targets_transfer_shape;

ALTER TABLE public.vocab_dialogue_targets
  ADD CONSTRAINT vocab_dialogue_targets_transfer_shape
  CHECK (
    (
      is_transfer IS FALSE
      AND baseline_situations IS NULL
      AND novelty_ok IS NULL
    )
    OR (
      is_transfer IS TRUE
      AND moves_schedule IS FALSE
      AND retention_days IS NULL
      AND public.vocab_transfer_baseline_valid(baseline_situations)
      AND novelty_ok IS NOT NULL
    )
  );

ALTER TABLE public.vocab_review_events
  ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.vocab_review_events
  ADD COLUMN IF NOT EXISTS situation JSONB;

ALTER TABLE public.vocab_review_events
  ADD COLUMN IF NOT EXISTS baseline_situations JSONB;

ALTER TABLE public.vocab_review_events
  ADD COLUMN IF NOT EXISTS novelty_ok BOOLEAN;

ALTER TABLE public.vocab_review_events
  ADD COLUMN IF NOT EXISTS transfer_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.vocab_review_events
  DROP CONSTRAINT IF EXISTS vocab_review_events_transfer_shape;

ALTER TABLE public.vocab_review_events
  ADD CONSTRAINT vocab_review_events_transfer_shape
  CHECK (
    (
      is_transfer IS FALSE
      AND situation IS NULL
      AND baseline_situations IS NULL
      AND novelty_ok IS NULL
      AND transfer_confirmed IS FALSE
    )
    OR (
      is_transfer IS TRUE
      AND retention_days IS NULL
      AND situation IS NOT NULL
      AND baseline_situations IS NOT NULL
      AND public.vocab_situation_valid(situation)
      AND public.vocab_transfer_baseline_valid(baseline_situations)
      AND novelty_ok = public.vocab_transfer_is_novel(situation, baseline_situations)
      AND ease_before = ease_after
      AND interval_before = interval_after
      AND repetitions_before = repetitions_after
      AND lapses_before = lapses_after
      AND due_before IS NOT DISTINCT FROM due_after
    )
  );

ALTER TABLE public.vocab_review_events
  DROP CONSTRAINT IF EXISTS vocab_review_events_transfer_confirmed;

ALTER TABLE public.vocab_review_events
  ADD CONSTRAINT vocab_review_events_transfer_confirmed
  CHECK (
    transfer_confirmed IS FALSE
    OR (
      is_transfer IS TRUE
      AND novelty_ok IS TRUE
      AND verdict = 'produced'
      AND evidence_text IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(evidence_text)) > 0
    )
  );

CREATE INDEX IF NOT EXISTS idx_vocab_review_events_transfer
  ON public.vocab_review_events (user_id, sense_id, created_at)
  WHERE is_transfer;

CREATE UNIQUE INDEX IF NOT EXISTS vocab_review_events_transfer_confirmed_once
  ON public.vocab_review_events (user_id, sense_id)
  WHERE transfer_confirmed;

-- ---------------------------------------------------------------------------
-- Якорь T и подтверждение окна по правилам шага 4.
-- Событие связано с сессией mode = retention и с целью того же пользователя.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vocab_retention_anchor_at(
  p_user_id UUID,
  p_sense_id UUID
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT speech.created_at
  FROM (
    SELECT
      event.created_at,
      event.dialogue_session_id,
      event.user_id,
      event.sense_id,
      event.evidence_text,
      event.due_before,
      event.due_after,
      EXISTS (
        SELECT 1
        FROM public.vocab_dialogue_targets AS target
        WHERE target.dialogue_session_id = event.dialogue_session_id
          AND target.user_id = event.user_id
          AND target.sense_id = event.sense_id
          AND target.moves_schedule IS FALSE
      ) AS schedule_held
    FROM public.vocab_review_events AS event
    WHERE event.user_id = p_user_id
      AND event.sense_id = p_sense_id
      AND event.source = 'dialogue'
      AND event.card_type = 'production'
      AND event.verdict = 'produced'
      AND event.dialogue_session_id IS NOT NULL
      AND event.evidence_text IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(event.evidence_text)) > 0
      AND event.retention_days IS NULL
      AND event.is_transfer IS FALSE
  ) AS speech
  WHERE speech.schedule_held IS FALSE
    AND speech.due_before IS NOT NULL
    AND speech.due_after IS NOT NULL
    AND speech.due_before IS DISTINCT FROM speech.due_after
    AND EXISTS (
      SELECT 1
      FROM public.vocab_dialogue_targets AS target
      WHERE target.dialogue_session_id = speech.dialogue_session_id
        AND target.user_id = speech.user_id
        AND target.sense_id = speech.sense_id
        AND public.vocab_text_contains_headword(speech.evidence_text, target.headword) IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.vocab_dialogue_turns AS turn
      WHERE turn.dialogue_session_id = speech.dialogue_session_id
        AND turn.user_id = speech.user_id
        AND turn.role = 'user'
        AND pg_catalog.strpos(turn.content, pg_catalog.btrim(speech.evidence_text)) > 0
    )
    AND EXISTS (
      SELECT 1
      FROM public.vocab_review_events AS earlier
      WHERE earlier.user_id = p_user_id
        AND earlier.sense_id = p_sense_id
        AND earlier.source = 'dialogue'
        AND earlier.card_type = 'production'
        AND earlier.verdict = 'produced'
        AND earlier.dialogue_session_id IS NOT NULL
        AND earlier.evidence_text IS NOT NULL
        AND pg_catalog.char_length(pg_catalog.btrim(earlier.evidence_text)) > 0
        AND earlier.retention_days IS NULL
        AND earlier.is_transfer IS FALSE
        AND earlier.dialogue_session_id IS DISTINCT FROM speech.dialogue_session_id
        AND earlier.created_at < speech.created_at
        AND EXISTS (
          SELECT 1
          FROM public.vocab_dialogue_targets AS target
          WHERE target.dialogue_session_id = earlier.dialogue_session_id
            AND target.user_id = earlier.user_id
            AND target.sense_id = earlier.sense_id
            AND public.vocab_text_contains_headword(earlier.evidence_text, target.headword) IS TRUE
        )
        AND EXISTS (
          SELECT 1
          FROM public.vocab_dialogue_turns AS turn
          WHERE turn.dialogue_session_id = earlier.dialogue_session_id
            AND turn.user_id = earlier.user_id
            AND turn.role = 'user'
            AND pg_catalog.strpos(turn.content, pg_catalog.btrim(earlier.evidence_text)) > 0
        )
    )
  ORDER BY speech.created_at
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.vocab_retention_confirmed(
  p_user_id UUID,
  p_sense_id UUID,
  p_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.vocab_review_events AS event
    JOIN public.vocab_dialogue_sessions AS session
      ON session.id = event.dialogue_session_id
     AND session.user_id = event.user_id
    JOIN public.vocab_dialogue_targets AS target
      ON target.dialogue_session_id = event.dialogue_session_id
     AND target.user_id = event.user_id
     AND target.sense_id = event.sense_id
    WHERE event.user_id = p_user_id
      AND event.sense_id = p_sense_id
      AND event.created_at <= p_at
      AND event.is_transfer IS FALSE
      AND event.source = 'dialogue'
      AND event.card_type = 'production'
      AND event.verdict = 'produced'
      AND event.quality = 5
      AND event.retention_days IN (7, 30)
      AND event.evidence_text IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(event.evidence_text)) > 0
      AND event.ease_before = event.ease_after
      AND event.interval_before = event.interval_after
      AND event.repetitions_before = event.repetitions_after
      AND event.lapses_before = event.lapses_after
      AND event.due_before IS NOT DISTINCT FROM event.due_after
      AND session.mode = 'retention'
      AND session.user_id = p_user_id
      AND target.user_id = p_user_id
      AND target.sense_id = p_sense_id
      AND target.is_transfer IS FALSE
      AND target.moves_schedule IS FALSE
      AND target.retention_days = event.retention_days
      AND public.vocab_text_contains_headword(event.evidence_text, target.headword) IS TRUE
      AND EXISTS (
        SELECT 1
        FROM public.vocab_dialogue_turns AS turn
        WHERE turn.dialogue_session_id = event.dialogue_session_id
          AND turn.user_id = event.user_id
          AND turn.role = 'user'
          AND pg_catalog.strpos(turn.content, pg_catalog.btrim(event.evidence_text)) > 0
      )
      AND public.vocab_retention_anchor_at(p_user_id, p_sense_id) IS NOT NULL
      AND event.created_at >= public.vocab_retention_anchor_at(p_user_id, p_sense_id)
        + (event.retention_days * INTERVAL '24 hours')
  );
$function$;

-- Две ситуации из строк БД. NULL — перенос недоступен.
-- Обучение: самая ранняя assessed-сессия chat/roleplay/debate,
-- у которой есть событие dialogue/production этого пользователя и смысла.
-- Вердикт должен показывать участие: produced, wrong_sense, hinted, echoed, mentioned.
-- unused — возможность была, попытки не было. no_opportunity — возможности не было.
-- Оба не доказывают обучение. Удержание и перенос тоже не доказывают.
-- Само создание target доказательством не считается.
-- У wrong_sense, hinted, echoed и mentioned цитата не обязательна.
-- produced без цитаты в реплике пользователя обучением не считается.
-- Удержание: самое раннее событие, которое само подтверждает окно по правилам шага 4,
-- и чья сессия имеет валидную ситуацию.
-- Сессии с NULL пропускаются и не обнуляют всю выборку.
-- Порядок стабилен: created_at сессии, id сессии, created_at события, id события.
CREATE OR REPLACE FUNCTION public.vocab_transfer_baseline_records(
  p_user_id UUID,
  p_sense_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN learning.situation IS NULL OR retention.situation IS NULL THEN NULL
    ELSE pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('source', 'learning', 'situation', learning.situation),
      pg_catalog.jsonb_build_object('source', 'retention', 'situation', retention.situation)
    )
  END
  FROM (
    SELECT session.situation
    FROM public.vocab_dialogue_sessions AS session
    JOIN public.vocab_dialogue_targets AS target
      ON target.dialogue_session_id = session.id
     AND target.user_id = session.user_id
     AND target.sense_id = p_sense_id
    JOIN public.vocab_review_events AS event
      ON event.dialogue_session_id = session.id
     AND event.user_id = session.user_id
     AND event.sense_id = target.sense_id
    WHERE session.user_id = p_user_id
      AND session.status = 'assessed'
      AND session.mode IN ('chat', 'roleplay', 'debate')
      AND target.is_transfer IS FALSE
      AND target.retention_days IS NULL
      AND event.source = 'dialogue'
      AND event.card_type = 'production'
      AND event.retention_days IS NULL
      AND event.is_transfer IS FALSE
      AND event.verdict IN ('produced', 'wrong_sense', 'hinted', 'echoed', 'mentioned')
      AND (
        event.verdict IS DISTINCT FROM 'produced'
        OR (
          event.evidence_text IS NOT NULL
          AND pg_catalog.char_length(pg_catalog.btrim(event.evidence_text)) > 0
          AND public.vocab_text_contains_headword(event.evidence_text, target.headword) IS TRUE
          AND EXISTS (
            SELECT 1
            FROM public.vocab_dialogue_turns AS turn
            WHERE turn.dialogue_session_id = event.dialogue_session_id
              AND turn.user_id = event.user_id
              AND turn.role = 'user'
              AND pg_catalog.strpos(turn.content, pg_catalog.btrim(event.evidence_text)) > 0
          )
        )
      )
      AND public.vocab_situation_valid(session.situation)
    ORDER BY session.created_at, session.id, event.created_at, event.id
    LIMIT 1
  ) AS learning
  FULL JOIN (
    SELECT session.situation
    FROM public.vocab_dialogue_sessions AS session
    JOIN public.vocab_dialogue_targets AS target
      ON target.dialogue_session_id = session.id
     AND target.user_id = session.user_id
     AND target.sense_id = p_sense_id
    JOIN public.vocab_review_events AS event
      ON event.dialogue_session_id = session.id
     AND event.user_id = session.user_id
     AND event.sense_id = target.sense_id
    WHERE session.user_id = p_user_id
      AND session.status = 'assessed'
      AND session.mode = 'retention'
      AND session.user_id = event.user_id
      AND target.is_transfer IS FALSE
      AND target.moves_schedule IS FALSE
      AND target.retention_days = event.retention_days
      AND event.retention_days IN (7, 30)
      AND event.is_transfer IS FALSE
      AND event.source = 'dialogue'
      AND event.card_type = 'production'
      AND event.verdict = 'produced'
      AND event.quality = 5
      AND event.evidence_text IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(event.evidence_text)) > 0
      AND event.ease_before = event.ease_after
      AND event.interval_before = event.interval_after
      AND event.repetitions_before = event.repetitions_after
      AND event.lapses_before = event.lapses_after
      AND event.due_before IS NOT DISTINCT FROM event.due_after
      AND public.vocab_text_contains_headword(event.evidence_text, target.headword) IS TRUE
      AND EXISTS (
        SELECT 1
        FROM public.vocab_dialogue_turns AS turn
        WHERE turn.dialogue_session_id = event.dialogue_session_id
          AND turn.user_id = event.user_id
          AND turn.role = 'user'
          AND pg_catalog.strpos(turn.content, pg_catalog.btrim(event.evidence_text)) > 0
      )
      AND public.vocab_retention_anchor_at(p_user_id, p_sense_id) IS NOT NULL
      AND event.created_at >= public.vocab_retention_anchor_at(p_user_id, p_sense_id)
        + (event.retention_days * INTERVAL '24 hours')
      AND public.vocab_situation_valid(session.situation)
    ORDER BY session.created_at, session.id, event.created_at, event.id
    LIMIT 1
  ) AS retention ON TRUE;
$function$;

CREATE OR REPLACE FUNCTION public.vocab_transfer_can_confirm(
  p_user_id UUID,
  p_dialogue_session_id UUID,
  p_sense_id UUID,
  p_situation JSONB,
  p_baseline JSONB,
  p_source TEXT,
  p_card_type TEXT,
  p_verdict TEXT,
  p_quality INTEGER,
  p_evidence TEXT,
  p_reviewed_at TIMESTAMP WITH TIME ZONE,
  p_except_event_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT
    p_source = 'dialogue'
    AND p_card_type = 'production'
    AND p_verdict = 'produced'
    AND p_quality = 5
    AND p_evidence IS NOT NULL
    AND pg_catalog.char_length(pg_catalog.btrim(p_evidence)) > 0
    AND public.vocab_situation_valid(p_situation) IS TRUE
    AND public.vocab_transfer_baseline_valid(p_baseline) IS TRUE
    AND public.vocab_transfer_baseline_records(p_user_id, p_sense_id) IS NOT NULL
    AND p_baseline = public.vocab_transfer_baseline_records(p_user_id, p_sense_id)
    AND public.vocab_transfer_is_novel(p_situation, p_baseline)
    AND public.vocab_retention_confirmed(p_user_id, p_sense_id, p_reviewed_at)
    AND EXISTS (
      SELECT 1
      FROM public.vocab_dialogue_sessions AS session
      JOIN public.vocab_dialogue_targets AS target
        ON target.dialogue_session_id = session.id
       AND target.user_id = session.user_id
       AND target.sense_id = p_sense_id
      WHERE session.id = p_dialogue_session_id
        AND session.user_id = p_user_id
        AND session.mode = 'transfer'
        AND public.vocab_situation_same(session.situation, p_situation)
        AND target.is_transfer IS TRUE
        AND target.moves_schedule IS FALSE
        AND target.retention_days IS NULL
        AND target.baseline_situations = p_baseline
        AND target.novelty_ok IS TRUE
        AND public.vocab_text_contains_headword(p_evidence, target.headword) IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.vocab_dialogue_turns AS turn
      WHERE turn.dialogue_session_id = p_dialogue_session_id
        AND turn.user_id = p_user_id
        AND turn.role = 'user'
        AND pg_catalog.strpos(turn.content, pg_catalog.btrim(p_evidence)) > 0
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.vocab_review_events AS prior
      WHERE prior.user_id = p_user_id
        AND prior.sense_id = p_sense_id
        AND prior.transfer_confirmed IS TRUE
        AND (p_except_event_id IS NULL OR prior.id IS DISTINCT FROM p_except_event_id)
    );
$function$;

-- ---------------------------------------------------------------------------
-- Триггеры: происхождение baseline и заморозка истории.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vocab_guard_transfer_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.mode = 'transfer' THEN
    IF NEW.situation IS NULL OR public.vocab_situation_valid(NEW.situation) IS NOT TRUE THEN
      RAISE EXCEPTION 'transfer session requires a valid situation'
        USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.situation IS NOT NULL AND public.vocab_situation_valid(NEW.situation) IS NOT TRUE THEN
    RAISE EXCEPTION 'dialogue situation is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE' THEN
  IF (
       OLD.id IS DISTINCT FROM NEW.id
       OR OLD.mode IS DISTINCT FROM NEW.mode
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.situation IS DISTINCT FROM NEW.situation
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
     )
     AND EXISTS (
    SELECT 1
    FROM public.vocab_review_events AS event
    WHERE event.user_id = OLD.user_id
      AND event.is_transfer IS TRUE
      AND (
        event.dialogue_session_id = OLD.id
        OR (
          OLD.situation IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements(event.baseline_situations) AS item(value)
            WHERE public.vocab_situation_same(item.value->'situation', OLD.situation)
              AND (
                (
                  item.value->>'source' = 'learning'
                  AND OLD.mode IN ('chat', 'roleplay', 'debate')
                  AND EXISTS (
                    SELECT 1
                    FROM public.vocab_review_events AS proof
                    WHERE proof.dialogue_session_id = OLD.id
                      AND proof.user_id = OLD.user_id
                      AND proof.sense_id = event.sense_id
                      AND proof.source = 'dialogue'
                      AND proof.card_type = 'production'
                      AND proof.retention_days IS NULL
                      AND proof.is_transfer IS FALSE
                      AND proof.verdict IN ('produced', 'wrong_sense', 'hinted', 'echoed', 'mentioned')
                  )
                )
                OR (
                  item.value->>'source' = 'retention'
                  AND OLD.mode = 'retention'
                  AND EXISTS (
                    SELECT 1
                    FROM public.vocab_review_events AS proof
                    WHERE proof.dialogue_session_id = OLD.id
                      AND proof.user_id = OLD.user_id
                      AND proof.sense_id = event.sense_id
                      AND proof.retention_days IN (7, 30)
                      AND proof.is_transfer IS FALSE
                      AND proof.verdict = 'produced'
                  )
                )
              )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'session origin is frozen after a transfer event'
      USING ERRCODE = '22023';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND OLD.situation IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.vocab_review_events AS event
       WHERE event.user_id = OLD.user_id
         AND event.is_transfer IS TRUE
         AND event.dialogue_session_id IS DISTINCT FROM OLD.id
         AND EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_array_elements(event.baseline_situations) AS item(value)
           WHERE public.vocab_situation_same(item.value->'situation', OLD.situation)
             AND (
               (
                 item.value->>'source' = 'learning'
                 AND OLD.mode IN ('chat', 'roleplay', 'debate')
                 AND EXISTS (
                   SELECT 1
                   FROM public.vocab_review_events AS proof
                   WHERE proof.dialogue_session_id = OLD.id
                     AND proof.user_id = OLD.user_id
                     AND proof.sense_id = event.sense_id
                     AND proof.source = 'dialogue'
                     AND proof.card_type = 'production'
                     AND proof.retention_days IS NULL
                     AND proof.is_transfer IS FALSE
                     AND proof.verdict IN ('produced', 'wrong_sense', 'hinted', 'echoed', 'mentioned')
                 )
               )
               OR (
                 item.value->>'source' = 'retention'
                 AND OLD.mode = 'retention'
                 AND EXISTS (
                   SELECT 1
                   FROM public.vocab_review_events AS proof
                   WHERE proof.dialogue_session_id = OLD.id
                     AND proof.user_id = OLD.user_id
                     AND proof.sense_id = event.sense_id
                     AND proof.retention_days IN (7, 30)
                     AND proof.is_transfer IS FALSE
                     AND proof.verdict = 'produced'
                 )
               )
             )
         )
     )
  THEN
    RAISE EXCEPTION 'source session status is frozen after a transfer event'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vocab_dialogue_targets AS target
    WHERE target.dialogue_session_id = NEW.id
      AND target.user_id = NEW.user_id
      AND (
        (NEW.mode = 'transfer' AND target.is_transfer IS NOT TRUE)
        OR (NEW.mode IS DISTINCT FROM 'transfer' AND target.is_transfer IS TRUE)
        OR (
          NEW.mode = 'transfer'
          AND target.novelty_ok IS DISTINCT FROM public.vocab_transfer_is_novel(NEW.situation, target.baseline_situations)
        )
      )
  ) THEN
    RAISE EXCEPTION 'transfer session does not match its targets'
      USING ERRCODE = '22023';
  END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vocab_guard_transfer_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_mode TEXT;
  v_situation JSONB;
  v_owner UUID;
  v_records JSONB;
  v_history BOOLEAN;
BEGIN
  SELECT mode, situation, user_id
  INTO v_mode, v_situation, v_owner
  FROM public.vocab_dialogue_sessions
  WHERE id = NEW.dialogue_session_id;

  IF NOT FOUND OR v_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'transfer target does not belong to this user session'
      USING ERRCODE = '22023';
  END IF;

  v_history := FALSE;
  IF TG_OP = 'UPDATE' THEN
  v_history := EXISTS (
    SELECT 1
    FROM public.vocab_review_events AS event
    WHERE event.is_transfer IS TRUE
      AND event.user_id = OLD.user_id
      AND event.sense_id = OLD.sense_id
      AND (
        event.dialogue_session_id = OLD.dialogue_session_id
        OR EXISTS (
          SELECT 1
          FROM public.vocab_dialogue_sessions AS session
          WHERE session.id = OLD.dialogue_session_id
            AND session.user_id = OLD.user_id
            AND EXISTS (
              SELECT 1
              FROM pg_catalog.jsonb_array_elements(event.baseline_situations) AS item(value)
              WHERE public.vocab_situation_same(item.value->'situation', session.situation)
                AND (
                  (
                    item.value->>'source' = 'learning'
                    AND session.mode IN ('chat', 'roleplay', 'debate')
                    AND EXISTS (
                      SELECT 1
                      FROM public.vocab_review_events AS proof
                      WHERE proof.dialogue_session_id = session.id
                        AND proof.user_id = OLD.user_id
                        AND proof.sense_id = OLD.sense_id
                        AND proof.source = 'dialogue'
                        AND proof.card_type = 'production'
                        AND proof.retention_days IS NULL
                        AND proof.is_transfer IS FALSE
                        AND proof.verdict IN ('produced', 'wrong_sense', 'hinted', 'echoed', 'mentioned')
                    )
                  )
                  OR (
                    item.value->>'source' = 'retention'
                    AND session.mode = 'retention'
                    AND EXISTS (
                      SELECT 1
                      FROM public.vocab_review_events AS proof
                      WHERE proof.dialogue_session_id = session.id
                        AND proof.user_id = OLD.user_id
                        AND proof.sense_id = OLD.sense_id
                        AND proof.retention_days IN (7, 30)
                        AND proof.is_transfer IS FALSE
                        AND proof.verdict = 'produced'
                    )
                  )
                )
            )
        )
      )
  );
  END IF;

  IF v_history THEN
  IF (
    OLD.id IS DISTINCT FROM NEW.id
    OR OLD.dialogue_session_id IS DISTINCT FROM NEW.dialogue_session_id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.sense_id IS DISTINCT FROM NEW.sense_id
    OR OLD.headword IS DISTINCT FROM NEW.headword
    OR OLD.is_transfer IS DISTINCT FROM NEW.is_transfer
    OR OLD.baseline_situations IS DISTINCT FROM NEW.baseline_situations
    OR OLD.novelty_ok IS DISTINCT FROM NEW.novelty_ok
    OR OLD.moves_schedule IS DISTINCT FROM NEW.moves_schedule
    OR OLD.retention_days IS DISTINCT FROM NEW.retention_days
  ) THEN
    RAISE EXCEPTION 'transfer target history is frozen'
      USING ERRCODE = '22023';
  END IF;
  END IF;

  IF NEW.is_transfer IS TRUE THEN
    IF v_mode IS DISTINCT FROM 'transfer'
       OR NEW.moves_schedule IS DISTINCT FROM FALSE
       OR NEW.retention_days IS NOT NULL
    THEN
      RAISE EXCEPTION 'transfer target contradicts the session'
        USING ERRCODE = '22023';
    END IF;
    IF NOT v_history THEN
      v_records := public.vocab_transfer_baseline_records(NEW.user_id, NEW.sense_id);
      IF v_records IS NULL
         OR NEW.baseline_situations IS DISTINCT FROM v_records
         OR NEW.novelty_ok IS DISTINCT FROM public.vocab_transfer_is_novel(v_situation, v_records)
      THEN
        RAISE EXCEPTION 'transfer baseline must come from recorded learning and retention'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF v_mode = 'transfer'
     OR NEW.baseline_situations IS NOT NULL
     OR NEW.novelty_ok IS NOT NULL
  THEN
    RAISE EXCEPTION 'ordinary target cannot carry transfer fields'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vocab_guard_transfer_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_mode TEXT;
  v_situation JSONB;
  v_session_owner UUID;
  v_baseline JSONB;
  v_novelty BOOLEAN;
  v_target_transfer BOOLEAN;
  v_target_owner UUID;
BEGIN
  -- Имя триггера идёт раньше append-only, поэтому заморозка полей срабатывает первой.
  -- Замена ease_before вместе с ease_after тоже запрещена: сравнивается каждое поле.
  -- vocab_review_events_append_only_trigger после этого запрещает и пустое UPDATE.
  IF TG_OP = 'UPDATE' THEN
  IF (OLD.is_transfer IS TRUE OR NEW.is_transfer IS TRUE) AND (
    OLD.id IS DISTINCT FROM NEW.id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.sense_id IS DISTINCT FROM NEW.sense_id
    OR OLD.dialogue_session_id IS DISTINCT FROM NEW.dialogue_session_id
    OR OLD.source IS DISTINCT FROM NEW.source
    OR OLD.card_type IS DISTINCT FROM NEW.card_type
    OR OLD.quality IS DISTINCT FROM NEW.quality
    OR OLD.verdict IS DISTINCT FROM NEW.verdict
    OR OLD.evidence_text IS DISTINCT FROM NEW.evidence_text
    OR OLD.hint_used IS DISTINCT FROM NEW.hint_used
    OR OLD.client_request_id IS DISTINCT FROM NEW.client_request_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.retention_days IS DISTINCT FROM NEW.retention_days
    OR OLD.is_transfer IS DISTINCT FROM NEW.is_transfer
    OR OLD.situation IS DISTINCT FROM NEW.situation
    OR OLD.baseline_situations IS DISTINCT FROM NEW.baseline_situations
    OR OLD.novelty_ok IS DISTINCT FROM NEW.novelty_ok
    OR OLD.transfer_confirmed IS DISTINCT FROM NEW.transfer_confirmed
    OR OLD.ease_before IS DISTINCT FROM NEW.ease_before
    OR OLD.ease_after IS DISTINCT FROM NEW.ease_after
    OR OLD.interval_before IS DISTINCT FROM NEW.interval_before
    OR OLD.interval_after IS DISTINCT FROM NEW.interval_after
    OR OLD.repetitions_before IS DISTINCT FROM NEW.repetitions_before
    OR OLD.repetitions_after IS DISTINCT FROM NEW.repetitions_after
    OR OLD.lapses_before IS DISTINCT FROM NEW.lapses_before
    OR OLD.lapses_after IS DISTINCT FROM NEW.lapses_after
    OR OLD.due_before IS DISTINCT FROM NEW.due_before
    OR OLD.due_after IS DISTINCT FROM NEW.due_after
  ) THEN
    RAISE EXCEPTION 'transfer event history is frozen'
      USING ERRCODE = '22023';
  END IF;
  END IF;

  IF NEW.is_transfer IS NOT TRUE THEN
    IF NEW.situation IS NOT NULL
       OR NEW.baseline_situations IS NOT NULL
       OR NEW.novelty_ok IS NOT NULL
       OR NEW.transfer_confirmed IS TRUE
    THEN
      RAISE EXCEPTION 'ordinary review event cannot carry transfer fields'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  SELECT mode, situation, user_id
  INTO v_mode, v_situation, v_session_owner
  FROM public.vocab_dialogue_sessions
  WHERE id = NEW.dialogue_session_id;

  SELECT baseline_situations, novelty_ok, is_transfer, user_id
  INTO v_baseline, v_novelty, v_target_transfer, v_target_owner
  FROM public.vocab_dialogue_targets
  WHERE dialogue_session_id = NEW.dialogue_session_id
    AND sense_id = NEW.sense_id;

  IF v_session_owner IS DISTINCT FROM NEW.user_id
     OR v_target_owner IS DISTINCT FROM NEW.user_id
     OR v_mode IS DISTINCT FROM 'transfer'
     OR v_target_transfer IS NOT TRUE
     OR NEW.retention_days IS NOT NULL
     OR NEW.situation IS DISTINCT FROM v_situation
     OR NEW.baseline_situations IS DISTINCT FROM v_baseline
     OR NEW.novelty_ok IS DISTINCT FROM v_novelty
     OR NEW.baseline_situations IS DISTINCT FROM public.vocab_transfer_baseline_records(NEW.user_id, NEW.sense_id)
     OR NEW.novelty_ok IS DISTINCT FROM public.vocab_transfer_is_novel(NEW.situation, NEW.baseline_situations)
     OR NEW.ease_before IS DISTINCT FROM NEW.ease_after
     OR NEW.interval_before IS DISTINCT FROM NEW.interval_after
     OR NEW.repetitions_before IS DISTINCT FROM NEW.repetitions_after
     OR NEW.lapses_before IS DISTINCT FROM NEW.lapses_after
     OR NEW.due_before IS DISTINCT FROM NEW.due_after
  THEN
    RAISE EXCEPTION 'transfer event contradicts the saved session'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.transfer_confirmed IS TRUE THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('vocab-transfer:' || NEW.user_id::text),
      pg_catalog.hashtext(NEW.sense_id::text)
    );
    IF NEW.source IS DISTINCT FROM 'dialogue'
       OR NEW.card_type IS DISTINCT FROM 'production'
       OR NEW.verdict IS DISTINCT FROM 'produced'
       OR NEW.quality IS DISTINCT FROM 5
       OR NEW.evidence_text IS NULL
       OR pg_catalog.char_length(pg_catalog.btrim(NEW.evidence_text)) = 0
       OR public.vocab_situation_valid(NEW.situation) IS NOT TRUE
       OR public.vocab_transfer_baseline_valid(NEW.baseline_situations) IS NOT TRUE
    THEN
      RAISE EXCEPTION 'transfer confirmation conditions are not met'
        USING ERRCODE = '22023';
    END IF;
    IF public.vocab_transfer_can_confirm(
         NEW.user_id,
         NEW.dialogue_session_id,
         NEW.sense_id,
         NEW.situation,
         NEW.baseline_situations,
         NEW.source,
         NEW.card_type,
         NEW.verdict,
         NEW.quality,
         NEW.evidence_text,
         NEW.created_at,
         NULL
       ) IS NOT TRUE
    THEN
      IF EXISTS (
        SELECT 1
        FROM public.vocab_review_events AS prior
        WHERE prior.user_id = NEW.user_id
          AND prior.sense_id = NEW.sense_id
          AND prior.transfer_confirmed IS TRUE
      ) THEN
        NEW.transfer_confirmed := FALSE;
      ELSE
        RAISE EXCEPTION 'transfer confirmation conditions are not met'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vocab_dialogue_sessions_transfer_guard ON public.vocab_dialogue_sessions;
CREATE TRIGGER vocab_dialogue_sessions_transfer_guard
  BEFORE INSERT OR UPDATE ON public.vocab_dialogue_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.vocab_guard_transfer_session();

DROP TRIGGER IF EXISTS vocab_dialogue_targets_transfer_guard ON public.vocab_dialogue_targets;
CREATE TRIGGER vocab_dialogue_targets_transfer_guard
  BEFORE INSERT OR UPDATE ON public.vocab_dialogue_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.vocab_guard_transfer_target();

DROP TRIGGER IF EXISTS vocab_review_events_transfer_guard ON public.vocab_review_events;
DROP TRIGGER IF EXISTS vocab_review_events__transfer_guard ON public.vocab_review_events;
CREATE TRIGGER vocab_review_events__transfer_guard
  BEFORE INSERT OR UPDATE ON public.vocab_review_events
  FOR EACH ROW
  EXECUTE FUNCTION public.vocab_guard_transfer_event();

-- ---------------------------------------------------------------------------
-- RPC шага 4 плюс запрет клиентских полей переноса.
-- Повтор assessed-сессии и client_request_id сохранены.
-- ---------------------------------------------------------------------------

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
  v_records JSONB;
  v_novel BOOLEAN;
  v_transfer_confirmed BOOLEAN;
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
  WHERE id = p_dialogue_session_id;

  IF NOT FOUND
     OR v_session.user_id IS DISTINCT FROM p_user_id
     OR v_session.language IS DISTINCT FROM p_language
     OR v_session.mode NOT IN ('chat', 'roleplay', 'debate', 'retention', 'transfer')
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found', 'items', '[]'::jsonb, 'replayed', false);
  END IF;

  -- Смыслы блокируются по возрастанию id до блокировки строки сессии.
  -- Так две сессии одного смысла не подтверждают перенос одновременно,
  -- и вставка события не пересекается с FOR UPDATE в обратном порядке.
  FOR v_sense_id IN
    SELECT target.sense_id
    FROM public.vocab_dialogue_targets AS target
    WHERE target.dialogue_session_id = p_dialogue_session_id
      AND target.user_id = p_user_id
    ORDER BY target.sense_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('vocab-transfer:' || p_user_id::text),
      pg_catalog.hashtext(v_sense_id::text)
    );
  END LOOP;

  SELECT *
  INTO v_session
  FROM public.vocab_dialogue_sessions
  WHERE id = p_dialogue_session_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.user_id IS DISTINCT FROM p_user_id
     OR v_session.language IS DISTINCT FROM p_language
     OR v_session.mode NOT IN ('chat', 'roleplay', 'debate', 'retention', 'transfer')
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

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(item.value->'sense_id') IS DISTINCT FROM 'string'
       OR (item.value->>'sense_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'commit_vocab_dialogue_assessment sense id is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
    GROUP BY item.value->>'sense_id'
    HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.vocab_dialogue_targets AS target
      WHERE target.dialogue_session_id = p_dialogue_session_id
        AND target.user_id = p_user_id
        AND target.sense_id = (item.value->>'sense_id')::uuid
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.vocab_dialogue_targets AS target
    WHERE target.dialogue_session_id = p_dialogue_session_id
      AND target.user_id = p_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
        WHERE (item.value->>'sense_id')::uuid = target.sense_id
      )
  ) THEN
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

    IF v_item ? 'novelty_ok'
       OR v_item ? 'transfer_confirmed'
       OR v_item ? 'is_transfer'
       OR v_item ? 'situation'
       OR v_item ? 'baseline_situations'
       OR v_item ? 'retention_days'
    THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment client cannot assign diagnosis fields'
        USING ERRCODE = '22023';
    END IF;

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

    IF v_session.mode = 'transfer' THEN
      v_records := public.vocab_transfer_baseline_records(p_user_id, v_sense_id);
      v_novel := public.vocab_transfer_is_novel(v_session.situation, v_records);
      IF v_target.is_transfer IS NOT TRUE
         OR v_target.moves_schedule IS DISTINCT FROM FALSE
         OR v_target.retention_days IS NOT NULL
         OR v_records IS NULL
         OR v_target.baseline_situations IS DISTINCT FROM v_records
         OR v_target.novelty_ok IS DISTINCT FROM v_novel
      THEN
        RAISE EXCEPTION 'commit_vocab_dialogue_assessment transfer target is not valid'
          USING ERRCODE = '22023';
      END IF;
    ELSIF v_target.is_transfer IS TRUE
       OR v_target.novelty_ok IS NOT NULL
       OR v_target.baseline_situations IS NOT NULL
    THEN
      RAISE EXCEPTION 'commit_vocab_dialogue_assessment transfer fields belong to a transfer session'
        USING ERRCODE = '22023';
    END IF;

    v_moving := v_verdict IN ('produced', 'wrong_sense')
      AND v_target.moves_schedule IS TRUE
      AND v_target.retention_days IS NULL
      AND v_target.is_transfer IS NOT TRUE
      AND v_session.mode IS DISTINCT FROM 'retention'
      AND v_session.mode IS DISTINCT FROM 'transfer';

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
      AND v_target.is_transfer IS NOT TRUE
      AND v_session.mode IS DISTINCT FROM 'retention'
      AND v_session.mode IS DISTINCT FROM 'transfer';

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

    IF v_session.mode = 'transfer' THEN
      v_records := public.vocab_transfer_baseline_records(p_user_id, v_sense_id);
      v_novel := public.vocab_transfer_is_novel(v_session.situation, v_records);
      v_transfer_confirmed := public.vocab_transfer_can_confirm(
        p_user_id,
        p_dialogue_session_id,
        v_sense_id,
        v_session.situation,
        v_records,
        'dialogue',
        'production',
        v_verdict,
        v_quality,
        v_evidence,
        p_reviewed_at,
        NULL
      );
    ELSE
      v_records := NULL;
      v_novel := NULL;
      v_transfer_confirmed := FALSE;
    END IF;

    INSERT INTO public.vocab_review_events (
      user_id, sense_id, card_type, quality, verdict, source, hint_used, evidence_text,
      dialogue_session_id, client_request_id, retention_days,
      is_transfer, situation, baseline_situations, novelty_ok, transfer_confirmed,
      ease_before, ease_after, interval_before, interval_after,
      repetitions_before, repetitions_after, lapses_before, lapses_after,
      due_before, due_after, created_at
    ) VALUES (
      p_user_id, v_sense_id, 'production', v_quality, v_verdict, 'dialogue', v_hint_used, v_evidence,
      p_dialogue_session_id, v_request_id || ':' || v_sense_id::text, v_target.retention_days,
      v_target.is_transfer,
      CASE WHEN v_target.is_transfer THEN v_session.situation ELSE NULL END,
      CASE WHEN v_target.is_transfer THEN v_records ELSE NULL END,
      CASE WHEN v_target.is_transfer THEN v_novel ELSE NULL END,
      COALESCE(v_transfer_confirmed, FALSE),
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

REVOKE ALL ON FUNCTION public.vocab_situation_valid(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_situation_valid(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_situation_valid(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_situation_valid(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_role_set(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_role_set(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_role_set(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_role_set(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_context_differs(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_context_differs(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_context_differs(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_context_differs(JSONB, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_situations_differ(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_situations_differ(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_situations_differ(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_situations_differ(JSONB, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_situation_same(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_situation_same(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_situation_same(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_situation_same(JSONB, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_transfer_baseline_valid(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_transfer_baseline_valid(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_transfer_baseline_valid(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_transfer_baseline_valid(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_transfer_is_novel(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_transfer_is_novel(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_transfer_is_novel(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_transfer_is_novel(JSONB, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_retention_anchor_at(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_retention_anchor_at(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_retention_anchor_at(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_retention_anchor_at(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_retention_confirmed(UUID, UUID, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_retention_confirmed(UUID, UUID, TIMESTAMP WITH TIME ZONE) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_retention_confirmed(UUID, UUID, TIMESTAMP WITH TIME ZONE) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_retention_confirmed(UUID, UUID, TIMESTAMP WITH TIME ZONE) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_transfer_baseline_records(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_transfer_baseline_records(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_transfer_baseline_records(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_transfer_baseline_records(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_transfer_can_confirm(UUID, UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_transfer_can_confirm(UUID, UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.vocab_transfer_can_confirm(UUID, UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_transfer_can_confirm(UUID, UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.vocab_guard_transfer_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_guard_transfer_session() FROM anon;
REVOKE ALL ON FUNCTION public.vocab_guard_transfer_session() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_guard_transfer_session() TO service_role;

REVOKE ALL ON FUNCTION public.vocab_guard_transfer_target() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_guard_transfer_target() FROM anon;
REVOKE ALL ON FUNCTION public.vocab_guard_transfer_target() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_guard_transfer_target() TO service_role;

REVOKE ALL ON FUNCTION public.vocab_guard_transfer_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vocab_guard_transfer_event() FROM anon;
REVOKE ALL ON FUNCTION public.vocab_guard_transfer_event() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_guard_transfer_event() TO service_role;

REVOKE ALL ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_vocab_dialogue_assessment(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB) TO service_role;
