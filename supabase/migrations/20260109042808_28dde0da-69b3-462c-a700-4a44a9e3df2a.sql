-- Create portal_favorites table for storing user's favorite menus
CREATE TABLE public.portal_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  menu_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, menu_path)
);

-- Enable RLS
ALTER TABLE public.portal_favorites ENABLE ROW LEVEL SECURITY;

-- Policy: Employees can manage their own favorites
CREATE POLICY "Employees can view their own favorites"
ON public.portal_favorites FOR SELECT
USING (true);

CREATE POLICY "Employees can insert their own favorites"
ON public.portal_favorites FOR INSERT
WITH CHECK (true);

CREATE POLICY "Employees can delete their own favorites"
ON public.portal_favorites FOR DELETE
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_portal_favorites_employee_id ON public.portal_favorites(employee_id);