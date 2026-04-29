# Phase 1C — Real-device Pilot QA & Performance Tuning

## Scope guardrails
- No new HRIS features. No Employee Documents work.
- Do **NOT** touch: `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, Bangkok timezone helpers, payroll math, point ledger.
- Code changes are limited to: 1 nav-config edit + 2 new docs. No edge function changes, no DB migrations (access rules for both routes already exist in `webapp_page_config`).

## Affected modules
| Module | Status | Action |
|---|---|---|
| `src/components/DashboardLayout.tsx` (Attendance group) | WORKING | Additive: insert 2 nav items |
| `webapp_page_config` (rows for ops-center & portal-performance) | WORKING — owner/admin/hr/manager already `can_access=true`, others `false` | No change needed |
| `docs/PHASE_1C_PILOT_QA.md` | MISSING | Create |
| `docs/PHASE_1C_PERF_QUERIES.md` | MISSING | Create |
| `src/pages/attendance/PortalPerformance.tsx` | WORKING (live dashboard) | No change |
| `src/pages/attendance/OpsCenter.tsx` | WORKING | No change |

## Plan

### 1. Nav entries (Daily Ops Center + Portal Performance)
Edit `src/components/DashboardLayout.tsx`, **Attendance** group only. Append two items at the end of `items[]` (lines 159 area), placed after `Settings` so existing order stays intact:

```ts
{ title: 'Daily Ops Center', titleTh: 'ศูนย์ปฏิบัติการ', url: '/attendance/ops-center', icon: Activity },
{ title: 'Portal Performance', titleTh: 'ประสิทธิภาพพอร์ทัล', url: '/attendance/portal-performance', icon: Gauge },
```

Both icons (`Activity`, `Gauge`) are already imported. Visibility is enforced by `canAccessPage(url)` against `webapp_page_config`, which is already configured: owner / admin / hr / manager = true; executive / moderator / field / user / employee = false. No DB migration needed.

### 2. `docs/PHASE_1C_PILOT_QA.md` — manual QA template + checklist
Bilingual (TH/EN). Sections:
- **Tester metadata table**: device model, OS+version, LINE app version, network (Wi-Fi/4G/5G), tester role, date/time (Asia/Bangkok), perf event id (optional).
- **A. Employee portal inside LINE** — rich-menu open, skeleton <300ms, portal home render, attendance status loads, check-in/out button visible, no white screen, no infinite spinner.
- **B. Outside LINE fallback** — open portal URL in Chrome/Safari, friendly fallback shown, no blank state.
- **C. Check-in token flow** — valid token, expired token (Thai error copy), GPS allow/deny+retry, camera allow/deny+retry, liveness lazy-load only when required, submit success, double-tap → single submission (relies on existing `submitLockRef`).
- **D. Manager / Ops Center** — `/attendance/ops-center` loads, today check-in/out counts, pending actions, setup issues (missing LINE ID etc.), quick links navigate correctly.
- **Result template per case**: Pass / Fail / Blocked, observed load time (ms), severity (S1 blocker / S2 major / S3 minor / S4 cosmetic), reproduction steps, screenshots needed (Y/N), perf-event id reference (no PII).
- **Severity rubric** + **pilot exit criteria**: zero S1, ≤2 S2 with workarounds, p95 portal_ready < 2500ms, token_validate_failed rate < 5%.

### 3. `docs/PHASE_1C_PERF_QUERIES.md` — read-only SQL report
Pure SQL against `portal_performance_events`. **No tokens, line_user_id, gps, photo_url, or raw error strings exposed** — only `event_name`, `route`, `error_code`, `duration_ms`, aggregates.

Queries:
1. **Latency p50/p75/p95** for `portal_ready`, `liff_init_done`, `token_validate_success` over last 24h / 7d using `percentile_cont` in a `WITH` CTE filtered by `event_name`.
2. **token_validate_failed by error_code** — `count(*) GROUP BY error_code`.
3. **checkin_submit_failed by error_code** — same pattern.
4. **Slowest 20 portal_ready** — `SELECT id, route, duration_ms, created_at` ORDER BY duration_ms DESC LIMIT 20 (no employee_id, no metadata blob).
5. **Events grouped by route** — count + p95 per `route`.
6. **Daily trend** — bucket by `date_trunc('day', created_at AT TIME ZONE 'Asia/Bangkok')`.

Each query is copy-pasteable into Lovable Cloud SQL editor. Includes a short "how to read this" note in Thai+English.

### 4. Pilot-blocking fixes
None upfront. Phase 1C is a **QA / observability** phase. Only after a tester reports a true S1 (blank screen, LIFF cannot init, token validate misfires, check-in cannot submit, GPS/camera retry broken, Ops Center inaccessible to allowed role) will a minimal-diff fix be applied — and only with explicit approval before touching any of the protected modules.

### 5. Build / smoke verification
After the 3 file changes, run `npm run build` and `npm run smoke:quick`. No edge function or DB changes → no new smoke surface.

## What is preserved
- All existing nav items, order, and icons
- Ops Center & Portal Performance pages (untouched)
- All `webapp_page_config` rows (already correct)
- All protected backend modules listed in scope guardrails

## Files to change
1. `src/components/DashboardLayout.tsx` — add 2 lines in Attendance group `items[]`
2. `docs/PHASE_1C_PILOT_QA.md` — new
3. `docs/PHASE_1C_PERF_QUERIES.md` — new

## Deliverables on completion
1. Pilot QA checklist (doc)
2. Perf SQL report (doc)
3. Ops Center + Portal Performance visible in nav for owner/admin/hr/manager only
4. Build + smoke results
5. Verdict: READY FOR SMALL PILOT (pending real-device tester sign-off using the new checklist)
