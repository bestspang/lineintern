-- Function: get_cron_jobs
CREATE OR REPLACE FUNCTION get_cron_jobs()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  command text,
  active boolean
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobid, j.jobname, j.schedule, j.command, j.active
  FROM cron.job j
  ORDER BY j.jobid;
END;
$$ LANGUAGE plpgsql;

-- Function: get_cron_history
CREATE OR REPLACE FUNCTION get_cron_history(limit_count int DEFAULT 20)
RETURNS TABLE (
  jobid bigint,
  runid bigint,
  jobname text,
  status text,
  start_time timestamptz,
  end_time timestamptz,
  return_message text
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.jobid, 
    r.runid,
    j.jobname,
    r.status,
    r.start_time,
    r.end_time,
    r.return_message
  FROM cron.job_run_details r
  JOIN cron.job j ON r.jobid = j.jobid
  ORDER BY r.start_time DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function: retry_cron_job (manually trigger a job)
CREATE OR REPLACE FUNCTION retry_cron_job(job_id bigint)
RETURNS jsonb 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_command text;
BEGIN
  -- Get job command
  SELECT command INTO job_command
  FROM cron.job
  WHERE jobid = job_id AND active = true;
  
  IF job_command IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Job not found or inactive');
  END IF;
  
  -- Execute the command
  EXECUTE job_command;
  
  RETURN jsonb_build_object('success', true, 'message', 'Job executed successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION get_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION get_cron_history(int) TO authenticated;
GRANT EXECUTE ON FUNCTION retry_cron_job(bigint) TO authenticated;