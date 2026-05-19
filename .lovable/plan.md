# Phase 1D — Core Daily Ops Polish

## Pilot gate (read-only check, done)

- `portal_performance_events`: **0 rows total** (no real user has opened the portal yet).
- RLS confirmed: `portal_perf_insert_anon` allows INSERT for anon/auth (good — not the blocker).
- `attendance-validate-token` already returns `errorCode`: `TOKEN_NOT_FOUND` / `TOKEN_ALREADY_USED` / `TOKEN_EXPIRED`. Frontend currently throws away `errorCode` and shows the raw English `data.error` string.
- `Attendance.tsx` has an `errorMap` at line 719 but it keys off the message string, not `errorCode`.

Conclusion: perf events = 0 is **expected pre-pilot**, not a bug. Real blocker = wire `errorCode` through + add fallback timer for `requestIdleCallback`.

## Scope (additive only)

Touch only frontend presentation + Ops Center + `portal-perf.ts` fallback. Do NOT touch: `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, timezone helpers, payroll, point ledger, Employee Documents, geofence/liveness/fraud rules, token lifetime.

## Plan

### 1. Token error UX (Attendance.tsx, presentation only)
- Capture `errorCode` from validate-token response into state alongside `error`.
- Extend existing `errorMap` to key on `errorCode` first, fallback to message match. Map each to Thai title + message per spec:
  - `TOKEN_EXPIRED` → "ลิงก์หมดอายุแล้ว" + ขอลิงก์ใหม่จาก LINE Bot
  - `TOKEN_ALREADY_USED` → "ลิงก์นี้ถูกใช้งานแล้ว"
  - `TOKEN_NOT_FOUND` → "ลิงก์ไม่ถูกต้อง"
- Add two CTAs on the error card: "กลับไปที่ LINE" (`line://`) and "เปิด Member Portal" (`/p`). No "request new link" button (no safe existing API).

### 2. GPS retry (Attendance.tsx, presentation only)
- Add `locationStatus`: `idle | requesting | granted | denied | timeout | unsupported`.
- Wrap `requestLocation` to set status, parse `PositionError.code` (1=denied, 3=timeout).
- Render Thai loading/error states with retry button and short iOS/Android settings hint. Keep existing 10s timeout. No geofence change.

### 3. Camera retry (Attendance.tsx + LivenessCamera consumer only)
- Add Thai copy for the Suspense fallback already in place ("กำลังเปิดกล้อง...") — already exists, just add an error boundary message + retry button on the wrapper if `LivenessCamera` calls `onCancel` due to permission error. Pass an optional `onPermissionError` prop only if non-invasive; otherwise add the retry CTA on the parent card. No changes to liveness/fraud logic.

### 4. Ops Center quick fixes (`src/pages/attendance/OpsCenter.tsx`)
- Setup Issues card: make each row clickable → navigate to the existing admin page (`/attendance/employees`, `/attendance/branches`). No new filter params unless trivial.
- Add a **Performance Events Status** card showing: latest `portal_performance_events.created_at`, count last 24h, warning badge "ยังไม่มีข้อมูล performance จาก portal จริง" when zero.
- Add Quick Links row: Remote Checkout / Early Leave / OT / Leave (routes already exist).
- Preserve every existing card/button (Pilot QA card untouched per its VERIFIED header).

### 5. Performance event reliability (`src/lib/portal-perf.ts`)
- Change `requestIdleCallback` branch to ALSO arm a `setTimeout(send, 2500)` fallback, and use a `sent` flag so only the first one fires. This protects against LINE in-app browsers where `requestIdleCallback` may never fire under load.
- Keep silent failure, no PII, no UI block.

### 6. Resend portal link
- Inspect `employee-menu-validate` only. If a safe push function already exists, add one "ส่งลิงก์ Portal อีกครั้ง" button in OpsCenter behind admin role check + audit log. If not, skip and document as Phase 1E. (Default expectation: skip — no safe existing API for unsolicited push.)

### 7. Docs
- Create `docs/PHASE_1D_CORE_DAILY_OPS_POLISH.md` with before/after, manual QA checklist, perf-event verification steps.
- Append Phase 1D row to `docs/STATUS.md`.

### 8. Verify
- `npm run smoke:quick`, `bun run test`, `npm run audit:consistency`. Build is harness-managed.

## Out of scope (explicit)
- No new HRIS, no analytics, no Employee Documents touch.
- No token-lifetime change, no geofence change, no liveness bypass.
- No refactor of `Attendance.tsx` structure — only additive state + small JSX blocks.
- No DB migration (RLS already permits inserts).

## Files to touch
- `src/pages/Attendance.tsx` (token errorCode wiring, GPS retry states, camera retry copy)
- `src/pages/attendance/OpsCenter.tsx` (additive cards/links + perf-event status)
- `src/lib/portal-perf.ts` (idle-callback fallback timer)
- `docs/PHASE_1D_CORE_DAILY_OPS_POLISH.md` (new)
- `docs/STATUS.md` (1 line)

## Regression checklist
- Token error rendering still shows English fallback for unknown codes.
- Existing GPS happy path unchanged (`location` set → submit enabled).
- LivenessCamera lazy-load + capture flow unchanged.
- OpsCenter Pilot QA card text + Open Portal Performance navigate target unchanged (VERIFIED tag).
- `logPortalEvent` still fire-and-forget, still PII-free.
- `smoke:quick`, tests, audit all pass.
