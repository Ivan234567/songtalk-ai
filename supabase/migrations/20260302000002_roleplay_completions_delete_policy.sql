-- Allow users to delete their own roleplay completions (for reset progress)
CREATE POLICY "Users can delete their own roleplay completions"
  ON roleplay_completions FOR DELETE
  USING (auth.uid() = user_id);
