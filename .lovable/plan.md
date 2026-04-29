# Root Cause: Stale Deploy Artifact

## Live URL Status (verified 2026-04-29 15:11 UTC)

| URL | HTTP | Serves index.html | React renders | Source 404 |
|---|---|---|---|---|
| intern.gem.me/overview | 200 | yes | yes | no |
| intern.gem.me/attendance/ops-center | 200 | yes | yes | **shows in-app NotFound** |
| intern.gem.me/attendance/portal-performance | 200 | yes | yes | **shows in-app NotFound** |
| lineintern.lovable.app/* (same paths) | 200 | yes | yes | same as above |

The server is NOT returning a real 404. SPA fallback works correctly — `index.html` is served on every path. The "404" the user sees is React Router's `NotFound` page rendering because **the deployed JS bundle does not know about the new routes**.

## Smoking Gun

Live bundle: `https://intern.gem.me/assets/index-BOuFb-tr.js` (215 KB)

```
grep "ops-center"          → 0 matches
grep "portal-performance"  → 0 matches
grep "OpsCenter"           → 0 matches
grep "PortalPerformance"   → 0 matches
```

Yet in source (verified):
- `src/App.tsx` line 101–102: lazy imports present
- `src/App.tsx` line 307–308: `<Route path="/attendance/ops-center" …>` and `…/portal-performance` registered inside the protected `DashboardLayout` block
- `src/pages/attendance/OpsCenter.tsx` and `PortalPerformance.tsx` exist with `export default`
- `.lovable/registry-snapshot.json` lists both routes
- `webapp_page_config` has matching rows (verified in earlier session)

**Conclusion**: code, registry, and DB are all correct. The published frontend artifact on both `intern.gem.me` and `lineintern.lovable.app` is from a publish that happened BEFORE the OpsCenter / PortalPerformance routes were added. Every "Publishing failed" toast the user reported caused the publish pipeline to keep serving the previous successful build.

## Why this kept happening

This matches the entire arc of this conversation: the user has been clicking "Publish / Update" repeatedly and seeing "Publishing failed". Each failure leaves the previous bundle in place, so the new routes never go live. App-side debug found nothing wrong because nothing app-side IS wrong.

## Files to Change

**None.** No source change can fix a stale artifact. The fix is to trigger a successful publish.

## The Fix (smallest safe action)

1. Make a no-op version stamp bump in a non-functional file so the publish pipeline produces a new bundle hash. Candidate: append a single dated comment line to `.lovable/plan.md` (already used as a build/publish marker in this project).
2. Trigger Publish via the editor's "Update" button.
3. Re-fetch `https://intern.gem.me/` and verify the new `index-*.js` hash is different from `index-BOuFb-tr.js`.
4. Re-grep the new bundle for `ops-center` and `portal-performance`. Both must appear.
5. Re-hit all 6 URLs and confirm the React app no longer renders the in-app NotFound for the two new paths (will redirect to `/auth` if not signed in — that is the correct behavior, not 404).

## Validation Commands

```bash
npm run build              # local sanity (registry already verified)
npm run smoke:quick        # 16 tests should pass
bunx vitest run            # 7 tests should pass
curl -s https://intern.gem.me/ | grep -oE '/assets/index-[^"]+\.js'
curl -s https://intern.gem.me/assets/<new-hash>.js | grep -c ops-center
```

## What This Plan Does NOT Touch

- line-webhook, attendance-submit, attendance-validate-token, claim_attendance_token
- Bangkok timezone helpers, payroll math, point ledger
- Employee Documents, RLS policies, security findings
- pg_net, auth/storage/vault schemas
- Any business logic, any database migration
- Any existing route, page, or component

## Verdict After Approval

Expected: **404 FIXED** — the in-app NotFound for the two routes disappears once the bundle hash changes and contains the new route strings. If the new publish still fails (the underlying intermittent publish-pipeline issue), the verdict will be **STILL 404, blocker = Lovable publish pipeline failure** and we will need to capture the exact red-toast error from the editor at that moment, because nothing in the project repo can fix a platform-side publish failure.
