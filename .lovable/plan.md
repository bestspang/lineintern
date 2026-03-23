

## QA Audit Report: Full Codebase Review

### CRITICAL BUGS

**BUG 1: `event_type` Inconsistency — Data Mismatch Between Backend Functions**

| Location | Value Used |
|----------|-----------|
| `attendance-submit/index.ts` (writes to DB) | `check_in` / `check_out` (underscore) |
| Frontend (all 19+ files) | `check_in` / `check_out` (underscore) |
| `employee-liff-validate/index.ts` line 133 | `check-in` / `check-out` (**HYPHEN**) |
| `portal-data/index.ts` line 545 | Both (handles both formats) |

**Impact**: `employee-liff-validate` queries today's logs but filters with `event_type === 'check-in'` (hyphen). If DB stores `check_in` (underscore, which `attendance-submit` writes), the LIFF validate will **never find today's check-in/out logs**. This means:
- `attendance.isWorking` always `false`
- `attendance.todayCheckIn` always `null`
- `attendance.minutesWorked` always `null`
- Portal employees see wrong attendance status

**Fix**: Change `employee-liff-validate/index.ts` lines 133-134 to handle both formats like `portal-data` does, or standardize to `check_in`.

---

**BUG 2: Timezone Mismatch in PayrollExportDialog Late/Status Calculation**

File: `PayrollExportDialog.tsx` lines 443-447:
```
const checkInDate = parseISO(checkIn.server_time);  // UTC Date
const shiftStart = new Date(day);                    // LOCAL browser time
shiftStart.setHours(sh, sm, 0, 0);                  // LOCAL browser time
const diffMinutes = (checkInDate.getTime() - shiftStart.getTime()) / 60000;
```

`parseISO` returns a UTC-based Date object, but `new Date(day)` + `setHours()` operates in the **browser's local timezone**. If the browser is not in Bangkok timezone (UTC+7), the diff will be **wrong by the timezone offset**. For a user in UTC, an employee who checked in at 08:00 Bangkok (01:00 UTC) would show as checking in at 01:00, making them appear 7 hours early.

**Fix**: Convert `checkIn.server_time` to Bangkok hours/minutes using `formatBangkokISODate` + Bangkok time extraction, or use the existing `getBangkokHoursMinutes()` utility.

---

### HIGH SEVERITY

**BUG 3: Auth.tsx — Password Validation Mismatch**

- HTML `<Input>` has `minLength={6}` (line 306)
- Zod schema requires `min(8)` + uppercase + lowercase + number (lines 20-24)
- Sign-up form: user types 6-7 char password → HTML validation passes → Zod rejects → confusing UX

**Fix**: Change HTML `minLength` to `8` to match Zod.

**BUG 4: Auth.tsx — Misleading Sign-Up Success Message**

Line 122: `'You can now sign in with your credentials.'` — But if email confirmation is NOT auto-confirmed (which is correct per security guidelines), users must verify email first. This message will cause confusion when they try to sign in immediately and fail.

**Fix**: Change to `'Please check your email to verify your account before signing in.'`

**BUG 5: Source Maps Exposed in Production**

`vite.config.ts` line 19: `sourcemap: true` — This was added for the SEO audit, but it exposes your **entire admin panel source code** to anyone who opens DevTools. For an internal admin dashboard with sensitive business logic, this is a security risk.

**Fix**: Change to `sourcemap: 'hidden'` (generates .map files for error tracking but doesn't reference them in the JS bundle, so browsers can't auto-load them).

---

### MEDIUM SEVERITY

**BUG 6: PayrollExportDialog — `formatBangkokISODate` Used for Log Filtering May Miss Edge Cases**

Line 406: `formatBangkokISODate(l.server_time) === dateStr`

This converts each log's `server_time` to a Bangkok date string and compares. If a check-in happens at 23:55 Bangkok time (16:55 UTC), and the log's `server_time` is stored as UTC, this correctly handles it. However, the date range query on lines 337-338 uses raw `startStr`/`endStr` (Bangkok dates) against `server_time` (UTC). A check-in at 00:30 Bangkok (17:30 UTC previous day) would be missed by the query if `startStr` = `2026-03-01` because the UTC time `2026-02-28T17:30` < `2026-03-01`.

**Impact**: First-day and last-day attendance logs near midnight may be missed in exports.

**Fix**: Adjust the query date range by subtracting 7 hours from the start and adding 17 hours to the end to account for UTC+7 offset.

**BUG 7: `usePageAccess` — Missing Menu Groups for Several Routes**

`getMenuGroupFromPath()` doesn't map these paths:
- `/branch-reports` → no group (denied for non-admin)
- `/feature-flags` → no group
- `/profile-sync-health` → no group  
- `/portal-faq-admin` → no group
- `/employee-menu` → no group
- `/attendance/deposits`, `/attendance/points/*`, `/attendance/rewards` → mapped to "Attendance" but DB may have separate groups like "Deposits", "Points & Rewards"

The `webapp_menu_config` response shows groups like `Deposits`, `Overtime`, `Payroll`, `Receipts`, `Points & Rewards` — these don't match the hardcoded strings in `getMenuGroupFromPath()`.

**Impact**: Non-admin users with access to these specific groups will be **denied access** because the path-to-group mapping returns `null` or the wrong group.

**BUG 8: PortalContext — `employee.branch_id` Never Set from LIFF Validate**

`Employee` interface expects `branch_id: string | null` (line 26), but `employee-liff-validate` returns `branch: { id, name }` — not `branch_id` directly. The PortalContext maps `data.employee` directly, so `employee.branch_id` will be `undefined` unless the edge function also returns it as a top-level field.

Looking at `employee-liff-validate` line 111-115: it returns `branch: employee.branches || null` but does NOT return `branch_id` separately. The `employee.branch_id` in the query (line 49) exists but isn't included in the response mapping.

**Impact**: Branch filtering in manager views (`employee?.branch_id`) will be `undefined`, causing managers to see **all branches** instead of only their own.

---

### LOW SEVERITY

**Issue 9: QueryClient Has No Default Error Handling**

Line 164: `const queryClient = new QueryClient()` — no `defaultOptions`. Failed queries will silently retry 3 times with no user feedback.

**Issue 10: Nested `<Suspense>` in Portal Routes**

Lines 198-209 (LIFF routes) and 219-265 (Portal routes) have `<Suspense>` nested inside the outer `<Suspense>` at line 183. This is harmless but redundant — the outer Suspense already catches lazy-loaded components.

**Issue 11: `console.log` in Production**

`PortalContext.tsx` line 87: `console.log('[Portal] LIFF state:', ...)` runs on every render in production. Multiple other files have debug logs. Minor performance impact + information leakage.

---

### SUMMARY TABLE

| # | Severity | Issue | File |
|---|----------|-------|------|
| 1 | CRITICAL | `event_type` hyphen vs underscore mismatch | `employee-liff-validate/index.ts` |
| 2 | CRITICAL | Timezone mismatch in late/status calculation | `PayrollExportDialog.tsx` |
| 3 | HIGH | Password minLength HTML vs Zod mismatch | `Auth.tsx` |
| 4 | HIGH | Misleading sign-up success message | `Auth.tsx` |
| 5 | HIGH | Source maps exposed in production | `vite.config.ts` |
| 6 | MEDIUM | Date range query misses edge-case logs | `PayrollExportDialog.tsx` |
| 7 | MEDIUM | Missing menu group mappings for routes | `usePageAccess.ts` |
| 8 | MEDIUM | `branch_id` not returned from LIFF validate | `employee-liff-validate/index.ts` |
| 9 | LOW | No default QueryClient error handling | `App.tsx` |
| 10 | LOW | Redundant nested Suspense | `App.tsx` |
| 11 | LOW | Console.log in production | Multiple files |

### RECOMMENDED FIX PRIORITY

1. Bug 1 (event_type) + Bug 8 (branch_id) — Fix `employee-liff-validate` edge function
2. Bug 2 (timezone) + Bug 6 (date range) — Fix PayrollExportDialog calculations
3. Bug 5 (sourcemap) — Change to `'hidden'`
4. Bug 3 + 4 (Auth UX) — Quick fixes
5. Bug 7 (menu groups) — Align `getMenuGroupFromPath` with actual DB groups

