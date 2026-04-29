# Portal Performance Dashboard + Phase 1B QA Checklist

Two additive deliverables. No changes to existing routes, business logic, or core flows.

---

## Part 1 — Portal Performance Dashboard

### Route
`/attendance/portal-performance` (admin/owner/hr only — same access pattern as OpsCenter)

### Data source
`portal_performance_events` table (already exists, RLS allows authenticated SELECT for admin).

Event names already emitted by `src/lib/portal-perf.ts`:
- `liff_init_done`, `portal_ready`
- `token_validate_success`, `token_validate_failed`
- `checkin_submit_success`, `checkin_submit_failed`
- `checkout_submit_success`, `checkout_submit_failed`

### Page sections (top → bottom)

**Header bar**
- Title "Portal Performance" + last updated time
- Refresh button + auto-refresh toggle (30s interval)
- Time range selector: Last 1h / 24h / 7d (default 24h)

**Row 1 — KPI cards (4 cards)**
- **First Paint (portal_ready)** — p50 / p95 ms over range. Color: green <1500, amber 1500–3000, red >3000.
- **LIFF Init** — p50 / p95 ms, sample count.
- **Check-in Latency** — avg duration of `checkin_submit_success`.
- **Error Rate** — `*_failed / (success + failed)` percentage across token + check-in + check-out. Green <2%, amber 2–5%, red >5%.

**Row 2 — Event volume table**
Per event_name: total count, success count, fail count, p50 ms, p95 ms, last seen.

**Row 3 — Recent errors (last 50)**
Table from rows where `error_code IS NOT NULL`: time, event_name, error_code, route, employee (full_name lookup), branch.

**Row 4 — Per-route breakdown (collapsible)**
Group by `route` → count + avg duration. Helps spot slow routes.

### Implementation notes
- Single React Query with `queryKey: ['portal-perf', range]`, `staleTime: 20_000`, `refetchInterval` controlled by toggle.
- Use plain Supabase `.from('portal_performance_events' as any)` + aggregations done client-side on a capped fetch (last 5,000 rows for selected range — fast with existing index `idx_portal_perf_event_created`).
- Percentile calc inline (sort + index — small dataset).
- Reuse semantic tokens (`bg-card`, `text-muted-foreground`, `text-destructive`). No raw colors.
- Bilingual labels (Thai primary + English secondary), match OpsCenter style.
- Empty state: "ยังไม่มีข้อมูล performance — รอให้พนักงานเข้าใช้ portal สักครู่"

### Files to add/change
- **NEW** `src/pages/attendance/PortalPerformance.tsx` (~250 lines)
- **EDIT** `src/App.tsx` — lazy import + 1 route line (next to ops-center)
- **EDIT** `.lovable/registry-snapshot.json` — append `/attendance/portal-performance` to admin_routes
- **DB** insert into `webapp_page_config` — 9 role rows (owner/admin/hr/manager = true; others = false)

### Files NOT touched
- portal-perf.ts (already emits events)
- portal_performance_events table/migration
- OpsCenter.tsx (separate page, no merge)
- Any LIFF/Portal/check-in business logic

---

## Part 2 — Phase 1B QA Checklist Document

### File
**NEW** `docs/PHASE_1B_QA_CHECKLIST.md` — markdown, bilingual headings, ~200 lines.

### Structure

**Section A: Setup**
- Tester role, devices needed (real Android + iOS phone with LINE app, desktop browser), test employee account (with branch + LINE ID), expired token sample link prepared.
- Pass criteria template: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL + screenshot field + notes.

**Section B: LIFF Open & First Paint** (5 cases)
1. Open portal from LINE rich menu cold start
   - Steps: kill LINE app → tap rich menu → measure
   - Pass: Thai skeleton appears < 1s; portal home interactive < 3s; no white flash
   - Fail: blank white > 1.5s or interactive > 5s
2. Open portal from LINE warm start (LIFF cached)
   - Pass: interactive < 1.5s
3. Open portal outside LINE (desktop browser)
   - Pass: friendly fallback message in Thai; no JS crash
4. Open portal twice rapidly (back+forward)
   - Pass: no duplicate LIFF init, no duplicate token validation in network tab
5. Slow 3G simulation (Chrome DevTools)
   - Pass: skeleton + Thai loading strings shown; no infinite spinner

**Section C: Expired Link UX** (3 cases)
1. Use attendance token > 10 minutes old
   - Pass: clear Thai error "ลิงก์หมดอายุ" + button to request new link or DM bot
   - Fail: generic 500 / blank screen / English-only
2. Use already-used (status=used) token
   - Pass: "ลิงก์ถูกใช้งานแล้ว" + recovery CTA
3. Use malformed token
   - Pass: friendly Thai error, NOT exception trace

**Section D: GPS Denied Retry** (4 cases)
1. First-time GPS prompt → user denies
   - Pass: Thai message "กรุณาอนุญาตการเข้าถึงตำแหน่ง" + Retry button visible
2. Tap Retry after re-enabling permission
   - Pass: location obtained, flow continues
3. GPS timeout (move outside cell coverage simulation or disable network)
   - Pass: timeout shown within 15s, retry button, no infinite spinner
4. GPS off at OS level (iOS Settings → Privacy → Location → off)
   - Pass: clear Thai instruction to enable in settings, no false success

**Section E: Camera Denied Retry** (3 cases)
1. Camera permission denied
   - Pass: Thai message + retry button + skip option (if liveness optional per branch)
2. Camera permission granted but no rear camera (front-only device)
   - Pass: graceful fallback or clear "ไม่พบกล้อง" message
3. Switch tab during liveness, return
   - Pass: camera resumes or clean restart

**Section F: Check-in / Check-out Reliability** (5 cases)
1. Normal check-in inside geofence
   - Pass: success message + Thai confirmation + LINE DM received
2. Check-in outside geofence (blocked branches)
   - Pass: clear Thai distance message; no submission
3. Double-tap submit button
   - Pass: only ONE attendance_log row in DB (verify via /attendance/logs)
4. Check-out without prior check-in
   - Pass: blocked with helpful message
5. Network drop mid-submit
   - Pass: offline queue stores intent; sync after reconnect; no duplicate

**Section G: Admin Ops Center & Performance Dashboard** (3 cases)
1. Open `/attendance/ops-center` as admin
   - Pass: 4 sections render < 2s; counts match `/attendance/logs` for today
2. Open `/attendance/portal-performance` as admin
   - Pass: KPI cards populate; auto-refresh works; no console errors
3. Open same pages as `field`/`user` role
   - Pass: blocked with redirect (per webapp_page_config)

**Section H: Performance Regression Sanity** (2 cases)
1. Lighthouse audit on `/portal/` (Mobile preset)
   - Pass: Performance ≥ 70, no render-blocking critical errors
2. Bundle inspection
   - Pass: MediaPipe NOT in initial chunk (search Network tab for `mediapipe` — should load only on `/attendance` legacy or `/portal/checkin`)

**Section I: Sign-off**
- Tester name, date, device summary, total PASS/PARTIAL/FAIL count
- Verdict: READY FOR PILOT / NEEDS FIX (with blocker list)
- Link to portal_performance_events dashboard for evidence

### Files NOT touched
- All source code (this is docs only)
- Existing `docs/SMOKE_TEST_PHASE4.md` (separate concern)

---

## Execution order
1. Insert webapp_page_config rows (DB)
2. Create `PortalPerformance.tsx`
3. Edit `App.tsx` (2 lines: import + route)
4. Edit `registry-snapshot.json` (1 string append)
5. Create `docs/PHASE_1B_QA_CHECKLIST.md`
6. Run `node scripts/smoke-test.mjs --skip-build` → expect 17 pass (61 routes)

## Regression checklist
- Build green
- Smoke pass with new route synced
- OpsCenter still loads
- No change to portal-perf.ts emit logic
- No new RLS / no new table
- Field/user role correctly blocked from new page

## Verdict criteria
After implementation + smoke green → both deliverables ready, no blockers.
