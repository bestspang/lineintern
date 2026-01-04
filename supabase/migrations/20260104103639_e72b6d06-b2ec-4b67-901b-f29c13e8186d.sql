-- Add columns to daily_deposits for document classification and duplicate detection
ALTER TABLE daily_deposits ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'deposit_slip';
ALTER TABLE daily_deposits ADD COLUMN IF NOT EXISTS is_duplicate boolean DEFAULT false;
ALTER TABLE daily_deposits ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES daily_deposits(id);
ALTER TABLE daily_deposits ADD COLUMN IF NOT EXISTS photo_hash text;
ALTER TABLE daily_deposits ADD COLUMN IF NOT EXISTS classification_confidence numeric;
ALTER TABLE daily_deposits ADD COLUMN IF NOT EXISTS classification_result jsonb;

-- Add index for photo_hash to speed up duplicate detection
CREATE INDEX IF NOT EXISTS idx_daily_deposits_photo_hash ON daily_deposits(photo_hash) WHERE photo_hash IS NOT NULL;

-- Create document_uploads table for future document types
CREATE TABLE IF NOT EXISTS public.document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  branch_id uuid REFERENCES branches(id),
  document_type text NOT NULL,
  upload_date date NOT NULL DEFAULT CURRENT_DATE,
  photo_url text,
  photo_hash text,
  is_duplicate boolean DEFAULT false,
  duplicate_of_id uuid REFERENCES document_uploads(id),
  extracted_data jsonb,
  classification_confidence numeric,
  status text DEFAULT 'pending',
  admin_notes text,
  line_message_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on document_uploads
ALTER TABLE public.document_uploads ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_uploads
CREATE POLICY "Admins can manage all document_uploads" 
ON public.document_uploads FOR ALL 
USING (has_admin_access(auth.uid()))
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Employees can view own document_uploads" 
ON public.document_uploads FOR SELECT 
USING (employee_id IN (
  SELECT e.id FROM employees e
  JOIN users u ON e.line_user_id = u.line_user_id
  WHERE u.id = auth.uid()
));

CREATE POLICY "Service role can manage document_uploads" 
ON public.document_uploads FOR ALL 
USING (true)
WITH CHECK (true);

-- Add index for photo_hash on document_uploads
CREATE INDEX IF NOT EXISTS idx_document_uploads_photo_hash ON document_uploads(photo_hash) WHERE photo_hash IS NOT NULL;

-- Add index for document_type
CREATE INDEX IF NOT EXISTS idx_document_uploads_document_type ON document_uploads(document_type);