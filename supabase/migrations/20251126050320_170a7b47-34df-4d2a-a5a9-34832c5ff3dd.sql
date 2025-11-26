-- Phase 1b: Create helper function and update all RLS policies
-- Now that 'owner' is committed, we can use it

-- Create helper function for admin/owner check
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('admin', 'owner')
  )
$$;

-- Update RLS policies to use has_admin_access()

-- alerts table
DROP POLICY IF EXISTS "Admins can manage alerts" ON public.alerts;
CREATE POLICY "Admins and owners can manage alerts" ON public.alerts
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- app_settings table
DROP POLICY IF EXISTS "Authenticated users can manage app_settings" ON public.app_settings;
CREATE POLICY "Admins and owners can manage app_settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- approval_logs table
DROP POLICY IF EXISTS "Admins can manage approval_logs" ON public.approval_logs;
CREATE POLICY "Admins and owners can manage approval_logs" ON public.approval_logs
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- attendance_logs table
DROP POLICY IF EXISTS "Admins can manage logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Admins can insert attendance logs for employees" ON public.attendance_logs;
CREATE POLICY "Admins and owners can manage logs" ON public.attendance_logs
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- attendance_reminders table
DROP POLICY IF EXISTS "Admins can manage attendance_reminders" ON public.attendance_reminders;
CREATE POLICY "Admins and owners can manage attendance_reminders" ON public.attendance_reminders
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- attendance_settings table
DROP POLICY IF EXISTS "Admins can manage settings" ON public.attendance_settings;
CREATE POLICY "Admins and owners can manage settings" ON public.attendance_settings
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- attendance_tokens table
DROP POLICY IF EXISTS "Admins can manage tokens" ON public.attendance_tokens;
CREATE POLICY "Admins and owners can manage tokens" ON public.attendance_tokens
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- bot_commands table
DROP POLICY IF EXISTS "Admins can manage commands" ON public.bot_commands;
CREATE POLICY "Admins and owners can manage commands" ON public.bot_commands
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- bot_triggers table
DROP POLICY IF EXISTS "Admins can manage triggers" ON public.bot_triggers;
CREATE POLICY "Admins and owners can manage triggers" ON public.bot_triggers
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- branches table
DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
CREATE POLICY "Admins and owners can manage branches" ON public.branches
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- chat_summaries table
DROP POLICY IF EXISTS "Admins can manage all summaries" ON public.chat_summaries;
DROP POLICY IF EXISTS "Admins can manage chat_summaries" ON public.chat_summaries;
CREATE POLICY "Admins and owners can manage chat_summaries" ON public.chat_summaries
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- command_aliases table
DROP POLICY IF EXISTS "Admins can manage aliases" ON public.command_aliases;
CREATE POLICY "Admins and owners can manage aliases" ON public.command_aliases
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- conversation_threads table
DROP POLICY IF EXISTS "Admins can manage all threads" ON public.conversation_threads;
CREATE POLICY "Admins and owners can manage all threads" ON public.conversation_threads
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- daily_attendance_summaries table
DROP POLICY IF EXISTS "Admins can manage summaries" ON public.daily_attendance_summaries;
CREATE POLICY "Admins and owners can manage summaries" ON public.daily_attendance_summaries
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- early_leave_requests table
DROP POLICY IF EXISTS "Admins can manage early_leave_requests" ON public.early_leave_requests;
CREATE POLICY "Admins and owners can manage early_leave_requests" ON public.early_leave_requests
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- employee_roles table
DROP POLICY IF EXISTS "Admins can manage employee_roles" ON public.employee_roles;
CREATE POLICY "Admins and owners can manage employee_roles" ON public.employee_roles
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- employees table
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can update employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can delete employees" ON public.employees;
CREATE POLICY "Admins and owners can manage employees" ON public.employees
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- faq_logs table (add UPDATE and DELETE policies)
DROP POLICY IF EXISTS "Authenticated users can insert faq_logs" ON public.faq_logs;
CREATE POLICY "Service role can insert faq_logs" ON public.faq_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins and owners can update faq_logs" ON public.faq_logs
  FOR UPDATE TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Admins and owners can delete faq_logs" ON public.faq_logs
  FOR DELETE TO authenticated
  USING (has_admin_access(auth.uid()));

-- group_members table
DROP POLICY IF EXISTS "Admins can manage group_members" ON public.group_members;
CREATE POLICY "Admins and owners can manage group_members" ON public.group_members
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- groups table
DROP POLICY IF EXISTS "Admins can manage all groups" ON public.groups;
CREATE POLICY "Admins and owners can manage all groups" ON public.groups
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- knowledge_items table
DROP POLICY IF EXISTS "Admins can manage all knowledge_items" ON public.knowledge_items;
DROP POLICY IF EXISTS "Admins can manage knowledge_items" ON public.knowledge_items;
CREATE POLICY "Admins and owners can manage knowledge_items" ON public.knowledge_items
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- leave_balances table
DROP POLICY IF EXISTS "Admins can manage leave_balances" ON public.leave_balances;
CREATE POLICY "Admins and owners can manage leave_balances" ON public.leave_balances
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- memory_items table
DROP POLICY IF EXISTS "Admins can manage all memory_items" ON public.memory_items;
DROP POLICY IF EXISTS "Admins can manage memory_items" ON public.memory_items;
CREATE POLICY "Admins and owners can manage memory_items" ON public.memory_items
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- memory_settings table
DROP POLICY IF EXISTS "Admins can manage all memory_settings" ON public.memory_settings;
DROP POLICY IF EXISTS "Admins can manage memory_settings" ON public.memory_settings;
CREATE POLICY "Admins and owners can manage memory_settings" ON public.memory_settings
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- menu_items table
DROP POLICY IF EXISTS "Admins can manage menu_items" ON public.menu_items;
CREATE POLICY "Admins and owners can manage menu_items" ON public.menu_items
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- users table - fix the problematic RLS policy
DROP POLICY IF EXISTS "Users can view their own user record" ON public.users;
DROP POLICY IF EXISTS "Users can update their own user record" ON public.users;
CREATE POLICY "Authenticated users can view users" ON public.users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can manage users" ON public.users
  FOR ALL TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- Handle optional tables with conditional logic
DO $$ 
BEGIN
  -- tasks table
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname LIKE '%Admins%') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage tasks" ON public.tasks';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
    EXECUTE 'CREATE POLICY "Admins and owners can manage tasks" ON public.tasks
      FOR ALL TO authenticated
      USING (has_admin_access(auth.uid()))
      WITH CHECK (has_admin_access(auth.uid()))';
  END IF;

  -- overtime_requests table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'overtime_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage overtime_requests" ON public.overtime_requests';
    
    EXECUTE 'CREATE POLICY "Admins and owners can manage overtime_requests" ON public.overtime_requests
      FOR ALL TO authenticated
      USING (has_admin_access(auth.uid()))
      WITH CHECK (has_admin_access(auth.uid()))';
  END IF;

  -- personality_state table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'personality_state') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage personality_state" ON public.personality_state';
    
    EXECUTE 'CREATE POLICY "Admins and owners can manage personality_state" ON public.personality_state
      FOR ALL TO authenticated
      USING (has_admin_access(auth.uid()))
      WITH CHECK (has_admin_access(auth.uid()))';
  END IF;

  -- mood_history table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mood_history') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage mood_history" ON public.mood_history';
    
    EXECUTE 'CREATE POLICY "Admins and owners can manage mood_history" ON public.mood_history
      FOR ALL TO authenticated
      USING (has_admin_access(auth.uid()))
      WITH CHECK (has_admin_access(auth.uid()))';
  END IF;

  -- working_memory table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'working_memory') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage working_memory" ON public.working_memory';
    
    EXECUTE 'CREATE POLICY "Admins and owners can manage working_memory" ON public.working_memory
      FOR ALL TO authenticated
      USING (has_admin_access(auth.uid()))
      WITH CHECK (has_admin_access(auth.uid()))';
  END IF;
END $$;