-- Create employee_notes table for internal notes about employees
CREATE TABLE public.employee_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'follow-up', 'warning', 'resolved')),
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_employee_notes_employee ON public.employee_notes(employee_id);
CREATE INDEX idx_employee_notes_created ON public.employee_notes(created_at DESC);
CREATE INDEX idx_employee_notes_pinned ON public.employee_notes(is_pinned DESC, created_at DESC);

-- Enable RLS
ALTER TABLE public.employee_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read notes"
  ON public.employee_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert notes"
  ON public.employee_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own notes"
  ON public.employee_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own notes"
  ON public.employee_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_employee_notes_updated_at
  BEFORE UPDATE ON public.employee_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_notes;