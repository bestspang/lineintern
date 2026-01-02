-- Add columns for multiple admin notification recipients
ALTER TABLE deposit_settings 
ADD COLUMN IF NOT EXISTS notify_admin_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS notify_additional_groups TEXT[] DEFAULT '{}';

-- Create deposit approval audit log table
CREATE TABLE IF NOT EXISTS deposit_approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id UUID NOT NULL REFERENCES daily_deposits(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'approved', 'rejected', 'edited'
  performed_by_admin_id UUID REFERENCES employees(id),
  performed_by_name TEXT,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  decision_method TEXT DEFAULT 'web', -- 'web', 'line', 'auto'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE deposit_approval_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for deposit_approval_logs
CREATE POLICY "Admins can manage deposit_approval_logs"
ON deposit_approval_logs FOR ALL
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Authenticated can view deposit_approval_logs"
ON deposit_approval_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_deposit_approval_logs_deposit_id 
ON deposit_approval_logs(deposit_id);

CREATE INDEX IF NOT EXISTS idx_deposit_approval_logs_created_at 
ON deposit_approval_logs(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE deposit_approval_logs IS 'Audit trail for deposit approval/rejection actions';