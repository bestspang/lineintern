

## Plan: Remote Checkout Notification + Notification Preferences

### สิ่งที่จะทำ 2 อย่าง

---

### Part 1: เพิ่ม Portal Notification เมื่อมี Remote Checkout Request ใหม่

**ปัญหา**: `remote-checkout-request/index.ts` ส่งแจ้งเตือนผ่าน LINE group เท่านั้น แต่ไม่ได้สร้าง notification ใน Portal ให้ manager/admin

**แก้ไข**: เพิ่ม notification insert block (~20 บรรทัด) หลังบรรทัด 124 (หลัง `console.log Created request`) — เหมือน pattern ที่ใช้ใน `overtime-request`, `early-checkout-request`, `flexible-day-off-request`

```typescript
// Notify managers/admins via portal notification (non-blocking)
try {
  const { data: managerEmployees } = await supabase
    .from('employees')
    .select('id, role_id, employee_roles!inner(role_key)')
    .in('employee_roles.role_key', ['admin', 'manager', 'hr', 'owner'])
    .eq('is_active', true);

  if (managerEmployees && managerEmployees.length > 0) {
    const notifications = managerEmployees
      .filter(m => m.id !== employee_id)
      .map(m => ({
        employee_id: m.id,
        title: '📍 คำขอ Checkout นอกสถานที่',
        body: `${employee.full_name} ขอ checkout นอกสถานที่ — ${reason}`,
        type: 'approval',
        priority: 'high',
        action_url: '/portal/approve-remote-checkout',
        metadata: { request_type: 'remote_checkout', request_id: request.id }
      }));
    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications);
    }
  }
} catch (e) {
  console.warn('[remote-checkout-request] Failed to create manager notifications', e);
}
```

| File | Change |
|------|--------|
| `supabase/functions/remote-checkout-request/index.ts` | เพิ่ม manager notification หลัง request created (~20 lines) |

---

### Part 2: Notification Preferences สำหรับ Manager

**แนวทาง**: สร้าง table `notification_preferences` เพื่อให้แต่ละ employee เลือกได้ว่าจะรับ notification ประเภทไหน + สร้าง UI ใน Notifications page

#### 2a. Database Migration

```sql
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  notify_overtime boolean NOT NULL DEFAULT true,
  notify_early_leave boolean NOT NULL DEFAULT true,
  notify_day_off boolean NOT NULL DEFAULT true,
  notify_remote_checkout boolean NOT NULL DEFAULT true,
  notify_receipts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Employees can read/update their own preferences
CREATE POLICY "Employees can view own preferences"
  ON public.notification_preferences FOR SELECT
  TO authenticated
  USING (employee_id IN (
    SELECT id FROM employees WHERE line_user_id = (
      SELECT line_user_id FROM employees WHERE id = employee_id
    )
  ));

-- Service role insert/update (from edge functions + portal)
-- For portal updates, we'll use service role via portal-data endpoint

ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
```

#### 2b. Edge Functions: Check Preferences Before Insert

ทุก Edge Function ที่ insert manager notification (5 ที่) จะเพิ่ม check preferences:

```typescript
// In each edge function, after querying managerEmployees:
const { data: prefs } = await supabase
  .from('notification_preferences')
  .select('employee_id, notify_overtime')
  .in('employee_id', managerEmployees.map(m => m.id));

const prefMap = new Map(prefs?.map(p => [p.employee_id, p]) || []);

const notifications = managerEmployees
  .filter(m => m.id !== employee_id)
  .filter(m => {
    const pref = prefMap.get(m.id);
    return !pref || pref.notify_overtime !== false; // default true if no pref
  })
  .map(m => ({ ... }));
```

แต่ละ function จะ check field ที่ตรงกับประเภท:
- `overtime-request` → `notify_overtime`
- `early-checkout-request` → `notify_early_leave`
- `flexible-day-off-request` → `notify_day_off`
- `remote-checkout-request` → `notify_remote_checkout`
- Receipt trigger → `notify_receipts` (ต้อง update trigger function)

**สำหรับ Receipt trigger**: จะ update function `notify_receipt_approval()` ให้ check preferences ของ employee ด้วย (receipt notification ส่งให้เจ้าของ receipt ไม่ใช่ manager — ดังนั้นไม่ต้องเปลี่ยน)

> Note: Receipt notification ส่งให้เจ้าของใบเสร็จ ไม่ใช่ manager ดังนั้น preferences ที่ filter manager notification ไม่กระทบ receipt notification ของเจ้าของ แต่ถ้าอนาคตต้องการให้ receipt owner เลือกปิดได้ก็สามารถเพิ่มได้

#### 2c. Portal UI: Notification Settings

เพิ่ม settings section ใน `Notifications.tsx` (gear icon ที่ header) — เปิด dialog/section ให้ toggle แต่ละประเภท:

- 📋 คำขอ OT — toggle
- 🚪 คำขอออกก่อนเวลา — toggle
- 📅 คำขอวันหยุด — toggle
- 📍 Checkout นอกสถานที่ — toggle
- 🧾 ใบเสร็จ — toggle

Data flow: Portal reads/updates `notification_preferences` via `portal-data` edge function (เพิ่ม endpoint ใหม่ `notification-preferences`)

#### 2d. portal-data endpoint

เพิ่ม 2 endpoints:
- `GET notification-preferences` → return preferences for employee
- `POST notification-preferences` → upsert preferences

---

### Files Changed

| File | Change | Risk |
|------|--------|------|
| `supabase/functions/remote-checkout-request/index.ts` | เพิ่ม manager notification | Very Low |
| `supabase/migrations/...` | สร้าง `notification_preferences` table + RLS | Low |
| `supabase/functions/overtime-request/index.ts` | เพิ่ม preference check | Very Low |
| `supabase/functions/early-checkout-request/index.ts` | เพิ่ม preference check | Very Low |
| `supabase/functions/flexible-day-off-request/index.ts` | เพิ่ม preference check | Very Low |
| `supabase/functions/portal-data/index.ts` | เพิ่ม endpoint `notification-preferences` | Low |
| `src/pages/portal/Notifications.tsx` | เพิ่ม Settings dialog กับ toggles | Low |

### Files NOT Changed
- Database trigger `notify_receipt_approval` — ไม่แตะ (ส่งให้เจ้าของ receipt ไม่ใช่ manager)
- Approval edge functions — ไม่แตะ (notification หลัง approve/reject ส่งให้ผู้ขอ ไม่ใช่ manager)
- PortalLayout, ManagerDashboard — ไม่แตะ

### Risk Assessment: Low
- Remote checkout notification: pattern เดียวกับ 3 functions ก่อนหน้า, try/catch ป้องกัน regression
- Preferences: default `true` ทุก field → ถ้ายังไม่มี row = รับทุกอย่าง (backward compatible)
- Edge function preference check: ถ้า query fail = ส่ง notification ปกติ (fail-open)

### Verification
1. พนักงานส่ง remote checkout request → manager ได้ notification ใน Portal
2. Manager ปิด notification OT → ส่ง OT request → manager ไม่ได้ notification
3. Manager เปิดกลับ → ส่ง OT request → manager ได้ notification
4. Manager ที่ยังไม่ตั้ง preferences → ได้รับ notification ทุกประเภท (default)
5. Flow เดิม (LINE notification) ยังทำงานปกติ

