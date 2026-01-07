-- Google OAuth tokens for Drive/Sheets integration
CREATE TABLE IF NOT EXISTS google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  drive_folder_id TEXT,
  spreadsheet_id TEXT,
  scopes TEXT[] DEFAULT ARRAY['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(line_user_id)
);

-- Enable RLS
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Edge functions can manage tokens
CREATE POLICY "Service role can manage tokens" ON google_tokens
  FOR ALL USING (true);

-- Add google_file_id to receipts for Drive file reference
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS google_file_id TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS google_sheet_row INTEGER;

-- Enable realtime for google_tokens
ALTER PUBLICATION supabase_realtime ADD TABLE google_tokens;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_tokens_line_user ON google_tokens(line_user_id);
CREATE INDEX IF NOT EXISTS idx_google_tokens_employee ON google_tokens(employee_id);
CREATE INDEX IF NOT EXISTS idx_receipts_google_file ON receipts(google_file_id) WHERE google_file_id IS NOT NULL;