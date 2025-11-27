-- Create a function to update cron job commands with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_cron_job_command(
  p_jobid BIGINT,
  p_command TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cron.job 
  SET command = p_command 
  WHERE jobid = p_jobid;
  
  RETURN FOUND;
END;
$$;

-- Grant execute to authenticated users (admin check will be done at app level)
GRANT EXECUTE ON FUNCTION public.update_cron_job_command TO authenticated;