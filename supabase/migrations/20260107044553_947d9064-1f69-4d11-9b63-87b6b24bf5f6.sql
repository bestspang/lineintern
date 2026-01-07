-- Create receipt_group_mappings table for many-to-many group-branch relationship
CREATE TABLE public.receipt_group_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  is_enabled BOOLEAN DEFAULT true NOT NULL,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(group_id, branch_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_receipt_group_mappings_group ON public.receipt_group_mappings(group_id);
CREATE INDEX idx_receipt_group_mappings_branch ON public.receipt_group_mappings(branch_id);
CREATE INDEX idx_receipt_group_mappings_enabled ON public.receipt_group_mappings(is_enabled) WHERE is_enabled = true;

-- Enable RLS
ALTER TABLE public.receipt_group_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all authenticated users to read (for now)
CREATE POLICY "Anyone can read receipt_group_mappings"
ON public.receipt_group_mappings
FOR SELECT
USING (true);

-- RLS Policy: Allow authenticated users to manage (admin check can be added later)
CREATE POLICY "Authenticated users can manage receipt_group_mappings"
ON public.receipt_group_mappings
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_receipt_group_mappings_updated_at
BEFORE UPDATE ON public.receipt_group_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing data from branches.line_group_id
INSERT INTO public.receipt_group_mappings (group_id, branch_id, is_enabled)
SELECT g.id, b.id, true
FROM public.groups g
JOIN public.branches b ON g.line_group_id = b.line_group_id
WHERE b.line_group_id IS NOT NULL
ON CONFLICT (group_id, branch_id) DO NOTHING;