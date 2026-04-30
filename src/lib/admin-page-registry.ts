/**
 * ⚠️ CANONICAL ADMIN ROUTE REGISTRY — single source of truth
 *
 * Purpose:
 * - Keep `App.tsx` routes, `DashboardLayout` nav, `SettingsLayout` tabs,
 *   and `usePageAccess` (DB `webapp_page_config`) in sync without rewriting them.
 * - Provide a normalizer so legacy/aliased path values (in DB or old configs)
 *   keep working without destructive migrations.
 *
 * Rules of thumb:
 * - DO NOT rename keys here without updating everywhere they're used.
 * - When you ADD a new admin page in App.tsx, also add its menu group
 *   below if its path is not already covered by an existing prefix rule.
 * - Aliases here are ADDITIVE — they never remove existing behavior.
 */

export type AdminMenuGroup =
  | 'Dashboard'
  | 'Attendance'
  | 'Schedule & Leaves'
  | 'Overtime'
  | 'Payroll'
  | 'Points & Rewards'
  
  | 'Management'
  | 'AI Features'
  | 'Content & Knowledge'
  | 'Monitoring & Tools'
  | 'Configuration';

/**
 * Canonical aliases: maps legacy/duplicate path strings to the path
 * actually rendered in App.tsx. Used by access checks so that DB rows
 * like `/attendance/employee-history/:id` keep matching the real route
 * `/attendance/employees/:id/history` without a risky DB rewrite.
 *
 * Keys = legacy path. Values = canonical path used in App.tsx.
 */
export const PATH_ALIASES: Record<string, string> = {
  // Admin landing
  '/overview': '/',

  // Branch report (single source)
  '/branch-reports': '/branch-report',

  // Health monitoring
  '/health': '/health-monitoring',

  // Payroll YTD legacy
  '/attendance/pay-ytd': '/attendance/payroll-ytd',

  // Employee detail nested routes (DB → App.tsx)
  '/attendance/employee-history/:id': '/attendance/employees/:id/history',
  '/attendance/employee-settings/:id': '/attendance/employees/:id/settings',
};

/**
 * Normalize a path so legacy/aliased paths resolve to the canonical
 * route used in App.tsx. Dynamic segments like `/attendance/employees/abc/history`
 * are normalized to their `:id` form before alias lookup.
 */
export function normalizeAdminPath(path: string): string {
  if (!path) return path;

  // Strip query/hash, just in case
  const clean = path.split('?')[0].split('#')[0];

  // Direct alias match first
  if (PATH_ALIASES[clean]) return PATH_ALIASES[clean];

  // Replace dynamic segments with `:id` for alias lookup
  const idForm = toIdForm(clean);
  if (idForm !== clean && PATH_ALIASES[idForm]) return PATH_ALIASES[idForm];

  return clean;
}

/**
 * Replace UUID/ULID/numeric segments with `:id` so dynamic routes
 * map cleanly into menu-group resolution and DB page-config rows.
 */
export function toIdForm(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      // UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
        return ':id';
      }
      // Numeric / ULID-ish
      if (/^\d+$/.test(seg)) return ':id';
      if (/^[0-9A-HJKMNP-TV-Z]{20,32}$/i.test(seg)) return ':id';
      return seg;
    })
    .join('/');
}

/**
 * Resolve a menu group from a canonical (normalized) admin path.
 * This replaces the previously stale `getMenuGroupFromPath` mapper —
 * it now matches all real current admin routes.
 *
 * Returns `null` for paths that don't belong to a known admin group
 * (e.g. `/portal/*`, `/auth`, `/liff/*`).
 */
export function resolveAdminMenuGroup(rawPath: string): AdminMenuGroup | null {
  const path = normalizeAdminPath(toIdForm(rawPath));

  // --- Dashboard ---
  if (
    path === '/' ||
    path === '/health-monitoring' ||
    path === '/config-validator' ||
    path === '/pre-deploy-checklist' ||
    path === '/feature-flags' ||
    path === '/branch-report' ||
    path === '/audit-logs'
  ) {
    return 'Dashboard';
  }

  // --- Attendance subgroups (most specific first) ---
  if (
    path === '/attendance/happy-points' ||
    path === '/attendance/point-transactions' ||
    path === '/attendance/point-rules' ||
    path === '/attendance/redemption-approvals' ||
    path === '/attendance/bag-management' ||
    path.startsWith('/attendance/rewards') ||
    path.startsWith('/attendance/gacha')
  ) {
    return 'Points & Rewards';
  }

  if (
    path.startsWith('/attendance/overtime') ||
    path === '/attendance/early-leave-requests'
  ) {
    return 'Overtime';
  }

  if (
    path.startsWith('/attendance/payroll') ||
    path === '/attendance/work-history' ||
    path.startsWith('/attendance/work-history/')
  ) {
    return 'Payroll';
  }

  if (
    path === '/attendance/shift-templates' ||
    path === '/attendance/schedules' ||
    path === '/attendance/holidays' ||
    path === '/attendance/birthdays' ||
    path === '/attendance/leave-balance' ||
    path === '/attendance/flexible-day-off' ||
    path === '/attendance/flexible-day-off-requests'
  ) {
    return 'Schedule & Leaves';
  }

  if (path.startsWith('/attendance')) return 'Attendance';


  // --- Management ---
  if (
    path === '/groups' ||
    path.startsWith('/groups/') ||
    path === '/users' ||
    path.startsWith('/users/') ||
    path === '/tasks' ||
    path === '/commands' ||
    path === '/alerts' ||
    path === '/broadcast' ||
    path === '/direct-messages' ||
    path === '/summaries' ||
    path === '/reports' ||
    path === '/cron-jobs' ||
    path === '/employee-menu'
  ) {
    return 'Management';
  }

  // --- AI Features ---
  if (
    path === '/memory' ||
    path === '/memory-analytics' ||
    path === '/personality' ||
    path === '/analytics'
  ) {
    return 'AI Features';
  }

  // --- Content & Knowledge ---
  if (
    path === '/faq-logs' ||
    path === '/knowledge' ||
    path === '/training' ||
    path === '/safety-rules' ||
    path === '/portal-faq-admin'
  ) {
    return 'Content & Knowledge';
  }

  // --- Configuration ---
  if (
    path === '/settings' ||
    path === '/integrations' ||
    path.startsWith('/settings/')
  ) {
    return 'Configuration';
  }

  // --- Monitoring & Tools ---
  if (
    path === '/bot-logs' ||
    path === '/test-bot' ||
    path === '/profile-sync-health'
  ) {
    return 'Monitoring & Tools';
  }

  return null;
}

/**
 * Priority order used by `getFirstAccessiblePage()` so the user always
 * lands somewhere they can actually open after an unauthorized redirect.
 */
export const MENU_GROUP_PRIORITY: AdminMenuGroup[] = [
  'Dashboard',
  'Attendance',
  'Schedule & Leaves',
  'Overtime',
  'Payroll',
  'Points & Rewards',
  
  'Management',
  'Content & Knowledge',
  'AI Features',
  'Monitoring & Tools',
  'Configuration',
];
