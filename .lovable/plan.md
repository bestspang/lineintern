# Force Fresh Publish Artifact for /attendance/ops-center and /attendance/portal-performance

## Diagnosis (already verified, read-only)

Source code is correct:
- `src/App.tsx` line 102–103: lazy imports for `OpsCenter` and `PortalPerformance` are present
- `src/App.tsx` line 308–309: routes `/attendance/ops-center` and `/attendance/portal-performance` are registered inside the protected `DashboardLayout` block
- `src/pages/attendance/OpsCenter.tsx` line 36: `export default function OpsCenter()` exists
- `src/pages/attendance/PortalPerformance.tsx` line 67: `export default function PortalPerformance()` exists
- `.lovable/registry-snapshot.json`: both routes listed
- `webapp_page_config`: rows verified in earlier session for owner/admin/hr/manager allow, employee/user/field deny

The previous publish-stamp comment on App.tsx line 1 was added but apparently the publish that followed did not deploy successfully (still serving `index-BOuFb-tr.js` with zero matches for the new route strings). A bare comment change can be optimised away or coincide with another failed publish, leaving the live bundle untouched.

This plan does the smallest possible thing that guarantees a different bundle hash AND gives visible runtime proof the new build is live.

## What This Plan Does NOT Touch

- line-webhook, attendance-submit, attendance-validate-token, claim_attendance_token
- Bangkok timezone helpers, payroll math, point ledger
- Employee Documents, RLS, security findings, pg_net, auth/storage/vault
- Any business logic, any DB migration
- Any existing route, page, or component behaviour
- Registry snapshot or webapp_page_config (already correct)

## Steps

### 1. Create a referenced build-stamp constant

New file `src/lib/app-version.ts`:
```ts
export const APP_BUILD_STAMP = "phase-1b-routes-2026-04-29-v2";
```
Because this constant is **imported and rendered**, tree-shaking cannot remove it, guaranteeing the new bundle hash differs from the stale one.

### 2. Render the stamp in OpsCenter footer (additive, single line)

In `src/pages/attendance/OpsCenter.tsx`, add an `import { APP_BUILD_STAMP } from "@/lib/app-version"` and a tiny muted footer line at the very bottom of the existing returned JSX, e.g.:
```tsx
<p className="text-[10px] text-muted-foreground text-center pt-2">build {APP_BUILD_STAMP}</p>
```
- No card removed, no card text changed
- Pilot QA checklist text untouched
- "Open Portal Performance" navigate target unchanged
- Complies with the file's `⚠️ VERIFIED` allowed-changes clause ("additive cards, new metric tiles, new shortcut buttons" — a footer stamp is additive and non-functional)

### 3. Render the same stamp in PortalPerformance footer

Same one-line additive footer in `src/pages/attendance/PortalPerformance.tsx` so we have visible proof on either page.

### 4. Remove the now-redundant publish-stamp comment on App.tsx line 1

Delete only the top-of-file `// publish-stamp: ...` comment. The real stamp now lives in `app-version.ts` and is referenced from rendered components, which is a stronger guarantee.

### 5. Local validation

```bash
npm run build
grep -R "ops-center"          dist/assets | head
grep -R "portal-performance"  dist/assets | head
grep -R "OpsCenter"           dist/assets | head
grep -R "PortalPerformance"   dist/assets | head
grep -R "phase-1b-routes-2026-04-29-v2" dist/assets | head
npm run smoke:quick
bunx vitest run
```
All four route strings and the build stamp must appear in the local dist output. Smoke (16) and vitest (7) must pass.

### 6. Publish

User clicks **Update** in the publish dialog.

### 7. Live verification

```bash
curl -s https://intern.gem.me/ | grep -oE '/assets/index-[^"]+\.js'
# bundle hash must differ from index-BOuFb-tr.js

NEW_HASH=$(curl -s https://intern.gem.me/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -s "https://intern.gem.me${NEW_HASH}" | grep -c "ops-center"
curl -s "https://intern.gem.me${NEW_HASH}" | grep -c "portal-performance"
curl -s "https://intern.gem.me${NEW_HASH}" | grep -c "phase-1b-routes-2026-04-29-v2"
```
Then hit each URL in a browser:
- `https://lineintern.lovable.app/attendance/ops-center`
- `https://lineintern.lovable.app/attendance/portal-performance`
- `https://intern.gem.me/attendance/ops-center`
- `https://intern.gem.me/attendance/portal-performance`

Acceptable: page renders (with build stamp visible in footer) OR redirects to `/auth` if not signed in.
Not acceptable: in-app NotFound page, or HTTP 404 from server.

## Files Changed

| File | Change |
|---|---|
| `src/lib/app-version.ts` | NEW — single exported constant |
| `src/pages/attendance/OpsCenter.tsx` | +1 import, +1 footer line at end of JSX |
| `src/pages/attendance/PortalPerformance.tsx` | +1 import, +1 footer line at end of JSX |
| `src/App.tsx` | -1 comment line at top |

No other file is touched. No DB migration. No edge function change.

## Verdict Criteria

- **404 FIXED** if new bundle hash differs, contains `ops-center` / `portal-performance` / `phase-1b-routes-2026-04-29-v2`, and the two URLs render the page (or redirect to /auth) on both `intern.gem.me` and `lineintern.lovable.app`.
- **STILL 404, blocker = publish pipeline** if local dist contains all four strings and the stamp but the live bundle hash never changes after Update is clicked. In that case the project repo cannot fix it; capture exact red-toast text from the publish dialog and escalate.
