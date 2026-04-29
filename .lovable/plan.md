# Publish Failure Debug v2 Plan

## Current read-only findings

1. **Affected modules**
   - Publishing flow / Lovable deploy platform
   - Package manager lockfiles: `package.json`, `package-lock.json`, `bun.lock`, `bun.lockb`
   - Build entrypoints: `vite.config.ts`, `vitest.config.ts`, `src/App.tsx`
   - Recent admin routes: `/attendance/ops-center`, `/attendance/portal-performance`
   - Route registry: `.lovable/registry-snapshot.json`
   - Page access database config: `webapp_page_config`
   - Security scan gate
   - Custom domain: `intern.gem.me`

2. **Status of each module so far**
   - `package.json`: readable; test dependencies are present in `devDependencies`.
   - `package-lock.json`: contains the same top-level test dependencies as `package.json`; exact sync still must be verified by running `npm install --package-lock-only` in build mode.
   - `bun.lock` / `bun.lockb`: both present, meaning the repo has mixed npm and Bun lockfiles.
   - `src/App.tsx`: routes for `/attendance/ops-center` and `/attendance/portal-performance` exist and lazy-import the expected files.
   - `.lovable/registry-snapshot.json`: valid JSON by inspection; includes both routes.
   - `webapp_page_config`: rows exist for both routes. Access is `true` for `owner`, `admin`, `hr`, `manager`; `false` for `employee`, `user`, `field`, plus `executive` and `moderator`.
   - Security scan results: currently no active findings in loaded scan results; this does not look like a publish-blocking security gate from current available data.
   - Domain: `intern.gem.me` is connected and serves the app. Published fallback `lineintern.lovable.app` also serves the app. Domain/DNS does not appear broken from current available data.
   - Browser logs/network snapshot: no publish error captured from current preview snapshot.

3. **What must be preserved**
   - Do not touch `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, Bangkok timezone helpers, payroll math, point ledger, `pg_net`, auth/storage/vault functions, broad RLS policies, Employee Documents logic, or portal performance logic unless a build error proves it is the blocker.
   - Do not continue feature work or security hardening.
   - Do not refactor.
   - Keep all working routes and access behavior intact.

## What is actually broken

The exact publish/deploy blocker has **not yet been captured** in read-only mode. I cannot click Publish/Update or run state-changing commands/tests from the current mode. The current evidence narrows the likely areas to:

- A platform-side publish error not visible in current browser/network snapshots.
- A stale `package-lock.json` only detectable by running `npm install --package-lock-only` and checking if it changes.
- A build/deploy step failure only visible when executing the required npm/Bun commands.

## Minimal-diff execution plan after approval

### Step 1 — Capture the real publish error
- Attempt Publish / Update once.
- Capture raw error text, timestamp, deployment/request id if shown, and classify the stage:
  - install
  - build
  - deploy/upload
  - domain assignment
  - security gate
  - unknown platform error
- If the UI gives only a generic banner, inspect available browser network details/logs for the publish request body and response.

### Step 2 — Verify package manager / lockfile mismatch
- Run exactly:
  - `npm install --package-lock-only`
- Check whether `package-lock.json` changes.
- If it changes, keep only that lockfile sync change and treat stale npm lockfile as a likely publish blocker, then continue verification.
- Do not edit `package.json` unless the install/build error proves a specific dependency declaration is wrong.

### Step 3 — Run full npm build and required validation
- Run:
  - `npm run build`
  - `npm run smoke:quick`
  - `bun run test`
- If build fails, fix only the exact file/line in the error.
- Priority inspection targets only if the build points there:
  - `src/App.tsx`
  - `src/pages/attendance/OpsCenter.tsx`
  - `src/pages/attendance/PortalPerformance.tsx`
  - `src/lib/portal-perf.ts`
  - `src/contexts/LiffContext.tsx`
  - `src/contexts/PortalContext.tsx`
  - `src/components/portal/PortalLayout.tsx`
  - `src/pages/portal/PortalHome.tsx`
  - `src/pages/Attendance.tsx`
  - `vitest.config.ts`
  - `src/test/setup.ts`
  - `package.json`
  - `package-lock.json`

### Step 4 — Route / registry / DB consistency verification
- Re-run or manually verify:
  - `/attendance/ops-center` route exists and compiles.
  - `/attendance/portal-performance` route exists and compiles.
  - `.lovable/registry-snapshot.json` parses as valid JSON.
  - Registry routes match `App.tsx`.
  - `webapp_page_config` has both route rows.
  - `owner/admin/hr/manager` are allowed only.
  - `employee/user/field` are denied.
- No route additions or access-policy changes unless validation proves a blocker.

### Step 5 — Security gate only if proven blocking
- If publish error explicitly cites a security gate, capture the exact finding, severity, and whether accepted findings are recognized by publish.
- Do not modify `pg_net`, auth/storage/vault schema functions, broad RLS policies, or accepted warnings.
- If no security gate appears in the publish error, leave security untouched.

### Step 6 — Domain/deployment status
- Verify:
  - `intern.gem.me` is still connected.
  - DNS/domain is not the cause.
  - Failure occurs before/after domain assignment.
- If domain is the blocker, report the exact domain/DNS error and do not edit app code.

### Step 7 — Final publish verification
- After the minimal proven fix, run again:
  - `npm run build`
  - `npm run smoke:quick`
  - `bun run test`
- Attempt Publish / Update again.
- Capture final publish result.

## Expected code changes

Only one of these, depending on the proven blocker:

1. **If stale lockfile is proven:** update `package-lock.json` only.
2. **If build fails:** edit only the exact build-breaking line/file.
3. **If route registry mismatch is proven:** edit only the stale registry or missing page access migration needed for the two existing routes.
4. **If security/domain/platform gate is proven:** no app-code edits unless the raw error identifies an app-owned blocker.

## Regression checklist

- Build passes with npm.
- Smoke quick passes.
- Bun test suite passes.
- Existing sensitive/verified files remain untouched.
- No feature work added.
- No security hardening changes unless publish explicitly blocks on security.
- Domain still serves the current app.
- Publish/Update either succeeds or reports a precise remaining platform blocker.

## Final report format I will return

1. Exact publish error
2. Root cause
3. Whether package-lock was stale
4. Files changed
5. Build result
6. Smoke result
7. Test result
8. Security gate status
9. Domain status
10. Publish result
11. Verdict: `PUBLISH FIXED` or `STILL BLOCKED with exact blocker`

Approve this plan and I will execute only these steps with the smallest safe fix.