-- Phase 1: Add missing columns to receipts table
-- These columns are used in code but don't exist in DB

-- 1.1 Add extraction_source column (used in Overview.tsx and ReceiptNew.tsx)
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS extraction_source TEXT DEFAULT 'manual';

COMMENT ON COLUMN receipts.extraction_source IS 'Source of data extraction: manual, ai, ocr';

-- 1.2 Add notes column (used in ReceiptNew.tsx)
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN receipts.notes IS 'Additional notes for the receipt';

-- 1.3 Add tax_id column (used in ReceiptNew.tsx)  
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS tax_id TEXT;

COMMENT ON COLUMN receipts.tax_id IS 'Tax ID of the vendor';

-- Create index for extraction_source for faster filtering
CREATE INDEX IF NOT EXISTS idx_receipts_extraction_source ON receipts(extraction_source);