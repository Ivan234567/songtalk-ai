-- Translator history: user translations in the AI translator modal

CREATE TABLE IF NOT EXISTS translator_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('en-ru', 'ru-en')),
  input_text TEXT NOT NULL,
  output_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_translator_history_user_id ON translator_history(user_id);
CREATE INDEX IF NOT EXISTS idx_translator_history_created_at ON translator_history(created_at DESC);

ALTER TABLE translator_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own translator history"
  ON translator_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own translator history"
  ON translator_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own translator history"
  ON translator_history FOR DELETE
  USING (auth.uid() = user_id);
