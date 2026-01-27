

## แผนการ Implement 4 Features

### ภาพรวมสิ่งที่ต้องทำ

| Feature | ไฟล์ที่ต้องแก้ไข | ความเสี่ยง |
|---------|-----------------|-----------|
| Feature 1: Cancel OT/Day-Off จาก Portal | `MyWorkHistory.tsx`, `portal-data/index.ts` | ต่ำ |
| Feature 2: LINE notification เมื่อ Remote Checkout อนุมัติ/ปฏิเสธ | `remote-checkout-approval/index.ts` | **ไม่ต้องทำ** - มีแล้ว! |
| Feature 3: ประวัติ Remote Checkout ใน My Work History | `MyWorkHistory.tsx`, `portal-data/index.ts` | ต่ำ |
| Feature 4: Leaderboard รวมทั้งหมด | `PointLeaderboard.tsx`, `portal-data/index.ts` | ต่ำ |

---

## การตรวจสอบก่อน Implement

### Feature 2: LINE Notification - **มีอยู่แล้ว ไม่ต้องทำ**

ตรวจสอบ `remote-checkout-approval/index.ts` พบว่า:
- **Approval:** ส่ง LINE push notification (lines 162-186)
- **Rejection:** ส่ง LINE push notification (lines 222-246)

ดังนั้น Feature 2 implement เรียบร้อยแล้ว ไม่ต้องแก้ไข

---

## Feature 1: Cancel OT/Day-Off จาก Portal

### สถานะปัจจุบัน

- `MyWorkHistory.tsx` แสดงเฉพาะ attendance logs (check-in/check-out)
- ไม่มี section แสดง pending OT/Day-Off requests
- ไม่มี cancel button

### Backend (portal-data/index.ts)

**เพิ่ม 3 endpoints ใหม่:**

1. `my-pending-ot-requests` - ดึง pending OT requests ของ employee
2. `my-pending-dayoff-requests` - ดึง pending Day-Off requests ของ employee  
3. `cancel-my-request` - ยกเลิก OT หรือ Day-Off request

```typescript
// Case: my-pending-ot-requests
case 'my-pending-ot-requests': {
  const result = await supabase
    .from('overtime_requests')
    .select('id, request_date, estimated_hours, reason, status, created_at')
    .eq('employee_id', employee_id)
    .eq('status', 'pending')
    .order('request_date', { ascending: true });
  
  data = result.data;
  error = result.error;
  break;
}

// Case: my-pending-dayoff-requests
case 'my-pending-dayoff-requests': {
  const result = await supabase
    .from('flexible_day_off_requests')
    .select('id, day_off_date, reason, status, created_at')
    .eq('employee_id', employee_id)
    .eq('status', 'pending')
    .order('day_off_date', { ascending: true });
  
  data = result.data;
  error = result.error;
  break;
}

// Case: cancel-my-request
case 'cancel-my-request': {
  const { requestId, requestType, reason } = params;
  
  if (!requestId || !requestType) {
    error = { message: 'requestId and requestType are required' };
    break;
  }
  
  const tableName = requestType === 'ot' ? 'overtime_requests' : 'flexible_day_off_requests';
  
  // Verify ownership and pending status
  const { data: existing } = await supabase
    .from(tableName)
    .select('id, employee_id, status')
    .eq('id', requestId)
    .eq('employee_id', employee_id)
    .eq('status', 'pending')
    .maybeSingle();
  
  if (!existing) {
    error = { message: 'Request not found or cannot be cancelled' };
    break;
  }
  
  // Update to cancelled
  const { error: updateError } = await supabase
    .from(tableName)
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

### Frontend (MyWorkHistory.tsx)

**เพิ่ม section "คำขอที่รออนุมัติ":**

- Fetch `my-pending-ot-requests` และ `my-pending-dayoff-requests`
- แสดงรายการ pending requests
- เพิ่มปุ่ม "ยกเลิก" พร้อม confirm dialog
- Call `cancel-my-request` เมื่อกดยืนยัน
- Refresh data หลังยกเลิก

**State เพิ่มเติม:**

```typescript
const [pendingOT, setPendingOT] = useState<PendingOTRequest[]>([]);
const [pendingDayOff, setPendingDayOff] = useState<PendingDayOffRequest[]>([]);
const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
const [cancelTarget, setCancelTarget] = useState<{id: string, type: 'ot'|'dayoff', label: string} | null>(null);
const [cancelling, setCancelling] = useState(false);
```

---

## Feature 3: ประวัติ Remote Checkout

### Backend (portal-data/index.ts)

**เพิ่ม endpoint `my-remote-checkout-requests`:**

```typescript
case 'my-remote-checkout-requests': {
  const limit = params?.limit || 10;
  
  const result = await supabase
    .from('remote_checkout_requests')
    .select(`
      id, request_date, latitude, longitude, distance_from_branch, 
      reason, status, created_at, approved_at, rejection_reason
    `)
    .eq('employee_id', employee_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  data = result.data;
  error = result.error;
  break;
}
```

### Frontend (MyWorkHistory.tsx)

**เพิ่ม section "ประวัติ Remote Checkout":**

- Fetch `my-remote-checkout-requests`
- แสดงรายการ remote checkout พร้อมสถานะ (รอ/อนุมัติ/ปฏิเสธ)
- ใช้ badge สี: pending=yellow, approved=green, rejected=red

---

## Feature 4: Leaderboard รวมทั้งหมด

### สถานะปัจจุบัน

`PointLeaderboard.tsx` ส่ง `branchId` ไปที่ backend เสมอ ทำให้เห็นแค่สาขาตัวเอง

### Backend (portal-data/index.ts)

**แก้ไข endpoint `leaderboard`:**

ปัจจุบันรองรับ `branchId` อยู่แล้ว (line 972-974) - ถ้าไม่ส่ง branchId จะ query ทั้งหมด
ดังนั้นไม่ต้องแก้ backend

### Frontend (PointLeaderboard.tsx)

**เพิ่ม Toggle สลับ Branch/All:**

```typescript
const [viewMode, setViewMode] = useState<'branch' | 'all'>('branch');
```

**แก้ไข fetchLeaderboard:**

```typescript
const fetchLeaderboard = useCallback(async () => {
  // ...
  const { data, error } = await portalApi<LeaderboardApiResponse[]>({
    endpoint: 'leaderboard',
    employee_id: employee.id,
    params: {
      branchId: viewMode === 'branch' ? employee.branch?.id : undefined, // ส่งเฉพาะเมื่อ viewMode = branch
      limit: 20
    }
  });
  // ...
}, [employee?.id, employee?.branch?.id, viewMode]); // เพิ่ม viewMode ใน dependency
```

**เพิ่ม Toggle UI:**

```tsx
<div className="flex items-center gap-2">
  <Button 
    variant={viewMode === 'branch' ? 'default' : 'outline'} 
    size="sm" 
    onClick={() => setViewMode('branch')}
  >
    {locale === 'th' ? 'สาขา' : 'Branch'}
  </Button>
  <Button 
    variant={viewMode === 'all' ? 'default' : 'outline'} 
    size="sm" 
    onClick={() => setViewMode('all')}
  >
    {locale === 'th' ? 'ทั้งหมด' : 'All'}
  </Button>
</div>
```

**อัปเดต Header description:**

```tsx
<p className="text-muted-foreground mt-1">
  {viewMode === 'branch' 
    ? (locale === 'th' ? 'อันดับคะแนนในสาขา' : 'Branch point rankings')
    : (locale === 'th' ? 'อันดับคะแนนทั้งบริษัท' : 'Company-wide rankings')}
</p>
```

---

## สรุปไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|--------------|
| `supabase/functions/portal-data/index.ts` | เพิ่ม 4 endpoints ใหม่: `my-pending-ot-requests`, `my-pending-dayoff-requests`, `cancel-my-request`, `my-remote-checkout-requests` |
| `src/pages/portal/MyWorkHistory.tsx` | เพิ่ม section คำขอที่รออนุมัติ + ปุ่มยกเลิก + ประวัติ Remote Checkout |
| `src/pages/portal/PointLeaderboard.tsx` | เพิ่ม Toggle สลับ Branch/All |

---

## ไฟล์ที่ไม่ต้องแก้ไข

| ไฟล์ | เหตุผล |
|------|--------|
| `remote-checkout-approval/index.ts` | มี LINE notification อยู่แล้ว (lines 162-186, 222-246) |
| `cancel-ot/index.ts` | ใช้เฉพาะ Admin/Owner ไม่ใช่สำหรับ employee self-cancel |
| `cancel-dayoff/index.ts` | รองรับ LINE source อยู่แล้ว แต่เราจะ implement logic ใหม่ใน portal-data เพื่อความง่าย |

---

## Regression Prevention

### Checklist ก่อน Implement

- [ ] ไม่แก้ไข existing endpoints ใน portal-data - เพิ่มใหม่เท่านั้น
- [ ] ไม่แก้ไข attendance log display logic - เพิ่ม section ใหม่แยกออกมา
- [ ] ไม่แก้ไข leaderboard endpoint - แค่ไม่ส่ง branchId เมื่อ viewMode = 'all'
- [ ] ทดสอบว่า existing features ใน MyWorkHistory ทำงานปกติ
- [ ] ทดสอบว่า leaderboard ยังแสดง branch ranking ได้ปกติ

### Technical Notes

1. **Cancel logic ใช้ employee_id verification** - ป้องกัน employee ยกเลิก request ของคนอื่น
2. **ยกเลิกได้เฉพาะ pending** - ไม่สามารถยกเลิก approved/rejected requests
3. **Leaderboard ไม่ส่ง branchId = query ทั้งหมด** - backend รองรับอยู่แล้ว

