-- Phase 1: Fix RLS Policies for Dashboard Access
-- This fixes data visibility issues on Overview, Knowledge Base, FAQ Logs, Chat Summaries, Groups, User Detail, Tasks, Memory, Personality, and Analytics pages

-- ============================================
-- 1. CHAT_SUMMARIES - Fix group membership check
-- ============================================
DROP POLICY IF EXISTS "Users can view summaries in their groups" ON public.chat_summaries;
DROP POLICY IF EXISTS "Users can create summaries in their groups" ON public.chat_summaries;

CREATE POLICY "Authenticated users can view chat_summaries"
  ON public.chat_summaries
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage chat_summaries"
  ON public.chat_summaries
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 2. KNOWLEDGE_ITEMS - Fix scope check
-- ============================================
DROP POLICY IF EXISTS "Users can view active knowledge in their scope" ON public.knowledge_items;
DROP POLICY IF EXISTS "Users can create knowledge_items in their groups" ON public.knowledge_items;

CREATE POLICY "Authenticated users can view knowledge_items"
  ON public.knowledge_items
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage knowledge_items"
  ON public.knowledge_items
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 3. MEMORY_ITEMS - Fix scope and group check
-- ============================================
DROP POLICY IF EXISTS "Users can view memory_items in their groups" ON public.memory_items;
DROP POLICY IF EXISTS "Users can create memory_items in their scope" ON public.memory_items;

CREATE POLICY "Authenticated users can view memory_items"
  ON public.memory_items
  FOR SELECT
  TO authenticated
  USING (is_deleted = false);

CREATE POLICY "Admins can manage memory_items"
  ON public.memory_items
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 4. MEMORY_SETTINGS - Fix scope check
-- ============================================
DROP POLICY IF EXISTS "Users can view memory_settings in their scope" ON public.memory_settings;

CREATE POLICY "Authenticated users can view memory_settings"
  ON public.memory_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage memory_settings"
  ON public.memory_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 5. GROUPS - Fix group membership check
-- ============================================
DROP POLICY IF EXISTS "Users can view groups they are members of" ON public.groups;

CREATE POLICY "Authenticated users can view groups"
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep admin policy as is
-- "Admins can manage all groups" already exists and is correct

-- ============================================
-- 6. MESSAGES - Fix group membership check
-- ============================================
DROP POLICY IF EXISTS "Users can view messages in their groups" ON public.messages;

CREATE POLICY "Authenticated users can view messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage messages"
  ON public.messages
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 7. GROUP_MEMBERS - Fix group membership check
-- ============================================
DROP POLICY IF EXISTS "Users can view group members in their groups" ON public.group_members;

CREATE POLICY "Authenticated users can view group_members"
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep admin policy as is
-- "Admins can manage group_members" already exists and is correct

-- ============================================
-- 8. FAQ_LOGS - Already OK but ensure consistency
-- ============================================
-- Current policies allow authenticated users to view and insert
-- This is correct, no changes needed

-- ============================================
-- 9. PERSONALITY_STATE - Add if missing
-- ============================================
DROP POLICY IF EXISTS "Users can view personality_state in their groups" ON public.personality_state;

CREATE POLICY "Authenticated users can view personality_state"
  ON public.personality_state
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage personality_state"
  ON public.personality_state
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 10. MOOD_HISTORY - Add if missing
-- ============================================
DROP POLICY IF EXISTS "Users can view mood_history in their groups" ON public.mood_history;

CREATE POLICY "Authenticated users can view mood_history"
  ON public.mood_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage mood_history"
  ON public.mood_history
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 11. CONVERSATION_THREADS - Fix group membership check
-- ============================================
DROP POLICY IF EXISTS "Users can view threads in their groups" ON public.conversation_threads;

CREATE POLICY "Authenticated users can view conversation_threads"
  ON public.conversation_threads
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep admin policy as is
-- "Admins can manage all threads" already exists and is correct

-- ============================================
-- 12. TASKS - Verify and fix if needed
-- ============================================
DROP POLICY IF EXISTS "Users can view tasks in their groups" ON public.tasks;

CREATE POLICY "Authenticated users can view tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage tasks"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- 13. WORKING_MEMORY - Fix if table exists
-- ============================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'working_memory') THEN
    DROP POLICY IF EXISTS "Users can view working_memory in their groups" ON public.working_memory;
    
    EXECUTE 'CREATE POLICY "Authenticated users can view working_memory"
      ON public.working_memory
      FOR SELECT
      TO authenticated
      USING (true)';
      
    EXECUTE 'CREATE POLICY "Admins can manage working_memory"
      ON public.working_memory
      FOR ALL
      TO authenticated
      USING (has_role(auth.uid(), ''admin''))
      WITH CHECK (has_role(auth.uid(), ''admin''))';
  END IF;
END $$;

-- ============================================
-- 14. USER_PROFILES - Fix if table exists
-- ============================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_profiles') THEN
    DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
    
    EXECUTE 'CREATE POLICY "Authenticated users can view user_profiles"
      ON public.user_profiles
      FOR SELECT
      TO authenticated
      USING (true)';
      
    EXECUTE 'CREATE POLICY "Admins can manage user_profiles"
      ON public.user_profiles
      FOR ALL
      TO authenticated
      USING (has_role(auth.uid(), ''admin''))
      WITH CHECK (has_role(auth.uid(), ''admin''))';
  END IF;
END $$;