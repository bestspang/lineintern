

## แผนการปรับปรุงระบบ Attendance Requests (ฉบับตรวจสอบแล้ว)

### สรุปการตรวจสอบระบบปัจจุบัน

#### 1. สถานะของ ntp.冬至 และ Noey
- **เมื่อวาน (2026-01-26):** ทั้งสองคน check-in และ check-out ปกติ ไม่ต้องใช้ auto-checkout
  - ntp.冬至: check-in 08:58, check-out 18:38 (รวม ~9.7 ชม., net_work_minutes: 520)
  - Noey: check-in 08:46, check-out 18:38 (รวม ~9.9 ชม., net_work_minutes: 532)
- **วันนี้ (2026-01-27):** ทั้งสองคน check-in ไปแล้ว, ยังอยู่ในสถานะ active (ซึ่งเป็นปกติ)
- **ไม่มีปัญหา auto-checkout** - ระบบทำงานปกติ

#### 2. ระบบ Early Leave Requests ปัจจุบัน
- **มีอยู่แล้ว** ใน `early-checkout-request/index.ts`
- ทำงานสำหรับ `hours_based` employees เท่านั้น (block checkout ถ้าไม่ครบชั่วโมง)
- **ปัญหา:** `time_based` employees ไม่ถูก enforce - สามารถ checkout ก่อน shift_end_time ได้โดยไม่ต้องขออนุมัติ

#### 3. ระบบ Remote Checkout
- **ไม่มี** - ปัจจุบันถ้าอยู่นอก geofence จะถูก block ทันที (return 403)
- พนักงานที่มี `allow_remote_checkin = true` จะ bypass ได้
- ไม่มีระบบขออนุมัติสำหรับ checkout นอกสถานที่

#### 4. ระบบ OT Requests
- **มีและทำงานปกติ** ใน `overtime-request/index.ts`
- มีการตรวจสอบ conflict กับ early leave requests
- หน้าอนุมัติใน Portal มีอยู่แล้ว (`ApproveOT.tsx`)

#### 5. หน้า Portal Approvals
- **มีอยู่แล้ว** แยกเป็น tabs: OT, Leave, Early Leave, Redemptions, Deposits
- ใช้ `portal-data/index.ts` เป็น backend

---

### การเปลี่ยนแปลงที่จำเป็น (Step-by-Step)

---

### Step 1: เพิ่ม Early Leave Check สำหรับ time_based employees

**ปัญหาที่แก้:** time_based employees สามารถ checkout ก่อน shift_end_time ได้โดยไม่ต้องขออนุมัติ

**ไฟล์:** `supabase/functions/attendance-submit/index.ts`

**ตำแหน่งที่แก้:** หลัง minimum hours check สำหรับ hours_based (~line 654-704)

**Logic ใหม่:**
```text
IF token.type === 'check_out'
   AND employee.working_time_type === 'time_based'
   AND current_bangkok_time < shift_end_time - 15min grace
   AND NO approved early_leave_request for today
THEN
   Return error: "กรุณาขออนุมัติออกก่อนเวลา"
```

**ความเสี่ยง:** ต่ำ - เพิ่ม logic ใหม่ ไม่แก้ไข logic เดิมที่ทำงานดีอยู่

---

### Step 2: เพิ่มระบบ Remote Checkout Request

**ปัญหาที่แก้:** พนักงานนอก geofence ถูก block ทันที ไม่มีทางขออนุมัติ

#### 2.1 สร้างตาราง `remote_checkout_requests`

```sql
CREATE TABLE remote_checkout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  request_date DATE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  distance_from_branch DOUBLE PRECISION,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by_employee_id UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  checkin_log_id UUID REFERENCES attendance_logs(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.2 แก้ไข geofence logic ใน attendance-submit

**ตำแหน่ง:** ~line 521-559

**Before:** Block ทันที (return 403)
```typescript
return new Response(
  JSON.stringify({ 
    success: false, 
    error: `🚫 คุณอยู่นอกพื้นที่ที่กำหนด...`
  }),
  { status: 403, ... }
);
```

**After:** ส่ง error พร้อมข้อมูลให้ frontend prompt ขอ approval
```typescript
return new Response(
  JSON.stringify({ 
    success: false, 
    error: `🚫 คุณอยู่นอกพื้นที่ที่กำหนด...`,
    code: 'OUTSIDE_GEOFENCE',
    requires_remote_approval: true,
    distance: Math.round(distance),
    allowed_radius: allowedRadius,
    branch_name: token.employee.branch.name,
    latitude: latitude,
    longitude: longitude
  }),
  { status: 403, ... }
);
```

#### 2.3 สร้าง Edge Function `remote-checkout-request/index.ts`

**หน้าที่:** รับคำขอ checkout นอกสถานที่จาก frontend

#### 2.4 สร้าง Edge Function `remote-checkout-approval/index.ts`

**หน้าที่:** Admin/Manager อนุมัติ/ปฏิเสธ และ trigger checkout อัตโนมัติ

---

### Step 3: เพิ่ม Remote Checkout ใน Portal Approvals

**ไฟล์ที่แก้ไข:**

| ไฟล์ | การเปลี่ยนแปลง |
|------|--------------|
| `src/pages/portal/Approvals.tsx` | เพิ่ม card สำหรับ Remote Checkout |
| `src/pages/portal/ApproveRemoteCheckout.tsx` | หน้าใหม่สำหรับอนุมัติ |
| `supabase/functions/portal-data/index.ts` | เพิ่ม endpoints: approval-counts, pending-remote-checkout, approve-remote-checkout |

**UI ใหม่ใน Approvals.tsx:**
```text
┌────────────────────────────────────────┐
│ ✅ อนุมัติคำขอ                          │
├────────────────────────────────────────┤
│ [OT Requests] [12]                     │
│ [Leave Requests] [3]                   │
│ [Early Leave] [5]                      │
│ [Remote Checkout] [2] ← NEW            │
│ [Redemptions] [0] (admin only)         │
│ [Deposits] [8]                         │
└────────────────────────────────────────┘
```

---

### Step 4: อัปเดต Routes

**ไฟล์:** `src/App.tsx`

**เพิ่ม:**
```tsx
<Route path="approvals/remote-checkout" element={<ApproveRemoteCheckout />} />
```

---

### รายละเอียดทางเทคนิค

#### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|--------------|
| `attendance-submit/index.ts` | เพิ่ม early leave check สำหรับ time_based (~20 lines) |
| `attendance-submit/index.ts` | แก้ไข geofence error response (~10 lines) |
| `portal-data/index.ts` | เพิ่ม 3 endpoints สำหรับ remote checkout |
| `src/pages/portal/Approvals.tsx` | เพิ่ม Remote Checkout card |

#### ไฟล์ใหม่ที่ต้องสร้าง

| ไฟล์ | รายละเอียด |
|------|-----------|
| `remote-checkout-request/index.ts` | สร้างคำขอ remote checkout |
| `remote-checkout-approval/index.ts` | อนุมัติ/ปฏิเสธ remote checkout |
| `src/pages/portal/ApproveRemoteCheckout.tsx` | หน้าอนุมัติใน Portal |

#### Database Migration

```sql
-- 1. สร้างตาราง remote_checkout_requests
CREATE TABLE remote_checkout_requests (...);

-- 2. เพิ่ม RLS policies
ALTER TABLE remote_checkout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "..." ON remote_checkout_requests ...;

-- 3. เพิ่ม indexes
CREATE INDEX idx_remote_checkout_employee_date ON remote_checkout_requests(employee_id, request_date);
CREATE INDEX idx_remote_checkout_status ON remote_checkout_requests(status);
```

---

### สิ่งที่ไม่ต้องแก้ไข (ทำงานดีอยู่แล้ว)

| Feature | สถานะ |
|---------|-------|
| Auto-checkout midnight cron | ทำงานปกติ (cron job id: 38) |
| OT Request/Approval | ทำงานปกติ |
| Early Leave Request (hours_based) | ทำงานปกติ |
| Portal Approvals หน้าหลัก | มีอยู่แล้ว แค่เพิ่ม item |
| ntp.冬至 ทำงาน 8 ชม. | ยืนยันว่าทำครบแล้ว |

---

### Flow Diagram

```text
พนักงานกด Checkout
       │
       ▼
┌──────────────────┐
│ เช็ค geofence    │
└────────┬─────────┘
         │
    ┌────┴────┐
    │ อยู่ใน  │
    │ พื้นที่? │
    └────┬────┘
     Yes │  No
     │   ▼
     │  ┌─────────────────────┐
     │  │ Return error code:  │
     │  │ OUTSIDE_GEOFENCE    │
     │  │ + requires_remote_  │
     │  │   approval: true    │
     │  └──────────┬──────────┘
     │             │
     │             ▼
     │       [Frontend shows dialog]
     │       "ส่งคำขอ checkout นอกสถานที่?"
     │             │
     │             ▼
     │       remote-checkout-request
     │             │
     │             ▼
     │       แจ้ง Admin/Manager
     │             │
     │             ▼
     │       [Admin อนุมัติใน Portal]
     │             │
     │             ▼
     │       remote-checkout-approval
     │             │
     │             ▼
     │       Auto checkout ให้พนักงาน
     │
     ▼
┌──────────────────┐
│ เช็คเวลา         │
│ (time_based)     │
└────────┬─────────┘
         │
    ┌────┴────┐
    │ ก่อน    │
    │ shift   │
    │ end -   │
    │ 15min?  │
    └────┬────┘
     Yes │  No
     │   │
     ▼   ▼
  ต้องมี  Checkout
  early   สำเร็จ
  leave
  approved
     │
     ▼
  Checkout
  สำเร็จ
```

---

### ลำดับการ Implement

1. **Database Migration** - สร้างตาราง `remote_checkout_requests`
2. **attendance-submit/index.ts** - เพิ่ม early leave check สำหรับ time_based
3. **attendance-submit/index.ts** - แก้ไข geofence error response
4. **remote-checkout-request/index.ts** - สร้าง edge function
5. **remote-checkout-approval/index.ts** - สร้าง edge function
6. **portal-data/index.ts** - เพิ่ม endpoints
7. **ApproveRemoteCheckout.tsx** - สร้างหน้าใหม่
8. **Approvals.tsx** - เพิ่ม card
9. **App.tsx** - เพิ่ม route

---

### ความเสี่ยง

| ความเสี่ยง | ระดับ | การลดความเสี่ยง |
|-----------|-------|----------------|
| กระทบ checkout เดิมของ hours_based | ต่ำมาก | ไม่แก้ไข logic ส่วนนี้เลย |
| กระทบ checkout เดิมของ time_based ที่ตรงเวลา | ไม่มี | Check เฉพาะก่อน shift_end - grace |
| Remote checkout ถูกใช้มากเกินไป | ต่ำ | ต้องมี approval + audit trail |
| Auto-checkout ไม่ทำงาน | ไม่มี | ยืนยันแล้วว่าทำงานปกติ |

---

### ผลลัพธ์ที่คาดหวัง

| Before | After |
|--------|-------|
| time_based checkout ก่อนเวลาได้เลย | ต้องมี early leave approved |
| นอก geofence ถูก block ทันที | สามารถขออนุมัติได้ |
| Admin/Manager ดูคำขอใน Portal | เพิ่ม Remote Checkout ใน Approvals |

