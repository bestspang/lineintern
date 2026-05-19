# Phase 1C — Re-verification Plan

Read-only recheck of last Phase 1C run. No source files will be modified in this round either; pilot blockers cannot be confirmed without a real-device session.

## What changed since last run

| Check | Last run | Now |
|---|---|---|
| `intern.gem.me/overview` | 200 + React | **200 + React** ✅ |
| `intern.gem.me/attendance/ops-center` | 200 + React | **200 + React** ✅ |
| `intern.gem.me/attendance/portal-performance` | 200 + React | **200 + React** ✅ |
| `lineintern.lovable.app/attendance/ops-center` | 200 + React | **302 → intern.gem.me** ⚠️ new |
| `lineintern.lovable.app/attendance/portal-performance` | 200 + React | **302 → intern.gem.me** ⚠️ new |
| `portal_performance_events` rows (24h / 7d / total) | 0 / 0 / 0 | **0 / 0 / 0** ⚠️ unchanged |

The `lineintern.lovable.app` 302 is a **canonical redirect to the custom domain**, not a 404 or auth bounce. It's healthy and actually preferable for SEO and cookie scope. No fix required, but the QA checklist and any QR codes / shortcuts should target `intern.gem.me` directly.

## Plan steps

1. **Live routes**: already re-curled — all 5 URLs healthy (3× 200, 2× 302 to canonical). Report table to user.
2. **Pilot results doc**: `docs/PHASE_1C_PILOT_RESULTS.md` already exists with required schema (tester, role, device, OS, LINE version, network, branch, start/end, PASS/PARTIAL/FAIL counts, blocker list, evidence links, perf snapshot time). No edit needed.
3. **Manual QA (A–E)**: cannot execute LIFF cold/warm start, real GPS, real camera, double-tap, offline, geofence from sandbox. Re-state that these remain **requires-human-tester**, list them explicitly, and point to `docs/PHASE_1C_PILOT_QA.md`.
4. **Perf metrics**: re-query `portal_performance_events` — still 0 rows. p50/p95/error rate/top error_code/slowest 10/top routes all **N/A — no traffic captured**. Same SQL templates from `docs/PHASE_1C_PERF_QUERIES.md` are ready to run the moment the first real tester opens the portal.
5. **Pilot blocker fixes**: none triggered by automated checks. Forbidden list (line-webhook, attendance-submit, attendance-validate-token, claim_attendance_token, timezone, payroll, point ledger, Employee Documents, analytics polish) remains untouched.
6. **Automated checks**: re-run `npm run smoke:quick` and `bun run test`. Build is harness-managed (skip manual invoke per house rules). Compare to last baseline (16 pass / 0 fail / 5 skip on smoke; 7/7 on vitest).
7. **Final report**: live-route table, perf state, blockers, fixes, tests, remaining risks, verdict.

## Expected verdict

Same as last run: **CONDITIONALLY READY FOR SMALL PILOT**. Gating items unchanged:
- One human tester completes §A + §C on a real device (iOS + Android, inside LINE).
- After that session, `portal_performance_events` shows ≥1 row → confirms `logPortalEvent` is wired in production.

If either gate fails on first attempt, treat as S1 (instrumentation regression or LIFF init failure) and escalate before opening pilot.

## Out of scope (will not touch)
`line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, `_shared/timezone.ts`, `src/lib/timezone.ts`, payroll math, point ledger, Employee Documents, analytics dashboard polish, any new feature.

## Technical notes
- The lovable.app → gem.me 302 is set at the hosting layer; no app code change. Do not "fix" it.
- `.env`/preview still point at test ref `phhxdgaiwgaiuecvfjgj`; LIVE LINE webhook stays on `bjzzqfzgnslefqhnsmla` (per CRITICAL_FILES rule #7).
- All perf queries are SELECT-only against `public.portal_performance_events` with `environment: production`.
