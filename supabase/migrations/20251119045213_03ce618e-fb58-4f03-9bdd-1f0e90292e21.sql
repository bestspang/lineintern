-- Create storage bucket for generated images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('line-bot-assets', 'line-bot-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for line-bot-assets bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow public read access to line-bot-assets'
  ) THEN
    CREATE POLICY "Allow public read access to line-bot-assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'line-bot-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow service role to upload to line-bot-assets'
  ) THEN
    CREATE POLICY "Allow service role to upload to line-bot-assets"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'line-bot-assets');
  END IF;
END$$;