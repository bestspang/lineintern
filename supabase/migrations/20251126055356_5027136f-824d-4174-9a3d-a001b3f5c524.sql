-- ============================================================================
-- PHASE 1 CRITICAL FIX (v2): Fix remaining RLS issues
-- ============================================================================

-- 1. FIX: alerts table - Remove group membership check
DROP POLICY IF EXISTS "Users can view alerts in their groups" ON public.alerts;

-- Only create if doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'alerts' 
    AND policyname = 'Authenticated users can view alerts'
  ) THEN
    CREATE POLICY "Authenticated users can view alerts"
      ON public.alerts
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 2. FIX: working_memory table
DROP POLICY IF EXISTS "Users can view working_memory in their groups" ON public.working_memory;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'working_memory' 
    AND policyname = 'Authenticated users can view working_memory'
  ) THEN
    CREATE POLICY "Authenticated users can view working_memory"
      ON public.working_memory
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'working_memory' 
    AND policyname = 'Admins and owners can manage working_memory'
  ) THEN
    CREATE POLICY "Admins and owners can manage working_memory"
      ON public.working_memory
      FOR ALL
      TO authenticated
      USING (has_admin_access(auth.uid()))
      WITH CHECK (has_admin_access(auth.uid()));
  END IF;
END $$;

-- 3. FIX: message_threads table
DROP POLICY IF EXISTS "Users can view message_threads in their groups" ON public.message_threads;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'message_threads' 
    AND policyname = 'Authenticated users can view message_threads'
  ) THEN
    CREATE POLICY "Authenticated users can view message_threads"
      ON public.message_threads
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 4. FIX: safety_rules table
DROP POLICY IF EXISTS "Users can view safety rules in their groups" ON public.safety_rules;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'safety_rules' 
    AND policyname = 'Authenticated users can view safety_rules'
  ) THEN
    CREATE POLICY "Authenticated users can view safety_rules"
      ON public.safety_rules
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can manage safety rules" ON public.safety_rules;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'safety_rules' 
    AND policyname = 'Admins and owners can manage safety_rules'
  ) THEN
    CREATE POLICY "Admins and owners can manage safety_rules"
      ON public.safety_rules
      FOR ALL
      TO authenticated
      USING (has_admin_access(auth.uid()))
      WITH CHECK (has_admin_access(auth.uid()));
  END IF;
END $$;

-- 5. FIX: mood_history table
DROP POLICY IF EXISTS "Users can view mood history in their groups" ON public.mood_history;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'mood_history' 
    AND policyname = 'Authenticated users can view mood_history'
  ) THEN
    CREATE POLICY "Authenticated users can view mood_history"
      ON public.mood_history
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can manage mood history" ON public.mood_history;