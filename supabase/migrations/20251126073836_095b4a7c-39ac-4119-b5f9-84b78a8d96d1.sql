-- Phase 1: Fix Duplicate RLS Policies
-- This migration removes redundant RLS policies and ensures consistent naming

-- ============================================================================
-- 1. FIX work_sessions TABLE (has 7 policies, should have 4)
-- ============================================================================

-- Drop ALL existing policies first to ensure clean state
DROP POLICY IF EXISTS "Admins and owners can manage work_sessions" ON work_sessions;
DROP POLICY IF EXISTS "Admins and owners can delete work_sessions" ON work_sessions;
DROP POLICY IF EXISTS "Admins and owners can update work_sessions" ON work_sessions;
DROP POLICY IF EXISTS "Authenticated users can view work_sessions" ON work_sessions;
DROP POLICY IF EXISTS "Users can view own work sessions" ON work_sessions;
DROP POLICY IF EXISTS "Service role can insert work_sessions" ON work_sessions;
DROP POLICY IF EXISTS "Service role can manage work_sessions" ON work_sessions;

-- Create clean, non-redundant policies
CREATE POLICY "Authenticated users can view work_sessions"
  ON work_sessions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can insert work_sessions"
  ON work_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Admins and owners can update work_sessions"
  ON work_sessions
  FOR UPDATE
  TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Admins and owners can delete work_sessions"
  ON work_sessions
  FOR DELETE
  TO authenticated
  USING (has_admin_access(auth.uid()));

-- ============================================================================
-- 2. FIX users TABLE (has 7 policies, should have 4)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Admins and owners can manage all users" ON users;
DROP POLICY IF EXISTS "Admins and owners can delete users" ON users;
DROP POLICY IF EXISTS "Admins and owners can update users" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Authenticated users can view users" ON users;
DROP POLICY IF EXISTS "Service role can insert users" ON users;
DROP POLICY IF EXISTS "Users can view all users" ON users;

-- Create clean, non-redundant policies
CREATE POLICY "Authenticated users can view users"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can insert users"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Admins and owners can update users"
  ON users
  FOR UPDATE
  TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Admins and owners can delete users"
  ON users
  FOR DELETE
  TO authenticated
  USING (has_admin_access(auth.uid()));

-- ============================================================================
-- 3. FIX messages TABLE (has 5 policies, should have 3)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Admins and owners can manage messages" ON messages;
DROP POLICY IF EXISTS "Admins and owners can delete messages" ON messages;
DROP POLICY IF EXISTS "Admins and owners can update messages" ON messages;
DROP POLICY IF EXISTS "Authenticated users can view messages" ON messages;
DROP POLICY IF EXISTS "Service role can insert messages" ON messages;

-- Create clean, non-redundant policies
CREATE POLICY "Authenticated users can view messages"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and owners can manage messages"
  ON messages
  FOR ALL
  TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Service role can insert messages"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 4. FIX overtime_requests TABLE (has 5 policies, should have 3)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Admins and owners can manage overtime_requests" ON overtime_requests;
DROP POLICY IF EXISTS "Admins and executives can update overtime requests" ON overtime_requests;
DROP POLICY IF EXISTS "Admins and executives can view all overtime requests" ON overtime_requests;
DROP POLICY IF EXISTS "Employees can create own overtime requests" ON overtime_requests;
DROP POLICY IF EXISTS "Employees can view own overtime requests" ON overtime_requests;

-- Create clean, non-redundant policies
CREATE POLICY "Users can view overtime requests"
  ON overtime_requests
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own requests OR admins can see all
    (employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON e.line_user_id = u.line_user_id
      WHERE u.id = auth.uid()
    ))
    OR has_admin_access(auth.uid())
  );

CREATE POLICY "Employees can create own overtime requests"
  ON overtime_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON e.line_user_id = u.line_user_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Admins and owners can manage overtime_requests"
  ON overtime_requests
  FOR ALL
  TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- ============================================================================
-- VERIFICATION QUERIES (commented out - for reference only)
-- ============================================================================

-- To verify the fix worked, run these queries:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'work_sessions';
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'users';
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'messages';
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'overtime_requests';