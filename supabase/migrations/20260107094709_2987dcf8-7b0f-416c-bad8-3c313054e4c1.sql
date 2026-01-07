-- Add UPDATE policy for authenticated users on system_settings
CREATE POLICY "Authenticated can update system_settings" 
ON system_settings 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);