

## Auto-Notification on Approve/Reject — Implementation Plan

### Problem Statement
Notification Center มี table + UI พร้อมแล้ว แต่ยังไม่มีข้อมูลจริง เพราะไม่มี logic ใดที่ insert notifications เมื่อมีการ approve/reject requests

### Approach: Surgical Inserts in Existing Edge Functions + DB Trigger

แนวทางที่ปลอดภัยที่สุดคือ **เพิ่ม notification insert** เข้าไปในจุดที่ approval เกิดขึ้นจริง:

| ประเภท | Approval เกิดที่ไหน | วิธี insert notification |
|--------|---------------------|-------------------------|
| OT | `overtime-approval/index.ts` | เพิ่ม insert หลัง status update สำเร็จ |
| Early Leave | `early-leave-approval/index.ts` | เพิ่ม insert หลัง status update สำเร็จ |
| Day Off | `flexible-day-off-approval/index.ts` | เพิ่ม insert หลัง status update สำเร็จ (bulk support) |
| Remote Checkout | `remote-checkout-approval/index.ts` | เพิ่ม insert หลัง status update สำเร็จ |
| Receipts | Client-side update ใน `ReceiptDetailView.tsx` | **DB Trigger** on `receipts` table เมื่อ `approval_status` เปลี่ยน |

### Implementation Details

#### 1. Edge Function Changes (4 files, ~10-15 lines each)

แต่ละ function จะเพิ่ม block นี้ **หลัง** status update สำเร็จ (ใช้ `supabase` service role client ที่มีอยู่แล้ว):

```typescript
// Insert portal notification (non-blocking)
try {
  await supabase.from('notifications').insert({
    employee_id: employee.id,
    title: action === 'approve' ? '✅ OT อนุมัติแล้ว' : '❌ OT ไม่อนุมัติ',
    body: `คำขอ OT วันที่ ${otRequest.request_date} (${otRequest.estimated_hours} ชม.)`,
    type: 'approval',
    priority: 'normal',
    action_url: '/portal/my-history',
    metadata: { request_type: 'overtime', request_id: body.request_id, action }
  });
} catch (e) {
  console.warn('Failed to create notification', e);
}
```

Key points:
- Wrapped ใน try/catch เพื่อ **ไม่ให้กระทบ flow เดิม** หาก insert ล้มเหลว
- ใช้ service role client (bypass RLS) ซึ่งมีอยู่แล้วในทุก function
- Insert เกิดหลัง approval update สำเร็จ จึงไม่มีผลกระทบหาก notification insert ล้มเหลว

**ไฟล์ที่แก้ (แต่ละไฟล์เพิ่ม ~15 บรรทัด):**
- `supabase/functions/overtime-approval/index.ts` — เพิ่มหลังบรรทัด ~178 (หลัง approval_logs insert)
- `supabase/functions/early-leave-approval/index.ts` — เพิ่มหลังบรรทัด ~229 (หลัง approval_logs insert)
- `supabase/functions/flexible-day-off-approval/index.ts` — เพิ่มหลังบรรทัด ~150 (หลัง approval_logs insert, ใน for loop)
- `supabase/functions/remote-checkout-approval/index.ts` — เพิ่มหลังบรรทัด ~140 (หลัง status update)

#### 2. Receipt Approval — DB Trigger + Function (Migration)

เนื่องจาก receipt approval เกิดจาก client-side update (`ReceiptDetailView.tsx` → direct Supabase `.update()`), วิธีที่ปลอดภัยที่สุดคือ DB trigger:

```sql
CREATE OR REPLACE FUNCTION public.notify_receipt_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employee_id uuid;
  v_title text;
  v_body text;
BEGIN
  -- Only fire when approval_status actually changes to approved/rejected
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status IN ('approved', 'rejected') THEN
    
    -- Look up employee by line_user_id
    SELECT id INTO v_employee_id
    FROM employees
    WHERE line_user_id = NEW.line_user_id
    LIMIT 1;
    
    IF v_employee_id IS NOT NULL THEN
      v_title := CASE NEW.approval_status
        WHEN 'approved' THEN '✅ ใบเสร็จได้รับอนุมัติ'
        ELSE '❌ ใบเสร็จถูกปฏิเสธ'
      END;
      
      v_body := format('ใบเสร็จ %s จำนวน %s บาท',
        COALESCE(NEW.vendor, 'ไม่ระบุร้าน'),
        COALESCE(NEW.total::text, '-'));
      
      INSERT INTO notifications (employee_id, title, body, type, priority, action_url, metadata)
      VALUES (
        v_employee_id,
        v_title,
        v_body,
        'approval',
        'normal',
        '/portal/my-receipts',
        jsonb_build_object('request_type', 'receipt', 'receipt_id', NEW.id, 'action', NEW.approval_status)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_receipt_approval
AFTER UPDATE OF approval_status ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.notify_receipt_approval();
```

#### 3. RLS — No Changes Needed
Notifications table RLS ถูกต้องอยู่แล้ว:
- Admin INSERT: ✅ (via `has_admin_access`)
- Service role bypass RLS: ✅ (edge functions ใช้ service role)
- Trigger ใช้ `SECURITY DEFINER`: ✅ (bypass RLS)

### Files Changed

| File | Change | Lines Added |
|------|--------|-------------|
| `supabase/functions/overtime-approval/index.ts` | เพิ่ม notification insert | ~15 |
| `supabase/functions/early-leave-approval/index.ts` | เพิ่ม notification insert | ~15 |
| `supabase/functions/flexible-day-off-approval/index.ts` | เพิ่ม notification insert (in loop) | ~15 |
| `supabase/functions/remote-checkout-approval/index.ts` | เพิ่ม notification insert (approve + reject) | ~25 |
| `supabase/migrations/...` | Receipt trigger + function | ~40 |

### Files NOT Changed
- PortalHome, Notifications.tsx, PortalLayout — ไม่แตะ (notification rendering ทำงานอยู่แล้ว)
- ReceiptDetailView.tsx — ไม่แตะ (trigger จัดการ)
- AuthContext, PortalContext — ไม่แตะ
- Database tables อื่น — ไม่แตะ

### Risk Assessment: Very Low
- ทุก notification insert อยู่ใน try/catch → หาก fail ไม่กระทบ approval flow
- Receipt trigger ใช้ `IS DISTINCT FROM` → ไม่ fire ซ้ำ
- ไม่มีการเปลี่ยนแปลง flow เดิม ไม่เปลี่ยน response ไม่เปลี่ยน status logic
- Notification ถูก insert ด้วย service role → bypass RLS ไม่มีปัญหา

### Verification
1. Approve OT → ตรวจสอบว่า notification ปรากฏใน bell icon ของพนักงาน
2. Reject Early Leave → notification type "approval" ปรากฏ
3. Approve Day Off (bulk) → notification สร้างให้ทุกคนที่ approve
4. Approve/Reject Remote Checkout → notification ปรากฏ
5. Approve/Reject Receipt (via admin panel) → trigger สร้าง notification
6. เช็คว่า approval flow เดิมยังทำงานปกติ (LINE notification ยังส่ง, status ยังเปลี่ยน)

