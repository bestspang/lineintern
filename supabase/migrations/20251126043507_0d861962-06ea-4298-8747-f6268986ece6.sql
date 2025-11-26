-- ==========================================
-- PHASE 2: SECURITY IMPROVEMENTS
-- Tighten RLS Policies with Role-Based Access
-- ==========================================

-- 1. FIX ALERTS TABLE RLS
-- Remove overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage alerts" ON public.alerts;

-- Add secure policies
CREATE POLICY "Admins can manage alerts"
ON public.alerts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view alerts in their groups"
ON public.alerts
FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 2. FIX MEMORY_ITEMS TABLE RLS
DROP POLICY IF EXISTS "Authenticated users can manage memory_items" ON public.memory_items;

CREATE POLICY "Users can view memory_items in their groups"
ON public.memory_items
FOR SELECT
TO authenticated
USING (
  (scope = 'global' AND is_deleted = false)
  OR (scope = 'group' AND group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  ))
  OR (scope = 'user' AND user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all memory_items"
ON public.memory_items
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create memory_items in their scope"
ON public.memory_items
FOR INSERT
TO authenticated
WITH CHECK (
  (scope = 'user' AND user_id = auth.uid())
  OR (scope = 'group' AND group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  ))
);

-- 3. FIX CHAT_SUMMARIES TABLE RLS
DROP POLICY IF EXISTS "Authenticated users can manage chat_summaries" ON public.chat_summaries;

CREATE POLICY "Users can view summaries in their groups"
ON public.chat_summaries
FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can create summaries in their groups"
ON public.chat_summaries
FOR INSERT
TO authenticated
WITH CHECK (
  group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all summaries"
ON public.chat_summaries
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. FIX BOT_COMMANDS (make admin-only for management)
DROP POLICY IF EXISTS "Authenticated users can manage commands" ON public.bot_commands;

CREATE POLICY "Admins can manage commands"
ON public.bot_commands
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. FIX BOT_TRIGGERS (make admin-only for management)
DROP POLICY IF EXISTS "Authenticated users can manage triggers" ON public.bot_triggers;

CREATE POLICY "Admins can manage triggers"
ON public.bot_triggers
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6. FIX COMMAND_ALIASES (make admin-only for management)
DROP POLICY IF EXISTS "Authenticated users can manage aliases" ON public.command_aliases;

CREATE POLICY "Admins can manage aliases"
ON public.command_aliases
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 7. FIX KNOWLEDGE_ITEMS (group-scoped access)
DROP POLICY IF EXISTS "Authenticated users can manage knowledge_items" ON public.knowledge_items;

CREATE POLICY "Users can view active knowledge in their scope"
ON public.knowledge_items
FOR SELECT
TO authenticated
USING (
  is_active = true 
  AND (
    scope = 'global'
    OR (scope = 'group' AND group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid() 
        AND gm.left_at IS NULL
    ))
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all knowledge_items"
ON public.knowledge_items
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 8. FIX GROUPS TABLE (limit who can modify)
DROP POLICY IF EXISTS "Authenticated users can manage groups" ON public.groups;

CREATE POLICY "Users can view groups they are members of"
ON public.groups
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all groups"
ON public.groups
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 9. FIX GROUP_MEMBERS (users can view, admins can manage)
DROP POLICY IF EXISTS "Authenticated users can manage group_members" ON public.group_members;

CREATE POLICY "Users can view group members in their groups"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage group_members"
ON public.group_members
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 10. FIX MEMORY_SETTINGS (users can view, admins can manage)
DROP POLICY IF EXISTS "Authenticated users can manage memory_settings" ON public.memory_settings;

CREATE POLICY "Users can view memory_settings in their scope"
ON public.memory_settings
FOR SELECT
TO authenticated
USING (
  scope = 'global'
  OR (scope = 'group' AND group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  ))
  OR (scope = 'user' AND user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all memory_settings"
ON public.memory_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 11. FIX CONVERSATION_THREADS (group-scoped)
DROP POLICY IF EXISTS "Authenticated users can manage conversation_threads" ON public.conversation_threads;

CREATE POLICY "Users can view threads in their groups"
ON public.conversation_threads
FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT gm.group_id 
    FROM group_members gm 
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all threads"
ON public.conversation_threads
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 12. FIX MESSAGE_THREADS (group-scoped via thread_id)
DROP POLICY IF EXISTS "Authenticated users can manage message_threads" ON public.message_threads;

CREATE POLICY "Users can view message_threads in their groups"
ON public.message_threads
FOR SELECT
TO authenticated
USING (
  thread_id IN (
    SELECT ct.id 
    FROM conversation_threads ct
    JOIN group_members gm ON gm.group_id = ct.group_id
    WHERE gm.user_id = auth.uid() 
      AND gm.left_at IS NULL
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all message_threads"
ON public.message_threads
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));