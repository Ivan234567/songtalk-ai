-- Debate completions: one row per "Завершить дебат" click per user
CREATE TABLE IF NOT EXISTS debate_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  topic_ru TEXT,
  user_position TEXT NOT NULL CHECK (user_position IN ('for', 'against')),
  ai_position TEXT NOT NULL CHECK (ai_position IN ('for', 'against')),
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  completed_step_ids JSONB,
  feedback TEXT,
  useful_phrase_en TEXT,
  useful_phrase_ru TEXT,
  assessment_id UUID REFERENCES speaking_assessments(id) ON DELETE SET NULL,
  debate_session_id UUID REFERENCES debate_sessions(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debate_completions_user_id ON debate_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_debate_completions_user_topic ON debate_completions(user_id, topic);
CREATE INDEX IF NOT EXISTS idx_debate_completions_completed_at ON debate_completions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_debate_completions_assessment_id ON debate_completions(assessment_id) WHERE assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debate_completions_debate_session_id ON debate_completions(debate_session_id) WHERE debate_session_id IS NOT NULL;

ALTER TABLE debate_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own debate completions" ON debate_completions;
CREATE POLICY "Users can view their own debate completions"
  ON debate_completions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own debate completions" ON debate_completions;
CREATE POLICY "Users can insert their own debate completions"
  ON debate_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own debate completions" ON debate_completions;
CREATE POLICY "Users can update their own debate completions"
  ON debate_completions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own debate completions" ON debate_completions;
CREATE POLICY "Users can delete their own debate completions"
  ON debate_completions FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE debate_completions IS 'Debate completions: one row per completed debate per user';
COMMENT ON COLUMN debate_completions.topic IS 'Debate topic (English)';
COMMENT ON COLUMN debate_completions.topic_ru IS 'Debate topic (Russian translation, if available)';
COMMENT ON COLUMN debate_completions.completed_step_ids IS 'Step ids completed at completion time (e.g. ["opening", "main-argument"])';
COMMENT ON COLUMN debate_completions.feedback IS 'Short AI feedback after debate completion';
COMMENT ON COLUMN debate_completions.useful_phrase_en IS 'One useful phrase in English to remember';
COMMENT ON COLUMN debate_completions.useful_phrase_ru IS 'Russian translation of useful_phrase_en';
COMMENT ON COLUMN debate_completions.assessment_id IS 'Reference to speaking assessment if user requested speech evaluation';
COMMENT ON COLUMN debate_completions.debate_session_id IS 'Reference to debate_sessions table for full conversation history';
