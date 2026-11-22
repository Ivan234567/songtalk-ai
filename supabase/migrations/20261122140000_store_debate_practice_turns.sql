-- Запись реплики практики принимала только chat и roleplay.
-- Дебат, удержание и перенос создают сессию, но ход не сохранялся,
-- поэтому сказанное слово не отмечалось.
-- Разбор карточки не меняется. Функция не вызывается из файла.

CREATE OR REPLACE FUNCTION public.append_vocab_dialogue_exchange(
  p_user_id UUID,
  p_dialogue_session_id UUID,
  p_language TEXT,
  p_user_text TEXT,
  p_assistant_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_session public.vocab_dialogue_sessions%ROWTYPE;
  v_user_text TEXT;
  v_assistant_text TEXT;
  v_last_index INTEGER;
  v_last_user TEXT;
  v_last_assistant TEXT;
  v_next_index INTEGER;
BEGIN
  v_user_text := NULLIF(pg_catalog.btrim(COALESCE(p_user_text, '')), '');
  v_assistant_text := NULLIF(pg_catalog.btrim(COALESCE(p_assistant_text, '')), '');

  IF p_user_id IS NULL
     OR p_dialogue_session_id IS NULL
     OR v_user_text IS NULL
     OR v_assistant_text IS NULL
  THEN
    RAISE EXCEPTION 'append_vocab_dialogue_exchange arguments are incomplete'
      USING ERRCODE = '22023';
  END IF;

  IF p_language IS DISTINCT FROM 'en' AND p_language IS DISTINCT FROM 'zh' THEN
    RAISE EXCEPTION 'append_vocab_dialogue_exchange language must be en or zh'
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
     OR v_session.mode NOT IN ('chat', 'roleplay', 'debate', 'retention', 'transfer')
     OR v_session.status IS DISTINCT FROM 'active'
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found', 'turn_index', NULL);
  END IF;

  SELECT turn_index, content
  INTO v_last_index, v_last_user
  FROM public.vocab_dialogue_turns
  WHERE dialogue_session_id = p_dialogue_session_id
    AND user_id = p_user_id
    AND role = 'user'
  ORDER BY turn_index DESC
  LIMIT 1;

  IF v_last_index IS NOT NULL AND v_last_user = v_user_text THEN
    SELECT content
    INTO v_last_assistant
    FROM public.vocab_dialogue_turns
    WHERE dialogue_session_id = p_dialogue_session_id
      AND user_id = p_user_id
      AND role = 'assistant'
      AND turn_index = v_last_index;
    IF v_last_assistant = v_assistant_text THEN
      RETURN pg_catalog.jsonb_build_object('status', 'replayed', 'turn_index', v_last_index);
    END IF;
  END IF;

  SELECT COALESCE(pg_catalog.max(turn_index), -1) + 1
  INTO v_next_index
  FROM public.vocab_dialogue_turns
  WHERE dialogue_session_id = p_dialogue_session_id
    AND user_id = p_user_id;

  INSERT INTO public.vocab_dialogue_turns (
    dialogue_session_id, user_id, turn_index, role, content
  ) VALUES
    (p_dialogue_session_id, p_user_id, v_next_index, 'user', v_user_text),
    (p_dialogue_session_id, p_user_id, v_next_index, 'assistant', v_assistant_text);

  RETURN pg_catalog.jsonb_build_object('status', 'recorded', 'turn_index', v_next_index);
END;
$function$;

REVOKE ALL ON FUNCTION public.append_vocab_dialogue_exchange(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_vocab_dialogue_exchange(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.append_vocab_dialogue_exchange(UUID, UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_vocab_dialogue_exchange(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
