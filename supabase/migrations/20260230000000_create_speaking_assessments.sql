-- Speaking assessments: AI-based evaluation of user speaking skills
-- Criteria: fluency, vocabulary_grammar, pronunciation, completeness, dialogue_skills (for dialogues)

CREATE TABLE IF NOT EXISTS speaking_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  scenario_id TEXT,
  scenario_title TEXT,
  format TEXT NOT NULL DEFAULT 'dialogue' CHECK (format IN ('dialogue', 'monologue', 'presentation')),
  criteria_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_score REAL,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE speaking_assessments IS 'AI assessments of user speaking skills based on rubric (fluency, vocabulary, grammar, pronunciation, completeness, dialogue skills)';
COMMENT ON COLUMN speaking_assessments.criteria_scores IS 'Scores 1-10 per criterion: fluency, vocabulary_grammar, pronunciation, completeness, dialogue_skills';
COMMENT ON COLUMN speaking_assessments.feedback IS ' strengths, improvements, detailed per-criterion feedback';

CREATE INDEX IF NOT EXISTS idx_speaking_assessments_user_id ON speaking_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_speaking_assessments_agent_session_id ON speaking_assessments(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_speaking_assessments_created_at ON speaking_assessments(created_at DESC);

ALTER TABLE speaking_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own speaking assessments"
  ON speaking_assessments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own speaking assessments"
  ON speaking_assessments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own speaking assessments"
  ON speaking_assessments FOR DELETE
  USING (auth.uid() = user_id);
