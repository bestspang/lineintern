-- Create bot_message_logs table for comprehensive bot message tracking
CREATE TABLE bot_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Destination info
  destination_type TEXT NOT NULL CHECK (destination_type IN ('group', 'dm', 'user_push')),
  destination_id TEXT NOT NULL,
  destination_name TEXT,
  
  -- Internal references
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Message content
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('ai_reply', 'notification', 'reminder', 'summary', 'warning', 'system')),
  
  -- Context
  triggered_by TEXT CHECK (triggered_by IN ('webhook', 'cron', 'manual', 'postback')),
  trigger_message_id UUID,
  command_type TEXT,
  edge_function_name TEXT NOT NULL,
  
  -- Delivery status
  line_message_id TEXT,
  delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'failed', 'pending')),
  error_message TEXT,
  
  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_bot_logs_sent_at ON bot_message_logs(sent_at DESC);
CREATE INDEX idx_bot_logs_type ON bot_message_logs(message_type);
CREATE INDEX idx_bot_logs_destination ON bot_message_logs(destination_type, destination_id);
CREATE INDEX idx_bot_logs_edge_function ON bot_message_logs(edge_function_name);
CREATE INDEX idx_bot_logs_group_id ON bot_message_logs(group_id);

-- RLS policies
ALTER TABLE bot_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bot_message_logs"
  ON bot_message_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert bot_message_logs"
  ON bot_message_logs FOR INSERT
  TO service_role
  WITH CHECK (true);