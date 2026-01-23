-- Migration: Create user_phrasal_verbs table
-- Description: Явный словарь фразовых глаголов пользователя (отдельно от обычных слов и идиом)

CREATE TABLE IF NOT EXISTS user_phrasal_verbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  literal_translation TEXT,
  meaning TEXT,
  usage_examples JSONB DEFAULT '[]'::jsonb,
  source_video_id UUID REFERENCES user_videos(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, phrase)
);

CREATE INDEX IF NOT EXISTS idx_user_phrasal_verbs_user_id ON user_phrasal_verbs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_phrasal_verbs_phrase ON user_phrasal_verbs(phrase);

ALTER TABLE user_phrasal_verbs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own phrasal verbs" ON user_phrasal_verbs;
CREATE POLICY "Users can view their own phrasal verbs"
  ON user_phrasal_verbs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own phrasal verbs" ON user_phrasal_verbs;
CREATE POLICY "Users can insert their own phrasal verbs"
  ON user_phrasal_verbs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own phrasal verbs" ON user_phrasal_verbs;
CREATE POLICY "Users can update their own phrasal verbs"
  ON user_phrasal_verbs FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own phrasal verbs" ON user_phrasal_verbs;
CREATE POLICY "Users can delete their own phrasal verbs"
  ON user_phrasal_verbs FOR DELETE
  USING (auth.uid() = user_id);

-- trigger for updated_at
DROP TRIGGER IF EXISTS update_user_phrasal_verbs_updated_at ON user_phrasal_verbs;
CREATE TRIGGER update_user_phrasal_verbs_updated_at
  BEFORE UPDATE ON user_phrasal_verbs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
