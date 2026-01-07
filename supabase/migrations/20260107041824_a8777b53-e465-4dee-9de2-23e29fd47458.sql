-- Create table to log OCR corrections for AI improvement
CREATE TABLE IF NOT EXISTS receipt_ocr_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL, -- 'vendor', 'total', 'receipt_date', 'category'
  original_value TEXT,
  corrected_value TEXT,
  original_confidence DECIMAL(5,4),
  corrected_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  corrected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add index for analytics queries
CREATE INDEX idx_receipt_ocr_corrections_field ON receipt_ocr_corrections(field_name);
CREATE INDEX idx_receipt_ocr_corrections_receipt ON receipt_ocr_corrections(receipt_id);
CREATE INDEX idx_receipt_ocr_corrections_date ON receipt_ocr_corrections(corrected_at);

-- Enable RLS
ALTER TABLE receipt_ocr_corrections ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can insert corrections
CREATE POLICY "Authenticated can insert corrections" ON receipt_ocr_corrections
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policy: Authenticated users can read corrections
CREATE POLICY "Authenticated can read corrections" ON receipt_ocr_corrections
  FOR SELECT TO authenticated USING (true);

-- Add comment for documentation
COMMENT ON TABLE receipt_ocr_corrections IS 'Logs user corrections to OCR-extracted receipt data for AI training improvement';