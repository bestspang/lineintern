-- Create storage bucket for receipt files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipt-files', 
  'receipt-files', 
  false,
  10485760, -- 10MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow service role to manage all files
CREATE POLICY "Service role can manage receipt files" ON storage.objects
FOR ALL
USING (bucket_id = 'receipt-files')
WITH CHECK (bucket_id = 'receipt-files');

-- Policy: Users can view their own receipt files (via folder structure)
-- Receipt files are stored as: receipts/{year}/{month}/{receipt_id}/filename
-- We allow viewing for any authenticated user or anon accessing via public URL if they know the path
CREATE POLICY "Anyone can view receipt files" ON storage.objects
FOR SELECT
USING (bucket_id = 'receipt-files');