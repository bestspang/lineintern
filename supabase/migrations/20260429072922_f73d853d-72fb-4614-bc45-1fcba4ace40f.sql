-- Phase 0A — Permission lockdown for non-admin roles.
-- Additive UPDATE only. No DELETE. owner/admin are never matched.
-- Mirrors over-permissioning audit captured in docs/STATUS.md.

DO $$
DECLARE
  v_pages_before int;
  v_menus_before int;
  v_pages_after int;
  v_menus_after int;
  v_pages_changed int;
  v_menus_changed int;
BEGIN
  SELECT count(*) INTO v_pages_before
  FROM public.webapp_page_config
  WHERE can_access = true AND role::text NOT IN ('owner','admin');

  SELECT count(*) INTO v_menus_before
  FROM public.webapp_menu_config
  WHERE can_access = true AND role::text NOT IN ('owner','admin');

  RAISE NOTICE '[phase_0a_lockdown] BEFORE: % allowed page rows / % allowed menu rows on non-admin roles',
    v_pages_before, v_menus_before;

  -- ---------- PAGE LOCKDOWN ----------

  -- System / debug / dev tools — admin/owner only
  UPDATE public.webapp_page_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('hr','manager','executive','moderator','user')
    AND page_path IN (
      '/bot-logs','/test-bot','/cron-jobs','/health-monitoring',
      '/config-validator','/integrations','/safety-rules','/training'
    );

  -- AI internal pages — admin/owner only
  UPDATE public.webapp_page_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('hr','manager','executive','moderator','user')
    AND page_path IN ('/memory','/memory-analytics','/personality','/analytics');

  -- Broadcast / DM tools — admin/owner/hr only
  UPDATE public.webapp_page_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('manager','executive','moderator','user')
    AND page_path IN ('/broadcast','/direct-messages');

  -- Payroll — admin/owner/hr only
  UPDATE public.webapp_page_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('manager','executive','moderator','user')
    AND page_path IN ('/attendance/payroll','/attendance/payroll-ytd');

  -- Points admin pages — admin/owner/hr/manager only
  UPDATE public.webapp_page_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('executive','moderator','user')
    AND page_path IN (
      '/attendance/happy-points','/attendance/point-transactions',
      '/attendance/redemption-approvals'
    );

  -- Settings (user/role/api keys/feature flags) — admin/owner only
  UPDATE public.webapp_page_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('hr','manager','executive','moderator','user')
    AND page_path IN ('/settings','/settings/reports');

  -- ---------- MENU GROUP LOCKDOWN (mirror so empty groups don't render) ----------

  UPDATE public.webapp_menu_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('hr','manager','executive','moderator','user')
    AND menu_group IN ('Monitoring & Tools','AI Features','Configuration');

  -- Content & Knowledge contains safety-rules/training/knowledge — admin/owner only
  UPDATE public.webapp_menu_config
  SET can_access = false, updated_at = now()
  WHERE can_access = true
    AND role::text IN ('hr','manager','executive','user','moderator')
    AND menu_group = 'Content & Knowledge';

  SELECT count(*) INTO v_pages_after
  FROM public.webapp_page_config
  WHERE can_access = true AND role::text NOT IN ('owner','admin');

  SELECT count(*) INTO v_menus_after
  FROM public.webapp_menu_config
  WHERE can_access = true AND role::text NOT IN ('owner','admin');

  v_pages_changed := v_pages_before - v_pages_after;
  v_menus_changed := v_menus_before - v_menus_after;

  RAISE NOTICE '[phase_0a_lockdown] AFTER: % allowed page rows / % allowed menu rows on non-admin roles',
    v_pages_after, v_menus_after;
  RAISE NOTICE '[phase_0a_lockdown] DELTA: -% page allowances, -% menu allowances',
    v_pages_changed, v_menus_changed;
END $$;