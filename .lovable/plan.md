# Plan: Cross-feature consistency audit and minimal-diff stabilization

## 1) System analysis

### Current state
This project has 4 separate sources of truth that are drifting:
1. `src/App.tsx` — actual routes
2. `src/components/DashboardLayout.tsx` + `src/pages/SettingsLayout.tsx` — visible navigation
3. `src/hooks/usePageAccess.ts` + `webapp_page_config` / `webapp_menu_config` — permission routing
4. `src/pages/portal/Help.tsx`, `src/pages/portal/PortalHome.tsx`, `bot_commands`, `portal_faqs` — help/quick-action surfaces

### Verified module status
- `App.tsx` routes: WORKING, but duplicated path strings create drift risk
- `ProtectedRoute.tsx`: PARTIAL — logic is sound, but depends on inconsistent path matching
- `usePageAccess.ts`: BROKEN in specific real cases due to stale path mapping
- `DashboardLayout.tsx`: PARTIAL — nav mostly works, but uses non-canonical paths
- `SettingsLayout.tsx`: PARTIAL — tabs depend on path checks that can drift
- `PortalHome.tsx`: WORKING, but uses a separate static action registry
- `portal/Help.tsx`: PARTIAL — FAQ data is DB-backed, but quick actions are static and not permission-aware
- `line-webhook /help`: WORKING — already dynamic from `bot_commands`
- `Commands.tsx`: WORKING — admin command editor is DB-backed

### What must be preserved
- Existing auth + RLS behavior
- Working admin pages and portal pages
- Existing Google/email login flows
- Existing portal role behavior (`manager/admin/owner` gating)
- Dynamic LINE `/help` command behavior from database
- Zero broad refactor: only surgical alignment changes

## 2) Problem list

### Real issues already confirmed
1. **Admin route mismatch**
   - Dashboard nav uses `/` for Overview
   - Actual admin landing route is `/overview`
   - Root redirect sends logged-in web users to `/overview`
   - Result: inconsistent redirects and permission fallbacks

2. **Permission mapper is stale**
   `usePageAccess.getMenuGroupFromPath()` has real outdated mappings:
   - `/branch-report` exists, mapper only knows `/branch-reports`
   - `/health-monitoring` exists, mapper only knows `/health`
   - `/attendance/payroll-ytd` exists, mapper checks `/attendance/pay-ytd`
   - `Points & Rewards` mapper misses actual pages like:
     - `/attendance/happy-points`
     - `/attendance/point-transactions`
     - `/attendance/point-rules`
     - `/attendance/redemption-approvals`
     - `/attendance/bag-management`

3. **DB page-config paths drift from real routes**
   Confirmed mismatch examples:
   - DB: `/attendance/employee-history/:id`
   - Route: `/attendance/employees/:id/history`
   - DB: `/attendance/employee-settings/:id`
   - Route: `/attendance/employees/:id/settings`
   This weakens page-level permission accuracy and forces fallback behavior.

4. **Portal help can advertise inaccessible features**
   - `portal/Help.tsx` quick actions are static
   - `PortalHome.tsx` uses a separate static action list
   - `PortalContext` already provides `employee`, `menuItems`, `isManager`, `isAdmin`
   - Result: help/actions can get out of sync with actual portal permissions or menu availability

5. **High future-regression risk from duplicated strings**
   The same paths are duplicated across routes, nav, page-access fallback, settings tabs, and help cards.
   This is exactly the kind of AI-induced regression loop the user described.

## 3) Improvement & feature design

### Safe design
Use small shared registries/helpers instead of a broad refactor.

#### A. Admin route consistency layer
Add a small shared module for canonical admin paths + alias matching.
Purpose:
- normalize real route paths
- classify menu groups reliably
- support dynamic detail routes
- keep `DashboardLayout`, `SettingsLayout`, and `usePageAccess` in sync

#### B. Portal action consistency layer
Add a shared portal action registry used by both:
- `PortalHome.tsx`
- `portal/Help.tsx`

This preserves current UI while preventing one screen from advertising actions another screen no longer supports.

#### C. Keep database-driven help where it already works
Do not rewrite dynamic LINE `/help` or Commands admin.
Only align portal help/quick actions with actual UI permissions and routes.

### Why this is safe
- No auth model change
- No RLS change
- No backend contract change required
- No removal of working screens
- Fixes are additive and localized to route/action lookup logic

## 4) Step-by-step implementation plan

### Step 1 — Create canonical admin route metadata
Create a small shared file, e.g. `src/lib/admin-page-registry.ts`, containing:
- canonical path aliases (`/overview` ↔ `/` handling)
- menu-group mapping for real current routes
- support for dynamic routes like employee detail/history/settings
- first-page priority list used by `getFirstAccessiblePage()`

Files to touch:
- new `src/lib/admin-page-registry.ts`
- `src/hooks/usePageAccess.ts`

### Step 2 — Fix admin access matching with minimal diff
Update `usePageAccess.ts` so it:
- normalizes paths before checking access
- matches canonical + legacy aliases safely
- handles dynamic routes explicitly
- uses the shared registry instead of hardcoded stale branches

Preserved behavior:
- owner/admin full access
- deny-by-default posture
- menu-group fallback when page-config data is incomplete

### Step 3 — Align dashboard/settings navigation with canonical paths
Update nav/tabs to use the same canonical paths as access checks.

Files to touch:
- `src/components/DashboardLayout.tsx`
- `src/pages/SettingsLayout.tsx`

Key fixes:
- make Overview consistently target the canonical admin home path
- ensure nav items/tabs point to routes that actually exist
- keep labels/icons unchanged

### Step 4 — Stabilize protected-route recovery behavior
Review and minimally adjust these only if needed after Step 2–3:
- `src/components/ProtectedRoute.tsx`
- `src/components/RootRedirect.tsx`
- `src/pages/Auth.tsx`

Goals:
- avoid redirect loops caused by alias mismatch
- keep “Go Home” and “Sign Out / Clear Session” escape hatches intact
- preserve LIFF vs web behavior exactly

### Step 5 — Unify portal actions across Home and Help
Create a small shared portal action definition file, e.g. `src/lib/portal-actions.ts`, then use it in:
- `src/pages/portal/PortalHome.tsx`
- `src/pages/portal/Help.tsx`

Rules:
- preserve existing card UI and favorites behavior in Portal Home
- filter Help quick actions by actual role/menu visibility
- do not show manager/admin actions to non-authorized users
- only show routes that really exist

### Step 6 — Keep FAQ/help content synchronized without breaking existing data
Portal FAQs are already DB-backed (`portal_faqs` has active content).
Implementation will:
- keep DB-driven FAQs as source of truth
- keep static FAQ fallback only as fallback
- remove stale quick-action drift by deriving links from the shared action registry

Files to touch:
- `src/pages/portal/Help.tsx`

### Step 7 — Optional compatibility shim for DB path drift
If needed after implementation, add a code-level compatibility map so current DB `webapp_page_config` values like:
- `/attendance/employee-history/:id`
- `/attendance/employee-settings/:id`
continue to work without requiring a risky DB rewrite.

Preferred approach:
- solve in code first
- only propose DB migration later if absolutely necessary

### Step 8 — Verification and UI click audit
After implementation, manually verify the highest-risk routes/buttons in the preview:
- admin home / overview
- branch report
- health monitoring
- payroll YTD
- happy points / point transactions / point rules / redemption approvals / bag management
- settings tabs
- portal help quick actions
- manager approval flows entry points
- recovery buttons on auth / access denied screens

## 5) Technical details

### Expected files to touch
- `src/hooks/usePageAccess.ts`
- `src/components/DashboardLayout.tsx`
- `src/pages/SettingsLayout.tsx`
- `src/components/ProtectedRoute.tsx` (only if needed)
- `src/components/RootRedirect.tsx` (only if needed)
- `src/pages/Auth.tsx` (only if needed)
- `src/pages/portal/PortalHome.tsx`
- `src/pages/portal/Help.tsx`
- new shared helper(s):
  - `src/lib/admin-page-registry.ts`
  - `src/lib/portal-actions.ts`

### No planned backend/schema changes
- No auth schema changes
- No role table changes
- No RLS changes
- No edge-function rewrite planned
- No `bot_commands` schema change planned

### If a DB adjustment becomes necessary
Use additive compatibility only, not destructive renames.

## 6) Regression & prevention

### Smoke checklist
1. Unauthenticated user on `/` goes to `/auth`
2. Authenticated web user on `/` lands on admin home correctly
3. LIFF context still goes to `/portal`
4. Admin sidebar Overview opens correctly
5. Branch Report opens correctly from nav
6. Health Monitoring opens correctly from nav
7. Payroll YTD opens without false access denial
8. Happy Points / Point Transactions / Point Rules / Redemption Approvals / Bag Management open correctly for allowed roles
9. Settings tabs only show tabs the role can access
10. ProtectedRoute redirects to the first accessible real page, not a stale alias
11. Portal Home still renders cards/favorites correctly
12. Portal Help shows only actions relevant to the current employee role
13. Manager-only portal actions are hidden from non-managers
14. `/help` in LINE still reflects `bot_commands`
15. Recovery buttons on Auth / Access Denied still work

### Prevention strategy
- One shared admin path registry instead of repeated string literals
- One shared portal action registry instead of separate static lists
- Compatibility matcher for legacy DB page-config paths
- Keep dynamic DB-driven help where it already works

## 7) Doc updates

Update or create these docs after implementation:
- `docs/PROJECT_MEMORY.md`
  - note that admin route/access logic now uses a shared registry
  - note that portal actions/help share one definition
- `docs/CONTRACTS.md`
  - document canonical admin path aliases and permission matching behavior
- `docs/SMOKE_TEST.md`
  - add route/access/help consistency checklist
- `docs/DEVLOG.md`
  - record the exact desyncs fixed and rollback notes

### DEVLOG entry to add
- User request summary: audit and fix cross-feature drift so UI/help/routes/permissions stay aligned
- Scope in: route matching, nav consistency, portal help/action consistency, recovery path safety
- Scope out: no auth/RLS redesign, no backend rewrite
- Contracts changed: No external contracts changed; internal canonical path matching added
- Security impact: preserves deny-by-default access checks while reducing false denials from stale mappings
- Risk: medium-low, because changes touch shared routing/access helpers
- Rollback: revert shared registry adoption and restore previous path checks if any unexpected nav regression appears

Approve this plan and I’ll implement it in minimal, verifiable steps.