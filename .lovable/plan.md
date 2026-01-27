

## แผนแก้ไข Live Tracking และ Manual Checkout

### ปัญหาที่พบ

#### 1. Live Tracking ไม่แสดงข้อมูลพนักงาน
**สาเหตุ:** Query ใน `LiveTracking.tsx` line 137 ใช้:
```typescript
branch:branches (name)
```

แต่ตาราง `employees` มี **2 Foreign Keys** ไปหา `branches`:
- `branch_id` → `branches` (employees_branch_id_fkey)
- `primary_branch_id` → `branches` (employees_primary_branch_id_fkey)

ทำให้ Supabase return **error PGRST201**: "Could not embed because more than one relationship was found"

#### 2. ไฟล์อื่นที่มีปัญหาเดียวกัน
Query จาก `attendance_logs` ที่ nested ไปยัง `employees.branches` ก็เจอปัญหาเดียวกัน:
- `src/pages/attendance/Photos.tsx` (line 70)
- `src/pages/attendance/Analytics.tsx` (line 245)
- `src/pages/portal/PortalEmployees.tsx` (line 40)
- `src/pages/portal/PortalEmployeeDetail.tsx` (line 48)
- และไฟล์อื่นๆ

#### 3. ntp.冬至 และ Noey ยังค้างใน system
มี work_sessions status = 'active' สำหรับวันที่ 27 ม.ค.:
- Noey: check-in 08:56
- ntp.冬至: check-in 09:03

---

### Step 1: แก้ไข LiveTracking.tsx

**ไฟล์:** `src/pages/attendance/LiveTracking.tsx`

**ตำแหน่ง:** Line 137

**เปลี่ยนจาก:**
```typescript
branch:branches (
  name
)
```

**เป็น:**
```typescript
branch:branches!employees_branch_id_fkey (
  name
)
```

---

### Step 2: แก้ไขไฟล์อื่นที่มีปัญหา FK Ambiguity

| ไฟล์ | บรรทัด | เปลี่ยนจาก | เป็น |
|------|--------|-----------|------|
| Photos.tsx | 70 | `branch:branches(id, name)` | `branch:branches!attendance_logs_branch_id_fkey(id, name)` |
| Analytics.tsx | 245 | `branch:branches(id, name, ...)` | `branch:branches!attendance_logs_branch_id_fkey(id, name, ...)` |
| PortalEmployees.tsx | 40 | `branch:branches(id, name)` | `branch:branches!employees_branch_id_fkey(id, name)` |
| PortalEmployeeDetail.tsx | 48 | `branch:branches(name)` | `branch:branches!employees_branch_id_fkey(name)` |
| OvertimeSummary.tsx | 73 | `branch:branches(id, name)` | `branch:branches!attendance_logs_branch_id_fkey(id, name)` |
| DepositReviewList.tsx | 47 | `branch:branches(id, name)` | `branch:branches!daily_deposits_branch_id_fkey(id, name)` |

---

### Step 3: Insert Manual Checkout สำหรับ ntp.冬至 และ Noey

ต้อง:
1. Insert `attendance_logs` record สำหรับ check_out
2. Update `work_sessions` status เป็น 'closed'

**Employee IDs:**
- Noey: `a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af`
- ntp.冬至: `0a9c61de-8482-49ac-8586-e7878a740812`

**Work Session IDs:**
- Noey: `a2554ce5-952f-46b9-874d-d8f9bd482e1b`
- ntp.冬至: `ee4e5e4b-625c-4f3f-abca-0e7062af4204`

**SQL ที่จะรันผ่าน migration:**
```sql
-- Insert checkout logs สำหรับวันที่ 27 ม.ค.
INSERT INTO attendance_logs (employee_id, branch_id, event_type, server_time, device_time, timezone, source, admin_notes)
VALUES 
  ('a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af', '4defa047-4387-439b-8b7e-67921b0b01ea', 'check_out', '2026-01-27T23:30:00+07:00', '2026-01-27T23:30:00+07:00', 'Asia/Bangkok', 'admin_manual', 'Manual checkout by admin - auto-checkout bug fix'),
  ('0a9c61de-8482-49ac-8586-e7878a740812', '4defa047-4387-439b-8b7e-67921b0b01ea', 'check_out', '2026-01-27T23:30:00+07:00', '2026-01-27T23:30:00+07:00', 'Asia/Bangkok', 'admin_manual', 'Manual checkout by admin - auto-checkout bug fix');

-- Update work sessions status
UPDATE work_sessions 
SET status = 'closed', 
    actual_end_time = '2026-01-27T23:30:00+07:00',
    close_source = 'admin_manual',
    net_work_minutes = EXTRACT(EPOCH FROM ('2026-01-27T23:30:00+07:00'::timestamptz - actual_start_time)) / 60
WHERE id IN ('a2554ce5-952f-46b9-874d-d8f9bd482e1b', 'ee4e5e4b-625c-4f3f-abca-0e7062af4204');
```

---

### ลำดับการดำเนินการ

1. **แก้ไข LiveTracking.tsx** - เปลี่ยน FK reference (line 137)
2. **แก้ไขไฟล์อื่นๆ** - Photos.tsx, Analytics.tsx, PortalEmployees.tsx, etc.
3. **Run migration** - Insert manual checkout logs และ close work_sessions

---

### ความเสี่ยง

| ความเสี่ยง | ระดับ | การลดความเสี่ยง |
|-----------|-------|----------------|
| แก้ FK reference ผิด | ต่ำมาก | ระบุ FK name ตรงจาก database schema |
| กระทบ query อื่น | ไม่มี | เปลี่ยนเฉพาะ FK hint ไม่เปลี่ยน logic |
| ข้อมูล checkout ผิด | ต่ำ | ใช้เวลา 23:30 ของวันที่ 27 ม.ค. |

---

### ผลลัพธ์ที่คาดหวัง

| Before | After |
|--------|-------|
| Live Tracking แสดงตารางว่าง | แสดงรายชื่อพนักงานครบ |
| Photos, Analytics มี error | แสดงข้อมูลปกติ |
| ntp.冬至 และ Noey ค้าง active | status = closed, checkout 23:30 |

