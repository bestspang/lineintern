-- Make attendance-photos bucket public so admins can view photos
UPDATE storage.buckets 
SET public = true 
WHERE name = 'attendance-photos';

-- Create RLS policy to allow authenticated users (admins) to view photos
CREATE POLICY "Admins can view attendance photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'attendance-photos');