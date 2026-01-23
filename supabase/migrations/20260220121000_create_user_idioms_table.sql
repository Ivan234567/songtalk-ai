-- Migration: Create user_idioms table
-- Description: Явный словарь идиом пользователя (отдельно от обычных слов)

CREATE TABLE IF NOT EXISTS user_idioms (
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

CREATE INDEX IF NOT EXISTS idx_user_idioms_user_id ON user_idioms(user_id);
CREATE INDEX IF NOT EXISTS idx_user_idioms_phrase ON user_idioms(phrase);

ALTER TABLE user_idioms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own idioms" ON user_idioms;
CREATE POLICY "Users can view their own idioms"
  ON user_idioms FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own idioms" ON user_idioms;
CREATE POLICY "Users can insert their own idioms"
  ON user_idioms FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own idioms" ON user_idioms;
CREATE POLICY "Users can update their own idioms"
  ON user_idioms FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own idioms" ON user_idioms;
CREATE POLICY "Users can delete their own idioms"
  ON user_idioms FOR DELETE
  USING (auth.uid() = user_id);

-- trigger for updated_at
DROP TRIGGER IF EXISTS update_user_idioms_updated_at ON user_idioms;
CREATE TRIGGER update_user_idioms_updated_at
  BEFORE UPDATE ON user_idioms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

