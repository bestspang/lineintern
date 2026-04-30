
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info',
  priority text NOT NULL DEFAULT 'normal',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  action_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_employee_unread ON public.notifications(employee_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_employee_created ON public.notifications(employee_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Employees can read own notifications
CREATE POLICY "Employees can read own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE line_user_id = auth.jwt()->>'sub'
  )
  OR employee_id IN (
    SELECT e.id FROM public.employees e 
    JOIN auth.users u ON e.line_user_id = u.id::text 
    WHERE u.id = auth.uid()
  )
);

-- Employees can update own notifications (mark as read)
CREATE POLICY "Employees can update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE line_user_id = auth.jwt()->>'sub'
  )
  OR employee_id IN (
    SELECT e.id FROM public.employees e 
    JOIN auth.users u ON e.line_user_id = u.id::text 
    WHERE u.id = auth.uid()
  )
);

-- Admins can insert notifications
CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.has_admin_access(auth.uid()));

-- Admins can also read all notifications (for admin dashboard)
CREATE POLICY "Admins can read all notifications"
ON public.notifications FOR SELECT TO authenticated
USING (public.has_admin_access(auth.uid()));

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
