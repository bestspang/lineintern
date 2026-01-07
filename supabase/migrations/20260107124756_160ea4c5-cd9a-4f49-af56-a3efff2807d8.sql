-- Create storage bucket for Rich Menu images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'richmenu-images',
  'richmenu-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public read access
CREATE POLICY "Public read access for richmenu images"
ON storage.objects FOR SELECT
USING (bucket_id = 'richmenu-images');

-- Create policy for authenticated upload
CREATE POLICY "Authenticated users can upload richmenu images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'richmenu-images');

-- Create policy for authenticated delete
CREATE POLICY "Authenticated users can delete richmenu images"
ON storage.objects FOR DELETE
USING (bucket_id = 'richmenu-images');