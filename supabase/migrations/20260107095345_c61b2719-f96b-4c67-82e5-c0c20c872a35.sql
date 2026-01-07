-- Allow anonymous users to read LIFF_ID for LIFF SDK initialization
CREATE POLICY "Anon can read LIFF_ID config" 
ON api_configurations 
FOR SELECT 
TO anon 
USING (key_name = 'LIFF_ID');