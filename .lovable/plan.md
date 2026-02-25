

## เพิ่ม Notification แจ้งเตือน Manager/Admin เมื่อมีคำขอใหม่

### Problem Statement
เมื่อพนักงานส่งคำขอ OT, Early Leave, หรือ Day Off — admin/manager จะได้รับแจ้งเตือนผ่าน LINE เท่านั้น แต่ไม่ได้รับ notification ใน Portal ทำให้ Manager Dashboard ไม่มี notification ขึ้นที่ bell icon

### Approach: Surgical Insert in 3 Edge Functions

เพิ่ม notification insert ให้ **employees ที่มี role ระดับ manager ขึ้นไป** (role_key: admin, manager, hr, owner) ทุกครั้งที่มีคำขอใหม่ถูกสร้าง

| Edge Function | จุดที่เพิ่ม | เงื่อนไข |
|---|---|---|
| `overtime-request/index.ts` | หลังสร้าง OT request สำเร็จ (บรรทัด ~170) | ทุกครั้ง |
| `early-checkout-request/index.ts` | หลังสร้าง early leave request สำเร็จ (บรรทัด ~215) | ทุกครั้ง |
| `flexible-day-off-request/index.ts` | หลังสร้าง day-off request สำเร็จ (บรรทัด ~143) | เฉพาะเมื่อ status = 'pending' (ไม่ใช่ auto-approve) |

### Implementation Details

ในแต่ละ function จะเพิ่ม block ประมาณนี้ (~20 บรรทัด):

```typescript
// Notify managers/admins via portal notification
try {
  const { data: managerEmployees } = await supabase
    .from('employees')
    .select('id, role_id, employee_roles!inner(role_key)')
    .in('employee_roles.role_key', ['admin', 'manager', 'hr', 'owner'])
    .eq('is_active', true);

  if (managerEmployees && managerEmployees.length > 0) {
    const notifications = managerEmployees
      .filter(m => m.id !== body.employee_id) // ไม่แจ้งตัวเอง
      .map(m => ({
        employee_id: m.id,
        title: '📋 คำขอ OT ใหม่',
        body: `${employee.full_name} ขอ OT ${estimatedHours} ชม. วันที่ ${requestDate}`,
        type: 'approval',
        priority: 'high',
        action_url: '/portal/approve-ot',
        metadata: { request_type: 'overtime', request_id: otRequest.id }
      }));
    
    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications);
    }
  }
} catch (e) {
  console.warn('[overtime-request] Failed to create manager notifications', e);
}
```

### Key Design Decisions
- **Query ผ่าน `employee_roles` join** — ใช้ role_key ที่มีอยู่แล้ว (admin, manager, hr, owner) ไม่ต้องสร้าง table ใหม่
- **Bulk insert** — สร้าง notification ให้ทุก manager ในครั้งเดียว
- **Filter ตัวเอง** — ถ้าคนขอเป็น manager เอง ไม่ต้องแจ้งตัวเอง
- **priority: 'high'** — เพื่อให้ notification โดดเด่นกว่า notification ปกติ
- **action_url** — ลิงก์ไปหน้า approve โดยตรง (`/portal/approve-ot`, `/portal/approve-early-leave`, `/portal/approve-leave`)
- **try/catch** — ไม่กระทบ flow เดิมหาก notification insert ล้มเหลว

### Files Changed

| File | Change | Lines Added |
|------|--------|-------------|
| `supabase/functions/overtime-request/index.ts` | เพิ่ม manager notification หลัง request created | ~20 |
| `supabase/functions/early-checkout-request/index.ts` | เพิ่ม manager notification หลัง request created | ~20 |
| `supabase/functions/flexible-day-off-request/index.ts` | เพิ่ม manager notification หลัง request created (เฉพาะ pending) | ~20 |

### Files NOT Changed
- Notifications.tsx, PortalLayout.tsx — ไม่แตะ (rendering ทำงานอยู่แล้ว)
- ManagerDashboard.tsx — ไม่แตะ
- Database schema — ไม่แตะ (ใช้ notifications table ที่มีอยู่)
- overtime-approval, early-leave-approval — ไม่แตะ (มี notification อยู่แล้ว)

### Risk Assessment: Very Low
- ทุก notification insert อยู่ใน try/catch → ไม่กระทบ flow เดิม
- ใช้ service role client (bypass RLS) ที่มีอยู่แล้ว
- ไม่เปลี่ยน response shape หรือ status logic ใดๆ
- ไม่มี database migration

### Verification
1. พนักงานส่งคำขอ OT → manager/admin ทุกคนได้รับ notification ใน bell icon
2. พนักงานส่งคำขอ Early Leave → manager/admin ได้รับ notification
3. พนักงานส่งคำขอ Day Off (ไม่ใช่ auto-approve) → manager/admin ได้รับ notification
4. Day Off ที่เป็น auto-approve → ไม่มี notification ถูกสร้าง (ถูกต้อง เพราะไม่ต้องอนุมัติ)
5. เช็คว่า LINE notification ยังส่งปกติ (flow เดิมไม่พัง)

