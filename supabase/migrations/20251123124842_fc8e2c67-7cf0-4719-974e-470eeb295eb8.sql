-- Add fraud detection columns to attendance_logs
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS photo_hash text,
ADD COLUMN IF NOT EXISTS exif_data jsonb,
ADD COLUMN IF NOT EXISTS fraud_score numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS fraud_reasons text[] DEFAULT '{}';

-- Create index for faster duplicate detection
CREATE INDEX IF NOT EXISTS idx_attendance_logs_photo_hash ON attendance_logs(photo_hash);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_fraud_score ON attendance_logs(fraud_score DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_server_time ON attendance_logs(employee_id, server_time DESC);

-- Function to detect duplicate photos
CREATE OR REPLACE FUNCTION detect_duplicate_photos(
  p_employee_id uuid,
  p_photo_hash text,
  p_hours_lookback integer DEFAULT 168
)
RETURNS TABLE (
  is_duplicate boolean,
  similar_log_id uuid,
  similar_photo_url text,
  time_diff_hours numeric
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true as is_duplicate,
    al.id as similar_log_id,
    al.photo_url as similar_photo_url,
    EXTRACT(EPOCH FROM (NOW() - al.server_time)) / 3600 as time_diff_hours
  FROM attendance_logs al
  WHERE al.employee_id = p_employee_id
    AND al.photo_hash = p_photo_hash
    AND al.server_time > NOW() - INTERVAL '1 hour' * p_hours_lookback
  ORDER BY al.server_time DESC
  LIMIT 1;
$$;

-- Function to get fraud detection stats
CREATE OR REPLACE FUNCTION get_fraud_detection_stats()
RETURNS TABLE (
  total_logs bigint,
  flagged_logs bigint,
  high_risk_logs bigint,
  duplicate_photos bigint,
  suspicious_timing bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) as total_logs,
    COUNT(*) FILTER (WHERE fraud_score > 0) as flagged_logs,
    COUNT(*) FILTER (WHERE fraud_score >= 70) as high_risk_logs,
    COUNT(*) FILTER (WHERE 'duplicate_photo' = ANY(fraud_reasons)) as duplicate_photos,
    COUNT(*) FILTER (WHERE 'suspicious_timing' = ANY(fraud_reasons)) as suspicious_timing
  FROM attendance_logs
  WHERE server_time > NOW() - INTERVAL '30 days';
$$;