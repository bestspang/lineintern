

## QA Audit Report — Current State Review

จากการตรวจสอบ codebase ปัจจุบัน พบว่า **bug ที่เคยรายงานไว้ 11 ข้อส่วนใหญ่ได้รับการแก้ไขแล้ว** ยังคงเหลือปัญหาที่ต้องแก้ไขดังนี้:

---

### ✅ FIXED (ไม่ต้องทำอะไรแล้ว)

| # | Issue | Status |
|---|-------|--------|
| 1 | `event_type` hyphen vs underscore | ✅ Fixed — line 133-134 handles both formats |
| 2 | Timezone mismatch in PayrollExport | ✅ Fixed — uses `getBangkokHoursMinutes()` (line 443-446) |
| 3 | Password minLength mismatch | ✅ Fixed — `minLength={8}` (line 307) |
| 4 | Misleading sign-up message | ✅ Fixed — "Please check your email to verify..." (line 123) |
| 5 | Source maps exposed | ✅ Fixed — `sourcemap: 'hidden'` (line 19) |
| 6 | Date range query edge case | ✅ Fixed — uses `+07:00` suffix (lines 337-338) |
| 7 | Missing menu group mappings | ✅ Fixed — all routes mapped including `/branch-reports`, `/feature-flags`, etc. |
| 8 | `branch_id` not returned | ✅ Fixed — line 159: `branch_id: employee.branch_id || null` |

---

### ⚠️ REMAINING ISSUES (ยังไม่ได้แก้)

**Issue 9: QueryClient — No default error handling**
- Line 164: `const queryClient = new QueryClient()` — ไม่มี `defaultOptions`
- ทุก query จะ retry 3 ครั้งอัตโนมัติ (default) โดยไม่มี feedback ให้ user
- ควรตั้ง `retry: 1`, `staleTime`, และ global `onError`

**Issue 11: `console.log` in Production**
- `PortalContext.tsx` line 87: `console.log('[Portal] LIFF state:', ...)` — ยังอยู่ในทุก render
- ข้อมูลอาจ leak ใน production DevTools

---

### 🔍 NEW ISSUES FOUND (พบใหม่)

**NEW-1: `employee-liff-validate` — server_time query ไม่ครอบคลุม midnight edge case**

Line 127-128:
```
.gte('server_time', `${today}T00:00:00`)
.lt('server_time', `${today}T23:59:59`)
```

`today` มาจาก `getBangkokDateString()` ซึ่งให้ Bangkok date (เช่น `2026-03-23`). แต่ `server_time` ในฐานข้อมูลเก็บ UTC. ดังนั้น query นี้กรอง UTC range `00:00-23:59` ของวันที่ Bangkok — ซึ่งจริงๆ ควรเป็น `17:00 UTC วันก่อน` ถึง `16:59 UTC วันนี้` (UTC+7)

**ผลกระทบ**: พนักงานที่ check-in ก่อน 07:00 Bangkok (00:00 UTC) จะ **ไม่เจอ log** เพราะ UTC time เป็นวันก่อนหน้า. ในทางปฏิบัติแทบไม่กระทบ (ไม่ค่อยมีคน check-in ก่อน 07:00) แต่เป็นจุดที่ไม่ถูกต้องทางเทคนิค.

**Fix**: เปลี่ยนเป็น `.gte('server_time', `${today}T00:00:00+07:00`)` และ `.lt('server_time', `${today}T23:59:59+07:00`)`

---

**NEW-2: `employee-liff-validate` — `minutesWorked` ใช้ `new Date().getTime()` (UTC) ตรง**

Line 140: `minutesWorked = Math.floor((new Date().getTime() - checkInTime.getTime()) / 60000);`

ตรงนี้ถูกต้อง — ทั้ง `new Date()` และ `checkInTime` เป็น UTC milliseconds ดังนั้น diff ถูก. ไม่ใช่ bug.

---

### SUMMARY

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 9 | LOW | No default QueryClient config | ❌ ยังไม่แก้ |
| 11 | LOW | console.log in production | ❌ ยังไม่แก้ |
| NEW-1 | LOW | LIFF validate timezone query | ❌ ยังไม่แก้ (แทบไม่กระทบจริง) |

### แผนแก้ไข (3 ไฟล์)

**1. `src/App.tsx`** — เพิ่ม QueryClient defaultOptions
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});
```

**2. `src/contexts/PortalContext.tsx`** — ลบ/เปลี่ยน console.log เป็น conditional
```ts
// Remove line 87 or wrap:
if (import.meta.env.DEV) console.log('[Portal] LIFF state:', ...);
```

**3. `supabase/functions/employee-liff-validate/index.ts`** — เพิ่ม `+07:00` ใน server_time query
```ts
.gte('server_time', `${today}T00:00:00+07:00`)
.lt('server_time', `${today}T23:59:59+07:00`)
```

**Risk**: Very Low — ทั้ง 3 จุดเป็นการ fix เล็กน้อย ไม่กระทบ business logic

