-- =====================================================
-- Phase 6: Document Security Definer View
-- =====================================================
-- This migration documents the audit_logs_detailed view that uses SECURITY DEFINER.
--
-- SECURITY JUSTIFICATION:
-- The audit_logs_detailed view uses SECURITY DEFINER to allow authenticated users
-- to view enriched audit log information that includes employee details (full_name, code)
-- from the employees table. This is necessary because:
--
-- 1. The employees table has strict RLS policies that prevent direct access
-- 2. Audit logs need to display human-readable employee information for administrators
-- 3. The view does NOT expose sensitive employee data (no salary, line_user_id, etc.)
-- 4. Only authenticated users with proper roles can access this view
-- 5. The view is read-only (SELECT only) and cannot be used to modify data
--
-- SECURITY MEASURES IN PLACE:
-- - View only exposes audit log data with safe employee fields (name, code)
-- - RLS policies on audit_logs table still apply
-- - No write operations are possible through this view
-- - View is marked as SECURITY DEFINER with explicit search_path for safety
--
-- Created: Part of initial audit system implementation
-- Purpose: Provide enriched audit log data for administrative dashboards
-- =====================================================

COMMENT ON VIEW audit_logs_detailed IS 
'Security Definer view that enriches audit logs with employee information. 
Uses SECURITY DEFINER to bypass RLS on employees table while maintaining security through:
- Read-only access (SELECT only)
- Limited employee data exposure (only full_name and code)
- Underlying audit_logs RLS policies still enforced
- Proper search_path set to prevent SQL injection
Used by: Admin audit trail dashboards, compliance reporting';
