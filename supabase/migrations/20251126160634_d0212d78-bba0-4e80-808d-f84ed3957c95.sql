-- Make attendance-photos bucket private for security
UPDATE storage.buckets 
SET public = false 
WHERE name = 'attendance-photos';

-- Keep line-bot-assets public as it contains non-sensitive bot graphics
-- No changes needed for that bucket