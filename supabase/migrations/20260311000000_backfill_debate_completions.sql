-- Backfill debate_completions from existing debate_sessions and speaking_assessments
-- Covers both system and user-created debate topics.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'debate_completions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'debate_sessions'
  ) THEN

    -- 1) Create missing completion rows for old finished debates.
    -- A finished debate is inferred by presence of feedback.
    INSERT INTO debate_completions (
      user_id,
      topic,
      user_position,
      ai_position,
      difficulty,
      completed_step_ids,
      feedback,
      useful_phrase_en,
      useful_phrase_ru,
      assessment_id,
      debate_session_id,
      completed_at
    )
    SELECT
      ds.user_id,
      ds.topic,
      ds.user_position,
      ds.ai_position,
      ds.difficulty,
      ds.completed_step_ids,
      COALESCE(ds.feedback->>'feedback', NULL),
      COALESCE(ds.feedback->>'useful_phrase', NULL),
      COALESCE(ds.feedback->>'useful_phrase_ru', NULL),
      ds.assessment_id,
      ds.id,
      COALESCE(ds.updated_at, ds.created_at, NOW())
    FROM debate_sessions ds
    WHERE ds.feedback IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM debate_completions dc
        WHERE dc.user_id = ds.user_id
          AND dc.debate_session_id = ds.id
      );

    -- 2) Backfill assessment_id for completions that miss it but are linked to a debate session.
    -- Prefer latest matching assessment per (user_id, agent_session_id).
    WITH ranked_assessments AS (
      SELECT
        sa.id,
        sa.user_id,
        sa.agent_session_id,
        sa.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY sa.user_id, sa.agent_session_id
          ORDER BY sa.created_at DESC, sa.id DESC
        ) AS rn
      FROM speaking_assessments sa
      WHERE sa.agent_session_id IS NOT NULL
        AND sa.format = 'debate'
    )
    UPDATE debate_completions dc
    SET assessment_id = ra.id
    FROM ranked_assessments ra
    WHERE dc.assessment_id IS NULL
      AND dc.debate_session_id IS NOT NULL
      AND dc.user_id = ra.user_id
      AND dc.debate_session_id = ra.agent_session_id
      AND ra.rn = 1;

    -- 3) Backfill feedback/phrases from debate_sessions if they are missing in completion.
    UPDATE debate_completions dc
    SET
      feedback = COALESCE(dc.feedback, ds.feedback->>'feedback'),
      useful_phrase_en = COALESCE(dc.useful_phrase_en, ds.feedback->>'useful_phrase'),
      useful_phrase_ru = COALESCE(dc.useful_phrase_ru, ds.feedback->>'useful_phrase_ru')
    FROM debate_sessions ds
    WHERE dc.debate_session_id = ds.id
      AND ds.feedback IS NOT NULL
      AND (
        dc.feedback IS NULL
        OR dc.useful_phrase_en IS NULL
        OR dc.useful_phrase_ru IS NULL
      );

  ELSE
    RAISE NOTICE 'Skip backfill: debate_completions or debate_sessions table does not exist.';
  END IF;
END $$;

