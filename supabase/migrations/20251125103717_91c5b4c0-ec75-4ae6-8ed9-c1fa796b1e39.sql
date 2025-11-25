-- Enable RLS on summary_delivery_logs table
ALTER TABLE summary_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view delivery logs
CREATE POLICY "Allow authenticated users to view delivery logs"
  ON summary_delivery_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow service role to insert logs
CREATE POLICY "Allow service role to insert delivery logs"
  ON summary_delivery_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);