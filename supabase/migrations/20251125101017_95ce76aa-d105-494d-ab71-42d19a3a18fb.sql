-- Create summary delivery configuration table
CREATE TABLE summary_delivery_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  
  -- Source: where to get data from
  source_type TEXT NOT NULL DEFAULT 'all_branches', -- 'all_branches' | 'single_branch'
  source_branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Destination: where to send
  destination_type TEXT NOT NULL, -- 'group' | 'private'
  destination_line_id TEXT, -- LINE group ID or LINE user ID
  destination_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Schedule & Content
  send_time TIME NOT NULL DEFAULT '21:00:00',
  include_work_hours BOOLEAN DEFAULT true,
  
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE summary_delivery_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage summary_delivery_config" 
  ON summary_delivery_config
  FOR ALL 
  USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_summary_delivery_config_updated_at
  BEFORE UPDATE ON summary_delivery_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();