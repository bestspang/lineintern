-- Fix bot_message_logs RLS policy to allow edge functions to insert
-- This fixes the issue where bot messages were not being logged

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Service role can insert bot_message_logs" ON bot_message_logs;

-- Create new policy that allows authenticated inserts (from edge functions)
CREATE POLICY "Edge functions can insert bot_message_logs"
ON bot_message_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Ensure SELECT policy exists for viewing logs
DROP POLICY IF EXISTS "Authenticated users can view bot_message_logs" ON bot_message_logs;

CREATE POLICY "Authenticated users can view bot_message_logs"
ON bot_message_logs
FOR SELECT
TO authenticated
USING (true);