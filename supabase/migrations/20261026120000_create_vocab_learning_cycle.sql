-- Учебный цикл: значения слов, две карточки SM-2, журнал и учебный диалог.
-- Существующие таблицы не изменяются. Строки значений из translations не создаются.
--
-- auth.uid() — это идентификатор пользователя из Supabase Auth JWT (auth.users.id).
-- Backend JWT подписывается отдельно (BACKEND_JWT_SECRET) и в auth.uid() не превращается.
-- Backend ходит в базу через SUPABASE_SERVICE_ROLE_KEY: этот клиент обходит RLS.
-- Поэтому политики ниже защищают прямое чтение сессией Supabase.
-- Запись рассчитана на серверные маршруты: они сами проверяют владельца по sub backend JWT.
-- У журнала нет политик UPDATE/DELETE, а UPDATE дополнительно запрещён триггером.

-- ============================================================================
-- vocab_senses — изучаемое значение слова пользователя
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_senses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id UUID NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'zh')),
  headword TEXT NOT NULL CHECK (char_length(btrim(headword)) > 0),
  gloss_ru TEXT CHECK (gloss_ru IS NULL OR char_length(btrim(gloss_ru)) > 0),
  part_of_speech TEXT,
  context_text TEXT,
  sense_key TEXT NOT NULL CHECK (char_length(btrim(sense_key)) BETWEEN 1 AND 200),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (vocabulary_id, sense_key),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_senses_user_language
  ON vocab_senses (user_id, language);

DROP TRIGGER IF EXISTS update_vocab_senses_updated_at ON vocab_senses;
CREATE TRIGGER update_vocab_senses_updated_at
  BEFORE UPDATE ON vocab_senses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- vocab_srs_states — отдельно понимание и речь
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_srs_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sense_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL CHECK (card_type IN ('recognition', 'production')),
  ease_factor NUMERIC(8, 2) NOT NULL DEFAULT 2.5 CHECK (ease_factor >= 1.3),
  interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  lapses INTEGER NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  due_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (sense_id, card_type),
  FOREIGN KEY (sense_id, user_id) REFERENCES vocab_senses (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vocab_srs_states_due
  ON vocab_srs_states (user_id, card_type, due_at);

DROP TRIGGER IF EXISTS update_vocab_srs_states_updated_at ON vocab_srs_states;
CREATE TRIGGER update_vocab_srs_states_updated_at
  BEFORE UPDATE ON vocab_srs_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- vocab_dialogue_sessions — учебный диалог на 3–5 значений
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_dialogue_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'zh')),
  agent_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('chat', 'roleplay', 'debate')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'assessed', 'abandoned')),
  level_snapshot TEXT NOT NULL CHECK (char_length(btrim(level_snapshot)) > 0),
  request_id TEXT CHECK (request_id IS NULL OR char_length(btrim(request_id)) > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  assessed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  CHECK (status <> 'assessed' OR assessed_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS vocab_dialogue_sessions_agent_uidx
  ON vocab_dialogue_sessions (agent_session_id)
  WHERE agent_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vocab_dialogue_sessions_request_uidx
  ON vocab_dialogue_sessions (user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_dialogue_sessions_user_status
  ON vocab_dialogue_sessions (user_id, language, status, created_at DESC);

DROP TRIGGER IF EXISTS update_vocab_dialogue_sessions_updated_at ON vocab_dialogue_sessions;
CREATE TRIGGER update_vocab_dialogue_sessions_updated_at
  BEFORE UPDATE ON vocab_dialogue_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- vocab_dialogue_targets — значения, которые нужно употребить в этой сессии
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_dialogue_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dialogue_session_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sense_id UUID NOT NULL,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 5),
  headword TEXT NOT NULL CHECK (char_length(btrim(headword)) > 0),
  gloss_ru TEXT CHECK (gloss_ru IS NULL OR char_length(btrim(gloss_ru)) > 0),
  context_text TEXT,
  verdict TEXT CHECK (
    verdict IS NULL OR verdict IN ('produced', 'wrong_sense', 'hinted', 'mentioned', 'unused', 'echoed')
  ),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (dialogue_session_id, sense_id),
  UNIQUE (dialogue_session_id, position),
  FOREIGN KEY (dialogue_session_id, user_id)
    REFERENCES vocab_dialogue_sessions (id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (sense_id, user_id)
    REFERENCES vocab_senses (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vocab_dialogue_targets_session
  ON vocab_dialogue_targets (dialogue_session_id);

-- ============================================================================
-- vocab_dialogue_hints — подсказки, показанные до реплики ученика
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_dialogue_hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dialogue_session_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL CHECK (turn_index >= 0),
  hint_text TEXT NOT NULL CHECK (char_length(btrim(hint_text)) > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (dialogue_session_id, turn_index),
  FOREIGN KEY (dialogue_session_id, user_id)
    REFERENCES vocab_dialogue_sessions (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vocab_dialogue_hints_session
  ON vocab_dialogue_hints (dialogue_session_id);

-- ============================================================================
-- vocab_review_events — журнал. Повтор диалогового разбора одного значения запрещён.
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sense_id UUID NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('recognition', 'production')),
  quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5),
  verdict TEXT NOT NULL CHECK (
    verdict IN (
      'again', 'hard', 'good', 'easy',
      'produced', 'wrong_sense', 'hinted', 'mentioned', 'unused', 'echoed'
    )
  ),
  source TEXT NOT NULL CHECK (source IN ('daily_review', 'dialogue')),
  hint_used BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_text TEXT,
  dialogue_session_id UUID,
  client_request_id TEXT CHECK (client_request_id IS NULL OR char_length(btrim(client_request_id)) > 0),
  ease_before NUMERIC(8, 2) NOT NULL,
  ease_after NUMERIC(8, 2) NOT NULL,
  interval_before INTEGER NOT NULL,
  interval_after INTEGER NOT NULL,
  repetitions_before INTEGER NOT NULL,
  repetitions_after INTEGER NOT NULL,
  lapses_before INTEGER NOT NULL,
  lapses_after INTEGER NOT NULL,
  due_before TIMESTAMP WITH TIME ZONE,
  due_after TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_review_events_source_card CHECK (
    (
      source = 'daily_review'
      AND card_type = 'recognition'
      AND dialogue_session_id IS NULL
      AND verdict IN ('again', 'hard', 'good', 'easy')
    )
    OR (
      source = 'dialogue'
      AND card_type = 'production'
      AND dialogue_session_id IS NOT NULL
      AND verdict IN ('produced', 'wrong_sense', 'hinted', 'mentioned', 'unused', 'echoed')
    )
  ),
  CONSTRAINT vocab_review_events_quality_verdict CHECK (
    (verdict = 'again' AND quality = 1)
    OR (verdict = 'hard' AND quality = 3)
    OR (verdict = 'good' AND quality = 4)
    OR (verdict = 'easy' AND quality = 5)
    OR (verdict = 'produced' AND quality = 5)
    OR (verdict = 'wrong_sense' AND quality = 1)
    OR (verdict IN ('hinted', 'mentioned', 'unused', 'echoed') AND quality BETWEEN 0 AND 5)
  ),
  CONSTRAINT vocab_review_events_schedule_effect CHECK (
    verdict IN ('produced', 'wrong_sense', 'again', 'hard', 'good', 'easy')
    OR (
      ease_before = ease_after
      AND interval_before = interval_after
      AND repetitions_before = repetitions_after
      AND lapses_before = lapses_after
      AND due_before IS NOT DISTINCT FROM due_after
    )
  ),
  CONSTRAINT vocab_review_events_produced_evidence CHECK (
    verdict <> 'produced' OR (evidence_text IS NOT NULL AND char_length(btrim(evidence_text)) > 0)
  ),
  FOREIGN KEY (sense_id, user_id) REFERENCES vocab_senses (id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (dialogue_session_id, user_id)
    REFERENCES vocab_dialogue_sessions (id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS vocab_review_events_dialogue_sense_uidx
  ON vocab_review_events (dialogue_session_id, sense_id)
  WHERE source = 'dialogue' AND dialogue_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vocab_review_events_request_uidx
  ON vocab_review_events (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_review_events_user_created
  ON vocab_review_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_review_events_sense_created
  ON vocab_review_events (sense_id, created_at DESC);

-- ============================================================================
-- Согласованность владельца. Старые таблицы только читаются.
-- ============================================================================

CREATE OR REPLACE FUNCTION vocab_senses_match_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM user_vocabulary uv
    WHERE uv.id = NEW.vocabulary_id
      AND uv.user_id = NEW.user_id
      AND uv.language = NEW.language
      AND uv.word = NEW.headword
  ) THEN
    RAISE EXCEPTION 'vocab_senses owner, language, or headword does not match user_vocabulary'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vocab_srs_states_match_sense()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vocab_senses sense
    WHERE sense.id = NEW.sense_id
      AND sense.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'vocab_srs_states user does not own the sense'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vocab_dialogue_sessions_match_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.agent_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM agent_sessions session
    WHERE session.id = NEW.agent_session_id
      AND session.user_id = NEW.user_id
      AND session.language = NEW.language
  ) THEN
    RAISE EXCEPTION 'vocab_dialogue_sessions agent session does not belong to this user and language'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vocab_dialogue_targets_match_owners()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vocab_dialogue_sessions session
    JOIN vocab_senses sense ON sense.id = NEW.sense_id
    WHERE session.id = NEW.dialogue_session_id
      AND session.user_id = NEW.user_id
      AND sense.user_id = NEW.user_id
      AND sense.language = session.language
      AND sense.headword = NEW.headword
  ) THEN
    RAISE EXCEPTION 'vocab_dialogue_targets session, sense, or headword does not match the owner'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vocab_dialogue_hints_match_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vocab_dialogue_sessions session
    WHERE session.id = NEW.dialogue_session_id
      AND session.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'vocab_dialogue_hints session does not belong to this user'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vocab_review_events_match_owners()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vocab_senses sense
    WHERE sense.id = NEW.sense_id
      AND sense.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'vocab_review_events user does not own the sense'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.source = 'dialogue' AND NOT EXISTS (
    SELECT 1
    FROM vocab_dialogue_targets target
    JOIN vocab_dialogue_sessions session ON session.id = target.dialogue_session_id
    WHERE target.dialogue_session_id = NEW.dialogue_session_id
      AND target.sense_id = NEW.sense_id
      AND session.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'vocab_review_events dialogue target is missing for this user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vocab_review_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'vocab_review_events is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION vocab_senses_create_cards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO vocab_srs_states (sense_id, user_id, card_type, due_at)
  VALUES
    (NEW.id, NEW.user_id, 'recognition', NEW.created_at),
    (NEW.id, NEW.user_id, 'production', NEW.created_at)
  ON CONFLICT (sense_id, card_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vocab_senses_match_owner_trigger ON vocab_senses;
CREATE TRIGGER vocab_senses_match_owner_trigger
  BEFORE INSERT OR UPDATE ON vocab_senses
  FOR EACH ROW
  EXECUTE FUNCTION vocab_senses_match_owner();

DROP TRIGGER IF EXISTS vocab_senses_create_cards_trigger ON vocab_senses;
CREATE TRIGGER vocab_senses_create_cards_trigger
  AFTER INSERT ON vocab_senses
  FOR EACH ROW
  EXECUTE FUNCTION vocab_senses_create_cards();

DROP TRIGGER IF EXISTS vocab_srs_states_match_sense_trigger ON vocab_srs_states;
CREATE TRIGGER vocab_srs_states_match_sense_trigger
  BEFORE INSERT OR UPDATE ON vocab_srs_states
  FOR EACH ROW
  EXECUTE FUNCTION vocab_srs_states_match_sense();

DROP TRIGGER IF EXISTS vocab_dialogue_sessions_match_agent_trigger ON vocab_dialogue_sessions;
CREATE TRIGGER vocab_dialogue_sessions_match_agent_trigger
  BEFORE INSERT OR UPDATE ON vocab_dialogue_sessions
  FOR EACH ROW
  EXECUTE FUNCTION vocab_dialogue_sessions_match_agent();

DROP TRIGGER IF EXISTS vocab_dialogue_targets_match_owners_trigger ON vocab_dialogue_targets;
CREATE TRIGGER vocab_dialogue_targets_match_owners_trigger
  BEFORE INSERT OR UPDATE ON vocab_dialogue_targets
  FOR EACH ROW
  EXECUTE FUNCTION vocab_dialogue_targets_match_owners();

DROP TRIGGER IF EXISTS vocab_dialogue_hints_match_session_trigger ON vocab_dialogue_hints;
CREATE TRIGGER vocab_dialogue_hints_match_session_trigger
  BEFORE INSERT OR UPDATE ON vocab_dialogue_hints
  FOR EACH ROW
  EXECUTE FUNCTION vocab_dialogue_hints_match_session();

DROP TRIGGER IF EXISTS vocab_review_events_match_owners_trigger ON vocab_review_events;
CREATE TRIGGER vocab_review_events_match_owners_trigger
  BEFORE INSERT ON vocab_review_events
  FOR EACH ROW
  EXECUTE FUNCTION vocab_review_events_match_owners();

DROP TRIGGER IF EXISTS vocab_review_events_append_only_trigger ON vocab_review_events;
CREATE TRIGGER vocab_review_events_append_only_trigger
  BEFORE UPDATE ON vocab_review_events
  FOR EACH ROW
  EXECUTE FUNCTION vocab_review_events_append_only();

REVOKE ALL ON FUNCTION vocab_senses_match_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vocab_srs_states_match_sense() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vocab_dialogue_sessions_match_agent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vocab_dialogue_targets_match_owners() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vocab_dialogue_hints_match_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vocab_review_events_match_owners() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vocab_review_events_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vocab_senses_create_cards() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- RLS. Запись клиентом Supabase закрыта: политик INSERT/UPDATE/DELETE нет.
-- service_role эти политики обходит, поэтому маршруты API проверяют user_id сами.
-- ============================================================================

ALTER TABLE vocab_senses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_srs_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_dialogue_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_dialogue_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_dialogue_hints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own vocab senses" ON vocab_senses;
CREATE POLICY "Users can view their own vocab senses"
  ON vocab_senses FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own vocab srs states" ON vocab_srs_states;
CREATE POLICY "Users can view their own vocab srs states"
  ON vocab_srs_states FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own vocab review events" ON vocab_review_events;
CREATE POLICY "Users can view their own vocab review events"
  ON vocab_review_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own vocab dialogue sessions" ON vocab_dialogue_sessions;
CREATE POLICY "Users can view their own vocab dialogue sessions"
  ON vocab_dialogue_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own vocab dialogue targets" ON vocab_dialogue_targets;
CREATE POLICY "Users can view their own vocab dialogue targets"
  ON vocab_dialogue_targets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own vocab dialogue hints" ON vocab_dialogue_hints;
CREATE POLICY "Users can view their own vocab dialogue hints"
  ON vocab_dialogue_hints FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON vocab_review_events FROM anon, authenticated;
GRANT SELECT ON vocab_review_events TO authenticated;

COMMENT ON TABLE vocab_senses IS
  'Изучаемое значение. Уникально в паре vocabulary_id и sense_key. gloss_ru может быть пустым.';
COMMENT ON TABLE vocab_srs_states IS
  'Две карточки на значение: recognition и production. Старт: ease 2.5, интервал 0, repetitions 0, lapses 0, due_at = создание значения.';
COMMENT ON TABLE vocab_review_events IS
  'Append-only журнал. Backend JWT не даёт auth.uid(); service_role обходит RLS и не должен обновлять эти строки.';
COMMENT ON TABLE vocab_dialogue_sessions IS
  'Учебная сессия. level_snapshot — уровень на старте (CEFR, HSK или easy/medium/hard). agent_session_id необязателен.';
COMMENT ON COLUMN vocab_dialogue_sessions.agent_session_id IS
  'Связь с agent_sessions.id того же пользователя и языка. ON DELETE SET NULL.';
COMMENT ON COLUMN vocab_srs_states.due_at IS
  'Для новой карточки совпадает с vocab_senses.created_at. Карточки не обновляют друг друга.';
