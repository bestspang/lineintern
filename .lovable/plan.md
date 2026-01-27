

## แผนการ Implement Features ที่ยังไม่มี

### สรุปผลการตรวจสอบ

| Suggestion | สถานะ | ต้องทำ |
|------------|-------|--------|
| **Suggestion 1:** LINE Push Notification OT/Day-Off | ✅ **มีแล้ว** | ไม่ต้องทำ |
| **Suggestion 2:** Pending Requests Count บน PortalHome | ❌ ยังไม่มี | **ต้องทำ** |
| **Suggestion 3:** Leave Requests History | ❌ ยังไม่มี | **ต้องทำ** |
| **Feature 4:** Leaderboard Branch/All Toggle | ✅ **มีแล้ว** | ไม่ต้องทำ |

---

## การ Implement ที่ต้องทำ

### Task 1: แสดง Pending Requests Count บน PortalHome

**ไฟล์ที่แก้ไข:** `src/pages/portal/PortalHome.tsx`

**การเปลี่ยนแปลง:**
1. เพิ่ม `useQuery` สำหรับ fetch pending OT/Day-Off counts
2. แสดง Badge บน "ประวัติการทำงาน" card เมื่อมี pending requests

**Implementation:**
```typescript
// เพิ่ม query ใหม่
const { data: pendingCounts } = useQuery({
  queryKey: ['pending-counts', employee?.id],
  queryFn: async () => {
    if (!employee?.id) return { ot: 0, dayoff: 0 };
    const [otResult, dayOffResult] = await Promise.all([
      portalApi<any[]>({
        endpoint: 'my-pending-ot-requests',
        employee_id: employee.id
      }),
      portalApi<any[]>({
        endpoint: 'my-pending-dayoff-requests',
        employee_id: employee.id
      })
    ]);
    return {
      ot: otResult.data?.length || 0,
      dayoff: dayOffResult.data?.length || 0
    };
  },
  enabled: !!employee?.id,
  refetchInterval: 60000,
});

const totalPending = (pendingCounts?.ot || 0) + (pendingCounts?.dayoff || 0);
```

**UI Change:** เพิ่ม Badge บน Work History card
```tsx
// เพิ่มใน quickActions "ประวัติการทำงาน" card
{totalPending > 0 && (
  <Badge className="absolute top-2 right-2 bg-amber-500 text-white">
    {totalPending}
  </Badge>
)}
```

**ความเสี่ยง:** ต่ำมาก - เพิ่ม UI indicator โดยไม่กระทบ logic อื่น

---

### Task 2: ประวัติ Leave Requests และ Cancel จาก Portal

**ไฟล์ที่แก้ไข:**
1. `supabase/functions/portal-data/index.ts`
2. `src/pages/portal/MyWorkHistory.tsx`

#### Task 2.1: Backend - เพิ่ม Endpoints ใหม่

**Endpoints ใหม่:**
- `my-leave-requests` - ดึง Leave requests ทั้งหมด (pending และ approved/rejected)
- `cancel-leave-request` - ยกเลิก Leave request ที่ pending

**Implementation ใน portal-data/index.ts:**
```typescript
// Case: my-leave-requests
case 'my-leave-requests': {
  const limit = params?.limit || 10;
  const result = await supabase
    .from('leave_requests')
    .select('id, start_date, end_date, leave_type, reason, status, created_at, approved_at, rejection_reason')
    .eq('employee_id', employee_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  data = result.data;
  error = result.error;
  break;
}

// Case: cancel-leave-request
case 'cancel-leave-request': {
  const { requestId, reason } = params;
  
  if (!requestId) {
    error = { message: 'requestId is required' };
    break;
  }
  
  // Verify ownership and pending status
  const { data: existing } = await supabase
    .from('leave_requests')
    .select('id, employee_id, status')
    .eq('id', requestId)
    .eq('employee_id', employee_id)
    .eq('status', 'pending')
    .maybeSingle();
  
  if (!existing) {
    error = { message: 'Request not found or cannot be cancelled' };
    break;
  }
  
  const { error: updateError } = await supabase
    .from('leave_requests')
    .update({
      status: 'cancelled',
      rejection_reason: reason || 'Cancelled by employee via Portal',
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId);
  
  if (updateError) {
    error = updateError;
  } else {
    data = { success: true };
  }
  break;
}
```

#### Task 2.2: Frontend - เพิ่ม Section ใน MyWorkHistory.tsx

**เพิ่ม:**
1. Interface สำหรับ LeaveRequest
2. State สำหรับ leave requests
3. Fetch `my-leave-requests` ใน `fetchPendingRequests`
4. UI Section แสดง pending Leave requests พร้อมปุ่ม Cancel
5. อัปเดต `handleCancelRequest` ให้รองรับ type 'leave'

**Implementation:**
```typescript
// Interface
interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
}

// State
const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);

// Fetch เพิ่มใน Promise.all
const leaveResult = await portalApi<LeaveRequest[]>({
  endpoint: 'my-leave-requests',
  employee_id: employee.id,
  params: { limit: 10 }
});

// อัปเดต cancel logic
const handleCancelRequest = async () => {
  if (!cancelTarget || !employee?.id) return;
  setCancelling(true);

  const endpoint = cancelTarget.type === 'leave' ? 'cancel-leave-request' : 'cancel-my-request';
  const params = cancelTarget.type === 'leave' 
    ? { requestId: cancelTarget.id, reason: 'Cancelled by employee via Portal' }
    : { requestId: cancelTarget.id, requestType: cancelTarget.type, reason: 'Cancelled by employee via Portal' };
  // ...rest of logic
};
```

**ความเสี่ยง:** ต่ำ - เพิ่ม feature ใหม่โดยไม่กระทบ existing

---

## สรุปการแก้ไข

| ลำดับ | Task | ไฟล์ | ความเสี่ยง |
|-------|------|------|-----------|
| 1 | Pending count badge บน PortalHome | `PortalHome.tsx` | ต่ำมาก |
| 2.1 | Backend: Leave endpoints | `portal-data/index.ts` | ต่ำ |
| 2.2 | Frontend: Leave section | `MyWorkHistory.tsx` | ต่ำ |

---

## Regression Prevention Checklist

- [ ] ไม่แก้ไข existing queries ใน PortalHome - เพิ่มใหม่เท่านั้น
- [ ] ไม่แก้ไข existing endpoints ใน portal-data - เพิ่มใหม่เท่านั้น
- [ ] ไม่แก้ไข existing pending OT/Day-Off logic - เพิ่ม Leave แยกออกมา
- [ ] ทดสอบว่า existing features ใน MyWorkHistory ทำงานปกติ
- [ ] ทดสอบว่า PortalHome ยังแสดงข้อมูลปกติ

