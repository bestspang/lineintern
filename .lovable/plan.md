# Phase 1E — Controlled Pilot Rollout & Live Issue Triage

**Mode:** Pilot operations + reactive bugfix only. **No new features, no refactors, no polish.** All `// ⚠️ VERIFIED` files and protected paths (`line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, Bangkok TZ helpers, payroll, point ledger) remain untouched.

---

## Step 1 — Live Pilot Readiness Check (read-only)

Verify on the **published** URL (`https://lineintern.lovable.app` / `https://intern.gem.me`), not the auth-gated preview:

| Route | Expected |
|---|---|
| `/overview` | Loads for authed admin; redirects unauth to `/auth` |
| `/attendance/ops-center` | Loads for owner/admin/hr/manager; blocked for employee/field/user via `ProtectedRoute` + `usePageAccess` |
| `/attendance/portal-performance` | Same gating as ops-center |
| `/portal` | LIFF gate or outside-LINE fallback renders |
| `/attendance?t=<token>` | Token validation path renders Thai error map on invalid/expired |

Tools: `browser--navigate_to_url` against published URL, `code--view` for `App.tsx` + `usePageAccess.ts` to cross-check route gating. **No code changes** in this step — record results into the runbook.

Confirm published build is current: check `publish_settings--get_publish_settings` and compare against latest commit. If frontend changes are unshipped, flag to user (publishing is a user action).

## Step 2 — Pilot Runbook

Create `docs/PHASE_1E_CONTROLLED_PILOT.md` with the structure below (reusing format from existing `PHASE_1C_PILOT_QA.md` / `PHASE_1C_PILOT_RESULTS.md`):

```text
1. Pilot metadata: dates, branch, build/commit
2. Tester table: initials, role, phone, OS, LINE ver, network, account
3. Test cases (A–D) with PASS/PARTIAL/FAIL columns
4. Severity rubric (S1–S4)
5. Blocker log template (no PII)
6. Evidence/screenshot index
7. portal_performance_events snapshot section
8. Exit criteria + sign-off
```

No PII rule (initials only, no tokens/line_user_id/raw GPS/photo URLs).

## Step 3 — Test Case Catalogue

Document but do not auto-execute the following (real devices required, sandbox browser cannot do LINE in-app / GPS / camera reliably):

- **A. LINE Portal:** rich menu open, cold/warm start, outside-LINE fallback, slow network
- **B. Check-in/out:** valid in, valid out, expired token, used token, invalid token, double-tap, offline+reconnect, outside geofence
- **C. GPS/Camera:** allow, deny+retry, timeout (each)
- **D. Admin:** ops-center, portal-performance loads, counts sanity, pending visible, setup issues visible, lower roles blocked

What I **can** verify from the sandbox: route reachability, role gating logic in `ProtectedRoute` + `usePageAccess`, Thai error map in `Attendance.tsx`, button presence in `Employees.tsx` / `OpsCenter.tsx`. These get marked "source-verified" in the runbook; field rows remain for the human tester.

## Step 4 — portal_performance_events Confirmation

After first real tester opens the portal in LINE, run via `supabase--read_query`:

```sql
SELECT event_name, count(*), max(created_at)
FROM portal_performance_events
WHERE created_at > now() - interval '2 hours'
GROUP BY event_name
ORDER BY 2 DESC;
```

Plus p50/p95 for `portal_ready`, `liff_init_done`, and a `top error_code` query. Record into runbook §7.

If **zero events after confirmed real usage** → treat as S1, investigate in this order:
1. RLS on `portal_performance_events` (insert permitted for anon/authenticated)
2. `logPortalEvent` fallback path in `src/lib/portal-perf.ts` (already has rIC + 2.5s setTimeout safety net — confirm not regressed)
3. Auth context / supabase client init order

Fix minimally (additive only).

## Step 5 — Reactive Bugfix Policy

Only fix issues that **actually appear in the pilot**, and only from the allowed list:
blank screen, LIFF init loop, check-in/out submit failure, duplicate attendance row, broken GPS/camera retry, perf events not inserted, access-control typo, broken route, expired-token copy that blocks usage.

Forbidden: new modules, dashboard features, broad refactors, speculative perf, unrelated visual polish.

Each fix must:
- Touch the smallest surface possible
- Preserve every `// ⚠️ VERIFIED` marker
- Be followed by `npm run check` + `npm run smoke:quick`
- Be logged in `docs/PHASE_1E_DRIFT_REPORT.md` §pilot-fixes

## Step 6 — Final Checks

```bash
npm run check          # audit:consistency + smoke:quick
npm run build          # (only if a fix landed; otherwise rely on harness)
bun run test           # unit/integration
```

Record results in runbook §8 and update `docs/STATUS.md`.

## Step 7 — Final Output to User

1. Pilot readiness status (route table)
2. Runbook link
3. Real-device test summary (what was source-verified vs. needs human tester)
4. Performance event summary (or note: awaiting first real tester)
5. Blockers found + fixes applied
6. Build/check/smoke/test results
7. Remaining risks
8. **Verdict:** READY FOR WIDER PILOT  /  NOT READY (with blocker list)

---

## Files this plan will create/edit

- **Create:** `docs/PHASE_1E_CONTROLLED_PILOT.md`
- **Edit:** `docs/STATUS.md`, `docs/PHASE_1E_DRIFT_REPORT.md`, `.lovable/plan.md`
- **Edit only if a live blocker is found:** the specific minimal file(s) involved

## Out of scope (explicit)

`line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, `_shared/timezone.ts`, payroll math, point ledger, Employee Documents, analytics extras, any `// ⚠️ VERIFIED` file body.

## Open question

Before I start: **do you have a live pilot tester + branch lined up right now, or should I deliver the runbook + readiness check first and wait for tester results before Step 4–5?** This determines whether Step 4 produces real numbers in this session or a "pending first tester" placeholder.
