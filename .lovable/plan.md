
# Phase 1C — Real-device Pilot QA & Readiness

Scope: verification + low-risk pilot-blocker fixes only. No new features, no Employee Documents work, no changes to `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, Bangkok timezone helpers, payroll math, or point ledger.

## Steps

### 1. Live route verification
Probe each URL (curl + browser navigate where needed) and report HTTP status, whether React app shell loads, auth redirect behavior, 404 status, build stamp if visible:
- `https://intern.gem.me/overview`
- `https://intern.gem.me/attendance/ops-center`
- `https://intern.gem.me/attendance/portal-performance`
- `https://lineintern.lovable.app/attendance/ops-center`
- `https://lineintern.lovable.app/attendance/portal-performance`

Expected: SPA fallback returns 200 + index.html, then client-side guard redirects unauthenticated users to `/auth`. No 404.

### 2. Pilot results document
Note: `docs/PHASE_1C_PILOT_RESULTS.md` already exists as a blank template. Verify schema covers required fields (tester, role, device, OS, LINE version, network, branch, start/end time, PASS/PARTIAL/FAIL counts, blockers, evidence links, perf snapshot time). Add any missing field; otherwise leave as-is. PII rule preserved (initials only).

### 3. Real-device QA checklist execution
Cannot physically run on real iOS/Android/LINE app from sandbox. Approach:
- Execute browser-tool automated subset against preview (desktop viewport + mobile viewport 390x844) for Tasks A/D/E that don't require LINE in-app browser or physical GPS/camera.
- For LIFF-only cases (cold/warm start in LINE, outside-LINE fallback copy, real GPS/camera permission flows), produce a structured checklist in `docs/PHASE_1C_PILOT_RESULTS.md` marked "requires human tester" with exact reproduction steps — these cannot be executed headlessly.
- Verify admin role gating by reading `ProtectedRoute` + `usePageAccess` + route registry rather than logging in as each role.

### 4. Performance data review
Use `supabase--read_query` against `portal_performance_events` (production env) with the 7 SQL templates from `docs/PHASE_1C_PERF_QUERIES.md`. Report p50/p95 for `portal_ready`, `liff_init_done`, `token_validate_success`; avg for `checkin_submit_success`; error rate; top `error_code`; slowest 10 events (id/route/duration only); routes with most events. Strict PII: no token, no full line_user_id, no GPS, no photo URL, no raw stack.

### 5. Pilot blocker fixes (low-risk only)
Only patch if QA surfaces a real blocker. Allowed surfaces: blank screen, route typo, broken retry button, expired-token Thai copy, GPS/camera recovery, double-submit guard, perf event not recording, Ops Center count obviously wrong. Forbidden: refactor, new features, UI polish. Each fix gets a `// ⚠️ VERIFIED YYYY-MM-DD` marker per existing guardrail policy.

### 6. Automated checks
Run in parallel where safe:
- `npm run build` (skipped — harness runs automatically per house rules)
- `npm run smoke:quick`
- `bun run test`
Capture pass/fail counts and any new failures vs. baseline (last audit: 0 failures).

### 7. Final report
Single message with: live route table, doc status, manual QA summary (incl. items deferred to human tester), perf metrics table, blockers list, fixes applied (if any), test results, remaining risks, and verdict (READY / NOT READY + blockers).

## Technical notes
- All perf queries are SELECT-only against `public.portal_performance_events`, run with `environment: "production"`.
- Browser tool may fail to start (capacity) — fall back to curl + code reading.
- `intern.gem.me` and `lineintern.lovable.app` both point at LIVE Supabase ref `bjzzqfzgnslefqhnsmla`; preview sandbox uses test ref `phhxdgaiwgaiuecvfjgj`. Do not "sync" them.
- No DB migrations expected. No edge function changes expected.
- If a blocker requires touching a CRITICAL_FILES-listed module, stop and ask before patching.

## Out of scope (will not touch)
`line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, `_shared/timezone.ts`, `src/lib/timezone.ts`, payroll math, point ledger, Employee Documents pages/components, analytics dashboard polish, any new feature.
