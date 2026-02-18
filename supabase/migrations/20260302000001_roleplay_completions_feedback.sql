-- Add short feedback and useful phrase (EN + RU) to roleplay completions
ALTER TABLE roleplay_completions
  ADD COLUMN IF NOT EXISTS feedback TEXT,
  ADD COLUMN IF NOT EXISTS useful_phrase_en TEXT,
  ADD COLUMN IF NOT EXISTS useful_phrase_ru TEXT;

COMMENT ON COLUMN roleplay_completions.feedback IS 'Short AI feedback (1-2 sentences) after scenario completion';
COMMENT ON COLUMN roleplay_completions.useful_phrase_en IS 'One useful phrase in English to remember';
COMMENT ON COLUMN roleplay_completions.useful_phrase_ru IS 'Russian translation of useful_phrase_en';

-- Allow users to update their own rows (to set feedback when it arrives)
CREATE POLICY "Users can update their own roleplay completions"
  ON roleplay_completions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
