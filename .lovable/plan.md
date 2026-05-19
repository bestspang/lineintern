# แผน Recheck & Sync: Help / Commands / UI Actions / AI Regression Guardrails

## 1. Affected modules

- `portal_faqs` database content and `/portal/help`
- `bot_commands` database content and `/commands`
- `src/App.tsx` route registry comparison
- `.lovable/registry-snapshot.json`
- `webapp_page_config` database page-access rows
- `scripts/consistency-audit.mjs` and `scripts/smoke-test.mjs`
- Documentation guardrails / QA checklist only if needed

Explicitly out of scope and will not be touched:
- Employee Documents implementation
- analytics dashboard polish
- `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`
- Bangkok timezone helpers
- payroll math
- point ledger / point calculation business logic
- existing working business logic

## 2. Status of each module from read-only recheck

- Help / Portal actions: WORKING
  - `/portal/help` derives quick actions from `src/lib/portal-actions.ts`.
  - `portal-actions.ts` paths match real `/portal/*` routes: 24/24 verified.
  - FAQ categories in DB are clean: `attendance`, `general`, `leave-ot`, `points`.

- Bot commands: PARTIAL
  - Parser and snapshot are synced: 27 command types.
  - DB has 27 enabled commands, matching current command set.
  - Remaining risk: existing audit does not yet compare `bot_commands` DB rows against parser/snapshot automatically, so future AI changes can drift silently.

- Admin routes / settings nested routes: PARTIAL
  - Smoke test passes, but `npm run audit:consistency` reports 1 warning: nested route `reports` is detected as drift.
  - Root cause: `consistency-audit.mjs` treats nested `/settings/reports` as raw `reports`, while snapshot expects full paths.
  - `webapp_page_config` currently has 0 rows for `/settings/reports` and missing rows for newer route/page entries including `/branch-report`, `/portal-faq-admin`, `/attendance/ops-center`, `/attendance/portal-performance`, `/overview`.

- UI buttons/actions QA: PARTIAL
  - Static cross-checks verify route/action wiring.
  - Real click testing still needs browser/manual verification, especially protected admin screens and LINE/LIFF flows.
  - No evidence yet of a specific broken button from logs.

- Guardrails: WORKING but can be strengthened
  - `AI_GUARDRAILS.md`, `CRITICAL_FILES.md`, `registry-snapshot.json`, and smoke tests exist.
  - Opportunity: extend audit/smoke to catch DB drift before UI shows ghost/missing pages.

## 3. What must be preserved

- All currently working routes, labels, role gates, portal quick actions, bottom nav contract, and FAQ dynamic category behavior.
- DB remains source of truth for Portal FAQ and bot command display.
- `portal-actions.ts` remains the single source of truth for Portal Home + Help quick actions.
- Admin/owner unrestricted access behavior in `usePageAccess` remains unchanged.
- No refactor of verified critical paths.

## 4. What is actually broken / risky

1. `consistency-audit.mjs` gives a false-positive warning for nested `reports` route.
   - Fix is low-risk: normalize nested settings routes to `/settings/reports` in the audit script only.

2. `webapp_page_config` is stale for several real pages.
   - This can hide menu items for non-admin roles or make Role Management incomplete.
   - Fix is low-risk/additive: insert missing rows with least-privilege defaults; do not overwrite existing role permissions.

3. Automated checks do not fully prevent the exact regression you described: AI updates one surface but not Help/Commands/UI/DB.
   - Fix is to append new read-only consistency checks rather than rewrite logic.

## 5. Minimal-diff implementation plan

### Step A — Fix audit false-positive only

- Update `scripts/consistency-audit.mjs` so nested routes under `<Route path="/settings">` are resolved as `/settings/<child>`.
- Add `/settings/*` nested child handling without changing route code.
- Expected result: `npm run audit:consistency` has 0 warn/fail for the current codebase.

### Step B — Add DB drift checks to audit/smoke

Append checks only, no rewrite:

- `bot_commands` DB rows vs `.lovable/registry-snapshot.json.bot_command_types`
  - Missing DB command row => fail.
  - Extra enabled DB command not in snapshot/parser => fail.

- `webapp_page_config` coverage vs registered admin routes
  - Missing rows for stable, non-dynamic admin routes => warn/fail depending severity.
  - Ignore `/portal/*`, auth/error routes, legacy redirects, dynamic `:id` detail routes.

- Portal FAQ category sanity
  - Active categories must be present in `.lovable/registry-snapshot.json.portal_faq_categories`.
  - No removed categories like receipts/deposits.

### Step C — Add least-privilege DB sync migration

Create one migration with only additive/inert-safe changes:

- Insert missing `webapp_page_config` rows for existing roles and current real pages:
  - `/overview`
  - `/branch-report`
  - `/portal-faq-admin`
  - `/attendance/ops-center`
  - `/attendance/portal-performance`
  - `/settings/reports`
- Use `ON CONFLICT DO NOTHING` so existing permissions are preserved.
- Default access:
  - `owner`, `admin`: true
  - `hr`: true for HR/admin operational pages where already appropriate
  - `manager`: true only for safe operational pages if current pattern allows; false for sensitive config/monitoring pages
  - all other roles: false
- Do not delete `/settings/roles` yet; first classify as legacy/working because Role Management uses it.

### Step D — Update snapshot/docs only where source of truth is stale

- Add `/settings/reports` to `.lovable/registry-snapshot.json` only if the corrected audit confirms it should be tracked.
- Update `_last_synced_at` and `_last_sync_migration`.
- Add a short doc note/checklist entry that future AI changes must update:
  - route
  - nav
  - DB page config
  - Help/FAQ if user-facing
  - bot command DB row if command-facing
  - smoke/audit tests

### Step E — UI action QA without feature changes

- Use browser preview to check navigation shells and clickable buttons that are safe/read-only:
  - Admin sidebar expand/collapse and links for `/overview`, `/commands`, `/portal-faq-admin`, `/settings/reports`
  - Portal `/portal/help` quick actions render as links and no 404 route is advertised
- Do not submit forms, delete, archive, upload, or run destructive actions.
- If a button is broken due to route mismatch only, fix the route/config mismatch; do not alter business behavior.

### Step F — Verification

Run after changes:

- `npm run audit:consistency`
- `npm run smoke:quick`
- `bun run test`

Build: I will not manually run `npm run build` unless instructed by the environment, because project rules say the harness runs builds automatically. I will report harness/build status if available.

## 6. Code changes expected

- Small targeted edit in `scripts/consistency-audit.mjs`.
- Possible small append-only edit in `scripts/smoke-test.mjs` if needed to enforce DB drift checks.
- One additive DB migration for `webapp_page_config` missing rows.
- Possible small `.lovable/registry-snapshot.json` metadata/path sync.
- Optional doc/checklist update only; no app feature behavior changes.

## 7. Regression checklist

- No forbidden files touched.
- No Employee Documents code touched.
- No LINE webhook or attendance core touched.
- No timezone, payroll, point ledger logic touched.
- No new feature added.
- No route removed.
- No existing command removed.
- No existing DB permission overwritten.
- No FAQ category hardcoded back into UI.
- All changes are either read-only audit improvements, additive config rows, or documentation sync.

## 8. Doc updates

- Update guardrail/checklist notes after implementation to document the new prevention rule:
  - “If a feature/function is added or changed, verify Help/FAQ, Commands DB, UI actions, route registry, and page-access config together.”

## 9. Final output after implementation

I will return:

1. Affected modules
2. Status of each module
3. What was preserved
4. What was actually broken
5. Minimal fixes applied
6. Regression checklist
7. Doc updates
8. Build/smoke/test/audit results
9. Remaining risks