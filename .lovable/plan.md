
# 🚨 Phase 4.5: Hotfix Build Errors + AI Regression Guardrail

## 🔴 Affected Modules & Status

| Module | File | Status | หมายเหตุ |
|---|---|---|---|
| `portal-data` edge function | `supabase/functions/portal-data/index.ts` | **BROKEN** | Deploy ไม่ได้ → portal ทั้งระบบจะค้าง |
| Portal home-summary | endpoint `home-summary` | **BROKEN** (เพราะ portal-data deploy fail) | Pending OT/Leave count ไม่แสดง |
| ManagerDashboard | `src/pages/portal/ManagerDashboard.tsx` | WORKING | ใช้ count ที่ portal-data ส่งมา |
| ส่วนอื่นๆ ทั้งหมด | — | **WORKING** | ห้ามแตะ |

## 🧠 Root Cause Analysis (ละเอียดถึงราก)

### Error 1: `Property 'role_key' does not exist on type '{ role_key: any; }[]'`  (บรรทัด 499)
```ts
.select('branch_id, role:employee_roles(role_key)')
// ...
profileResult.data.role?.role_key  // ❌ TS infers role เป็น array
```
**ราก:** Supabase generated types มอง `employee_roles` relationship เป็น **array** (เพราะ FK direction) แต่จริงๆ เป็น 1-to-1 → ต้องบอก TS ว่า single object ด้วย `!inner` hint หรือ cast type / รูปแบบ embed ใหม่

### Error 2 & 3: `Expected 0-1 arguments, but got 2` (บรรทัด 554, 557)
```ts
let pendingOTQuery = supabase
  .from('overtime_requests')
  .select('id', { count: 'exact', head: true })  // ✅ select #1
  .eq('status', 'pending');

// ภายหลัง...
pendingOTQuery = pendingOTQuery
  .eq('employee.branch_id', branchId)
  .select('id, employee:employees!inner(branch_id)', { count: 'exact', head: true });
  // ❌ select #2 — query builder ตอนนี้เป็น FilterBuilder แล้ว ไม่ใช่ QueryBuilder
  //    method .select() ของ FilterBuilder ไม่รับ options arg
```
**ราก:** หลัง chain `.eq()` ไปแล้ว type จะเปลี่ยนเป็น `PostgrestFilterBuilder` ซึ่ง `.select()` ของมันรับแค่ 1 arg (column string เท่านั้น ไม่รับ `{count, head}`) → ต้อง **build select ที่ถูกต้องตั้งแต่แรก** แทนการ chain ซ้ำ

---

## 🛠️ Minimal-Diff Fix Plan

### Fix 1 — แก้ type ของ `role` embed (บรรทัด 483-499)
เปลี่ยนจาก embed object → fetch แยก หรือ cast type
```ts
// แนวทางที่ปลอดภัยที่สุด: cast ผลลัพธ์
const profileResult = await supabase
  .from('employees')
  .select('branch_id, employee_roles(role_key)')
  .eq('id', employee_id)
  .maybeSingle();

const profile = profileResult.data as { branch_id: string | null; employee_roles: { role_key: string } | { role_key: string }[] | null } | null;
const roleObj = Array.isArray(profile?.employee_roles) ? profile?.employee_roles[0] : profile?.employee_roles;
const roleKey = String(roleObj?.role_key || '').toLowerCase();
const branchId = profile?.branch_id ?? null;
```

### Fix 2 — Restructure pending OT/Leave queries (บรรทัด 538-558)
แทนที่จะ chain `.select()` ซ้ำ ให้ **decide select string ก่อน build query**:
```ts
const isTeamScope = approvalScope === 'team' && branchId;
const otSelect = isTeamScope ? 'id, employee:employees!inner(branch_id)' : 'id';
const leaveSelect = isTeamScope ? 'id, employee:employees!inner(branch_id)' : 'id';

let pendingOTQuery = supabase
  .from('overtime_requests')
  .select(otSelect, { count: 'exact', head: true })
  .eq('status', 'pending');

let pendingLeaveQuery = supabase
  .from('leave_requests')
  .select(leaveSelect, { count: 'exact', head: true })
  .eq('status', 'pending');

if (approvalScope === 'self') {
  pendingOTQuery = pendingOTQuery.eq('employee_id', employee_id);
  pendingLeaveQuery = pendingLeaveQuery.eq('employee_id', employee_id);
} else if (isTeamScope) {
  pendingOTQuery = pendingOTQuery.eq('employee.branch_id', branchId);
  pendingLeaveQuery = pendingLeaveQuery.eq('employee.branch_id', branchId);
}
```

### Fix 3 — Verify ไม่มี regression อื่น
- `bun run build` → ต้อง pass
- Deploy `portal-data` → ดู edge logs ว่า boot สำเร็จ
- เปิด `/p` → home-summary ต้องโหลดได้ทั้ง 3 scopes (self/team/global)

---

## 🛡️ AI Regression Prevention (สิ่งที่ User ขอ — ป้องกัน AI พังของเดิม)

ผมจะสร้าง **3 ชั้น guardrail** เพื่อกัน AI รอบหน้าไม่ให้พังของเดิม:

### Layer 1: Add `// ⚠️ VERIFIED` comments บน critical functions
ใส่ comment header ใน:
- `portal-data/index.ts` → `home-summary` endpoint (เพิ่งซ่อม)
- `attendance-submit/index.ts` (เคยซ่อมหลายรอบ)
- `line-webhook/index.ts` → `processTextMessage` dispatcher
- `command-parser.ts` (มีอยู่แล้ว ✅)

ตามที่ memory `mem://constraints/verified-working-comment-convention` กำหนด

### Layer 2: สร้าง `.lovable/CRITICAL_FILES.md`
list ไฟล์ห้ามแตะ + reason + รอบล่าสุดที่ verify → AI loops หน้าจะอ่านเป็น context

### Layer 3: Update `SYSTEM_SYNC_CHECKLIST.md`
เพิ่ม section "Supabase Query Patterns" — กฎ:
- ห้าม chain `.select()` หลัง `.eq()` (จะ break TS)
- ใช้ `!inner` hint สำหรับ 1-to-1 embed
- Cast type อย่างชัดเจนเมื่อ generated types ไม่แม่น

---

## 🔍 Sync Audit (สิ่งที่ User ขอ — เช็คว่าทุกส่วน up-to-date กัน)

หลัง hotfix ผมจะเช็ค 4 จุด sync ที่เสี่ยงตกหล่นจาก Phase 1-4 ที่ลบ Receipt/Deposit:

| จุดที่ตรวจ | วิธีตรวจ |
|---|---|
| **Help.tsx FAQ** sync กับ DB categories | grep หา hardcoded 'receipts'/'deposits' string |
| **App.tsx routes** มี orphan route ไหม | grep `/receipts`, `/deposits` ใน route definitions |
| **DashboardLayout / PortalLayout** nav links | grep menu items ที่ link ไปหน้าที่ไม่มีแล้ว |
| **bot_commands** table vs `command-parser.ts` | SQL query เทียบ command_key ในทั้ง 2 ที่ |
| **CronJobs.tsx** descriptions vs pg_cron jobs จริง | SQL `SELECT jobname FROM cron.job` เทียบกับ description map |

ทุกจุดที่เจอ mismatch จะรายงานเป็น **table มี/ไม่มี/แก้แล้ว** ก่อนแก้จริง

---

## 📋 Regression Checklist (ทำก่อน deploy)

- [ ] `bun run build` pass (no TS errors)
- [ ] Deploy `portal-data` → edge logs boot OK
- [ ] เปิด `/p` portal home → ไม่มี 500
- [ ] Manager login → เห็น team pending counts
- [ ] Self user login → เห็นแค่ self counts
- [ ] LINE webhook ยังตอบ /help, /menu, /summary ปกติ
- [ ] Attendance check-in/out flow ไม่กระทบ
- [ ] FAQ search ไม่พังหลังลบ 'receipts' category

---

## 📦 Deliverables

1. **Hotfix** `portal-data/index.ts` (3 บรรทัด TS errors)
2. **Add VERIFIED comments** (4 ไฟล์ critical)
3. **Create `.lovable/CRITICAL_FILES.md`** (guardrail สำหรับ AI loops หน้า)
4. **Update `SYSTEM_SYNC_CHECKLIST.md`** (เพิ่ม Supabase query patterns + regression rules)
5. **Sync audit report** (5 จุดที่ตรวจ + mismatch ที่เจอ)
6. **Smoke test guide** `docs/SMOKE_TEST_PHASE4.md` (ตามที่ค้างจากรอบก่อน)

---

## ❓ คำถามก่อน execute

ขอ confirm 1 ข้อก่อนเริ่ม:
- **Sync audit** เจอ mismatch → ให้ผม **fix ทันทีในรอบเดียว** หรือ **report กลับมาให้ user ตัดสินใจที่ละจุด**? (ผมแนะนำ fix ทันทีถ้าเป็น dead reference ที่ชัดเจน เช่น route ที่ไม่มี page แล้ว, แต่ถ้าเป็น behavioral change จะถาม)
