-- Create leave_balances table for tracking employee leave
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  leave_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  vacation_days_total NUMERIC DEFAULT 10,
  vacation_days_used NUMERIC DEFAULT 0,
  sick_days_total NUMERIC DEFAULT 30,
  sick_days_used NUMERIC DEFAULT 0,
  personal_days_total NUMERIC DEFAULT 3,
  personal_days_used NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, leave_year)
);

-- Enable RLS
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage leave_balances"
ON public.leave_balances FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view leave_balances"
ON public.leave_balances FOR SELECT TO authenticated
USING (true);

-- Function to automatically create leave balance when employee is created
CREATE OR REPLACE FUNCTION public.create_initial_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.leave_balances (employee_id, leave_year)
  VALUES (NEW.id, EXTRACT(YEAR FROM CURRENT_DATE))
  ON CONFLICT (employee_id, leave_year) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger to create leave balance for new employees
CREATE TRIGGER on_employee_created
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.create_initial_leave_balance();