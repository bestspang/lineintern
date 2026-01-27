-- Insert bot alert setting with default = disabled
INSERT INTO system_settings (setting_key, setting_value, category, description, is_editable)
VALUES (
  'bot_alert_unregistered_user',
  '{"enabled": false, "mode": "aggregate", "aggregate_interval_hours": 24}',
  'bot',
  'Settings for unregistered user image alerts. Mode: realtime (send immediately) or aggregate (daily summary)',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- Create table to queue alerts for aggregate mode
CREATE TABLE IF NOT EXISTS public.unregistered_user_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_name TEXT,
  branch_name TEXT,
  user_display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  is_processed BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.unregistered_user_alerts ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access (edge functions)
CREATE POLICY "Service role can manage unregistered_user_alerts"
  ON public.unregistered_user_alerts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_unregistered_user_alerts_processed 
  ON public.unregistered_user_alerts (is_processed, created_at);

CREATE INDEX IF NOT EXISTS idx_unregistered_user_alerts_group 
  ON public.unregistered_user_alerts (group_id, line_user_id);