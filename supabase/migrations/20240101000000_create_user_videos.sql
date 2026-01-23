-- Create user_videos table to store user's video transcriptions
CREATE TABLE IF NOT EXISTS user_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  video_type TEXT NOT NULL CHECK (video_type IN ('youtube', 'upload')),
  video_id TEXT, -- YouTube video ID or file identifier
  title TEXT,
  transcription_text TEXT,
  transcription_segments JSONB,
  language TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_videos_user_id ON user_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_videos_created_at ON user_videos(created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_videos ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only see their own videos
CREATE POLICY "Users can view their own videos"
  ON user_videos FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: users can insert their own videos
CREATE POLICY "Users can insert their own videos"
  ON user_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: users can update their own videos
CREATE POLICY "Users can update their own videos"
  ON user_videos FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: users can delete their own videos
CREATE POLICY "Users can delete their own videos"
  ON user_videos FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_videos_updated_at
  BEFORE UPDATE ON user_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
