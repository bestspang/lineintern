
-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  notify_overtime boolean NOT NULL DEFAULT true,
  notify_early_leave boolean NOT NULL DEFAULT true,
  notify_day_off boolean NOT NULL DEFAULT true,
  notify_remote_checkout boolean NOT NULL DEFAULT true,
  notify_receipts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id)
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Service role handles all operations via edge functions
-- No authenticated user policies needed (portal uses service role via portal-data)

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
