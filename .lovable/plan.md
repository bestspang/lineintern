# Phase 1B: LIFF / Member Portal Performance & Reliability

## TASK 1 — AUDIT REPORT (current state)

### Daily flow trace (LINE rich-menu → Check-in)

```text
1. User taps rich-menu → opens https://intern.gem.me/portal?... in LIFF
2. App.tsx mounts: QueryClient → Locale → Tooltip → Toaster → BrowserRouter →
   ErrorBoundary → AuthProvider → Suspense → Routes
3. Match /portal/* → mounts <LiffProvider><PortalProvider><PortalLayout>
4. LiffProvider.useEffect → initLiff()
   a. fetch api_configurations.LIFF_ID from DB (skipped if cached in localStorage)
   b. dynamic import('@line/liff')          ← ~100KB chunk
   c. liff.init({ liffId })                  ← ~500-1500ms inside LINE app
   d. liff.getProfile()                      ← extra round-trip
   e. setIsReady(true) → unblock children
5. PortalProvider.useEffect (waits for liffIsReady):
   - calls supabase.functions.invoke('employee-liff-validate', { line_user_id })
   - returns employee + menuItems → setLoading(false)
6. PortalLayout renders header + nav, simultaneously fires:
   - notifications count (supabase.from('notifications') select count exact)
   - subscribes realtime channel 'notif-count'
7. PortalHome renders, fires in parallel:
   - useQuery 'pending-counts' → 3 portal-data calls (my-pending-ot/dayoff + my-leave-requests)
   - useQuery 'home-summary' → 1 portal-data call (heaviest endpoint)
8. User taps check-in card → /portal/checkin
9. CheckInOut fetches attendance-status (1 portal-data call) + interval refresh every 30s
10. Tap button → create-attendance-token → window.location.href='/attendance?t=...'
    (full reload, leaves SPA, lazy-loads Attendance.tsx + LivenessCamera + MediaPipe)
11. Attendance.tsx validateToken → claim_attendance_token → ready to checkin
```

### Findings

| # | Issue | Severity | Notes |
|---|---|---|---|
| F1 | **PortalLayout shows full-screen spinner with NO portal shell** until `loading=false` (waits for LIFF init + employee-liff-validate). White-ish skeleton appears but no header/nav. | HIGH | First meaningful paint is delayed by 2 network round-trips. |
| F2 | **PortalHome fires 4+ portal-data calls in parallel on mount** (home-summary, my-pending-ot, my-pending-dayoff, my-leave-requests) — `pending-counts` is redundant with `home-summary.pendingApprovals`. | HIGH | Duplicate work, slows TTI. |
| F3 | `home-summary` is a single endpoint that internally runs 5+ Supabase queries (profile, settings, points, attendance, OT count, leave count). Each adds latency. | MED | Already batched, but heavy. |
| F4 | **PortalLayout fetches notifications count on mount** + opens realtime channel — blocks first paint of header even when count is irrelevant pre-render. | MED | Should defer or render header optimistically. |
| F5 | `LivenessCamera.tsx` imports `@mediapipe/tasks-vision` at module top → bundled into Attendance.tsx chunk (~1MB+ wasm + JS). Only needed when actually checking in. | HIGH | Dynamic import gives big win. |
| F6 | `Attendance.tsx` is **eager-imported** in App.tsx? — Actually `lazy()`. Good. BUT route is `/attendance`, navigated via `window.location.href` (full reload) — fine. |  |  |
| F7 | `LiffProvider` has solid de-dup via `isLiffInitialized()` global state + `localStorage` LIFF_ID cache. | OK | No duplicate init. |
| F8 | `PortalContext.validateLiffUser` is called once per LIFF user change — no duplicate token validation observed. | OK |  |
| F9 | React Query `defaultOptions.staleTime: 30s` for ALL queries — too short for profile/menu, fine for attendance. | MED | Per-query staleTime needed. |
| F10 | No portal-specific perf instrumentation. AuthContext has 5s loading timeout, LIFF has 10s timeout — both fall back gracefully. |  |  |
| F11 | Indexes: most critical ones already exist. Missing: `attendance_tokens(token)` (only `id` PK), `employee_menu_tokens(expires_at)`, possibly `notifications.line_user_id`. | LOW |  |
| F12 | Admin/dashboard chunks are properly `lazy()`. No leakage into portal startup chunk except `vendor-react/ui/query/supabase/liff` shared chunks. | OK |  |

### Biggest reason portal feels slow (root cause)
1. **Loading gate too strict**: PortalLayout hides everything until LIFF init AND employee validation both complete (~1.5–3s on slow mobile). User sees only spinner+skeleton.
2. **Duplicate pending-counts query** in PortalHome on top of home-summary doubles API work.
3. **MediaPipe loaded eagerly** on Attendance.tsx mount even before user taps "Open Camera".

---

## TASK 2 — Make portal first paint fast

**Strategy**: render the portal shell (header skeleton + nav) immediately, gate ONLY data-dependent regions on loading. Defer non-critical queries.

### Changes
- **PortalLayout**: when `loading=true` AND `!error`, render the real header (with placeholder avatar) + bottom nav + a `{children}` slot that itself shows skeleton. Replace full-screen spinner with shell-aware skeleton. Keeps first-paint instant.
- **PortalHome**: remove the duplicate `pending-counts` query — derive `totalPending` from `homeSummary.pendingApprovals` (already returned). Cuts 3 portal-data calls.
- **PortalLayout notifications**: defer the `count` fetch by 200ms after mount; keep realtime subscription intact. (No regression to notification accuracy.)
- **QueryClient per-key staleTime**:
  - `home-summary`: `staleTime: 60_000` (was 30k via default + refetchInterval 60s — keep interval)
  - `pending-counts`: REMOVED (consolidated)
  - `attendance-status`: `staleTime: 15_000` (was implicit 30k, but we still refresh every 30s manually)
  - profile/menu (employee from PortalContext) — already cached in PortalContext state, no re-query

### Performance marks (lightweight, no PII)
Add `src/lib/portal-perf.ts`:
```ts
export const perfMark = (name: string) => {
  try { performance.mark(`portal:${name}`); } catch {}
  if (import.meta.env.DEV) console.debug(`[perf] ${name}`, performance.now().toFixed(0)+'ms');
};
```
Mark points:
- `liff_init_start` / `liff_init_end` in LiffProvider.initLiff
- `portal_provider_start` / `portal_provider_ready` in PortalProvider (after employee set)
- `portal_home_first_render` in PortalHome top of return
- `portal_first_action_available` after homeSummary loaded
- `checkin_token_validate_start` / `checkin_token_validate_end` in Attendance.tsx validateToken

No LINE ID, token, GPS, or photo URL ever logged.

---

## TASK 3 — Check-in / Check-out reliability

### Changes (CheckInOut.tsx + Attendance.tsx — additive only)
- **Lazy-load LivenessCamera + MediaPipe**: change `import LivenessCamera from '...'` (eager) → `const LivenessCamera = lazy(() => import('...'))` in `Attendance.tsx`. Wrap usage in `<Suspense fallback={...}>`. Saves ~500KB+ from initial Attendance bundle.
- **Double-submit guard**: `CheckInOut.handleCheckInOut` already uses `submitting` state; add ref-based lock to prevent double-tap before state flush. `Attendance.tsx` add same.
- **Thai loading states** progression in Attendance.tsx (additive UI strings):
  - `กำลังตรวจสอบลิงก์` (validateToken)
  - `กำลังเตรียมข้อมูลพนักงาน` (token claimed, fetching effective settings)
  - `พร้อมเช็กอิน` (ready)
  - `กำลังขอตำแหน่ง` (geolocation request — already present)
  - `กำลังเปิดกล้อง` (camera init)
  - `กำลังส่งข้อมูล` (submit) — exists, ensure shown
  - `เช็กอินสำเร็จ` / `เช็กเอาต์สำเร็จ` (after submitResult)
- **GPS timeout + retry**: wrap `navigator.geolocation.getCurrentPosition` with `timeout: 10000`, on error show retry button (additive, doesn't change geofence math).
- **Expired token UX**: when validateToken returns expired, show clear Thai message + "ขอลิงก์ใหม่" button (deep link to LINE `line://oaMessage/...` or close LIFF).
- **Slow network UX**: if validateToken/submit pending >3s, show interim "ใช้เวลานานกว่าปกติ..." hint.

**DO NOT change**: fraud rules, geofence radius, liveness thresholds, photo hash logic, or `claim_attendance_token` SQL.

---

## TASK 4 — Admin Daily Ops Center

### New page: `src/pages/attendance/OpsCenter.tsx`
Route: `/attendance/ops-center` (registered in App.tsx + webapp_page_config + registry-snapshot).

**Sections** (lightweight, single-pane dashboard, all queries already supported by existing tables):
1. **LINE / LIFF Health** — read `api_configurations` for LIFF_ID, `bot_logs` for recent profile-fetch errors (last 24h), rich-menu config presence
2. **Check-in/out Health (today, Bangkok TZ)** — counts from `attendance_logs` (event_type), expired token count from `attendance_tokens` where status='expired'
3. **Pending Actions** — pending counts: `remote_checkout_requests`, `early_leave_requests` (table exists?), `overtime_requests`, `leave_requests`
4. **Setup Issues** — employees missing line_user_id / auth_user_id, branches missing line_group_id / lat-lon
5. **Quick Links** — buttons to /audit-logs, /attendance/live-tracking, /attendance/dashboard, /attendance/employee-documents, /settings

Style: shadcn Card grid, no charts. Refresh button + last-updated timestamp. Bilingual TH/EN.

Access: management roles only via existing `usePageAccess`.

### Registry sync
- Migration: `INSERT INTO webapp_page_config` row for `/attendance/ops-center` with admin/owner/hr access
- Update `.lovable/registry-snapshot.json` admin_routes
- Run smoke test → expect 16/16 still pass

---

## TASK 5 — Observability

### New table: `portal_performance_events`
Columns: id (uuid pk), event_name (text), duration_ms (int), route (text), employee_id (uuid nullable), branch_id (uuid nullable), error_code (text nullable), metadata (jsonb), created_at (timestamptz default now())

RLS:
- INSERT: employees can insert their own rows (via portal-data or direct authenticated insert)
- SELECT: admin/owner/hr only via `has_admin_access(auth.uid()) OR has_hr_access(auth.uid())`

Index: `(event_name, created_at)` and `(employee_id, created_at)`

### Lightweight client → server bridge
Add `portalApi` endpoint or direct insert in `src/lib/portal-perf.ts` to **batch** events and post on visibility-change/unload (sendBeacon style). For initial slice, fire-and-forget single insert is acceptable. **Never store**: token, full LINE ID, GPS coords, photo URL, raw error stacks.

Events emitted (matching marks):
- portal_opened, liff_init_done, portal_ready
- token_validate_success, token_validate_failed (error_code only)
- checkin_submit_success, checkin_submit_failed
- checkout_submit_success, checkout_submit_failed

---

## TASK 6 — Index review

Existing indexes already cover most needs (verified via pg_indexes). Add only what's missing:

```sql
CREATE INDEX IF NOT EXISTS idx_attendance_tokens_token_lookup
  ON public.attendance_tokens (id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_employee_menu_tokens_expires
  ON public.employee_menu_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_line_user_id
  ON public.notifications (line_user_id) WHERE line_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_perf_event_created
  ON public.portal_performance_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_perf_employee_created
  ON public.portal_performance_events (employee_id, created_at DESC);
```

Skip indexes that already exist (verified): employees.auth_user_id, employees.line_user_id, employees.branch_id, attendance_logs(employee_id+server_time), happy_points.employee_id, leave/overtime/remote_checkout_requests by employee+status.

---

## TASK 7 — Tests
- `bun run build` (auto by harness)
- `node scripts/smoke-test.mjs --skip-build` → expect 16+ pass (new ops-center route added to snapshot)
- `bun run test` if vitest configured (check first)
- Manual checklist documented in final report

---

## Files to change

**New**
- `src/lib/portal-perf.ts` (perf marks + insert helper)
- `src/pages/attendance/OpsCenter.tsx`
- `supabase/migrations/<ts>_portal_perf_and_indexes.sql`

**Edit (additive only, surgical diffs)**
- `src/contexts/LiffContext.tsx` — add 2 perfMark calls in initLiff
- `src/contexts/PortalContext.tsx` — add 2 perfMark calls + emit portal_ready event
- `src/components/portal/PortalLayout.tsx` — render shell during loading; defer notifications fetch
- `src/pages/portal/PortalHome.tsx` — remove duplicate `pending-counts` query, derive from homeSummary; add perfMark
- `src/pages/portal/CheckInOut.tsx` — double-submit ref guard (already has `submitting` state); lazy-load nothing here (delegated to Attendance.tsx)
- `src/pages/Attendance.tsx` — lazy LivenessCamera, GPS timeout, Thai progress strings, perf marks
- `src/App.tsx` — register `/attendance/ops-center` route + per-query QueryClient already configured (no change to defaultOptions)
- `.lovable/registry-snapshot.json` — add ops-center to admin_routes + mark verified files
- `scripts/smoke-test.mjs` — no change expected (auto-detects new route)

## Files explicitly NOT touched
- `supabase/functions/line-webhook/**`
- `supabase/functions/attendance-submit/index.ts`
- `supabase/functions/attendance-validate-token/index.ts`
- `public.claim_attendance_token` SQL
- `src/lib/timezone.ts` and `_shared/timezone.ts`
- payroll calculation edge functions
- point ledger semantics
- Employee Documents files (already verified)
- existing leave/OT approval business logic
- LivenessCamera.tsx internal logic (only its import location changes)

## Regression checklist
- Build green
- Smoke 16+ pass
- Portal opens in LINE → shell visible <500ms
- Portal opens outside LINE → friendly fallback (existing)
- LIFF init not duplicated (verified by global state)
- employee-liff-validate not duplicated (verified by useEffect deps)
- Check-in token validates correctly
- Camera/GPS still work (no logic change)
- Geofence/fraud/liveness rules unchanged
- Ops Center loads without breaking existing admin pages
- Timezone (`formatBangkokISODate`) unchanged

## Verdict criteria
After implementation + smoke pass → **READY FOR PILOT** if all checklist items verified.
