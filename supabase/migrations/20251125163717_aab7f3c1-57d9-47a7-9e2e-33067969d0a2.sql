-- Fix security definer issue: recreate view with SECURITY INVOKER
DROP VIEW IF EXISTS active_branches;

CREATE VIEW active_branches 
WITH (security_invoker = true)
AS
SELECT * FROM branches WHERE is_deleted = false;