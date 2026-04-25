-- Phase 2: Drop receipt system schema and trigger function.
DROP TRIGGER IF EXISTS notify_receipt_approval_trigger ON public.receipts;
DROP FUNCTION IF EXISTS public.notify_receipt_approval() CASCADE;

DROP TABLE IF EXISTS public.receipt_files CASCADE;
DROP TABLE IF EXISTS public.receipt_items CASCADE;
DROP TABLE IF EXISTS public.receipt_usage CASCADE;
DROP TABLE IF EXISTS public.receipt_subscriptions CASCADE;
DROP TABLE IF EXISTS public.receipt_group_mappings CASCADE;
DROP TABLE IF EXISTS public.receipt_approval_logs CASCADE;
DROP TABLE IF EXISTS public.receipt_approvers CASCADE;
DROP TABLE IF EXISTS public.receipt_quota_alerts CASCADE;
DROP TABLE IF EXISTS public.receipt_audit_logs CASCADE;
DROP TABLE IF EXISTS public.receipts CASCADE;
DROP TABLE IF EXISTS public.receipt_businesses CASCADE;
DROP TABLE IF EXISTS public.receipt_plans CASCADE;
DROP TABLE IF EXISTS public.receipt_settings CASCADE;