-- Add new columns to receipts table for comprehensive OCR extraction
ALTER TABLE public.receipts
ADD COLUMN IF NOT EXISTS vendor_address text,
ADD COLUMN IF NOT EXISTS vendor_branch text,
ADD COLUMN IF NOT EXISTS tax_id text,
ADD COLUMN IF NOT EXISTS receipt_number text,
ADD COLUMN IF NOT EXISTS transaction_time timestamptz,
ADD COLUMN IF NOT EXISTS sale_time timestamptz,
ADD COLUMN IF NOT EXISTS payer_name text,
ADD COLUMN IF NOT EXISTS card_number_masked text,
ADD COLUMN IF NOT EXISTS card_type text,
ADD COLUMN IF NOT EXISTS payment_method text;

-- Create receipt_items table for individual line items
CREATE TABLE IF NOT EXISTS public.receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity numeric,
  unit text,
  unit_price numeric,
  amount numeric NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy for service role (edge functions)
CREATE POLICY "Service role full access on receipt_items" ON public.receipt_items
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policy for authenticated users (via businesses)
CREATE POLICY "Users can view their receipt items" ON public.receipt_items
FOR SELECT TO authenticated
USING (
  has_admin_access(auth.uid())
  OR
  receipt_id IN (
    SELECT id FROM receipts 
    WHERE business_id IN (SELECT id FROM receipt_businesses WHERE user_id = auth.uid())
    OR line_user_id IN (SELECT line_user_id FROM receipt_businesses WHERE user_id = auth.uid())
  )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_number ON public.receipts(receipt_number) WHERE receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_tax_id ON public.receipts(tax_id) WHERE tax_id IS NOT NULL;