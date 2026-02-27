

## Plan: เพิ่ม Column พิเศษ + Sorting ใน Payroll Export

### ปัญหาปัจจุบัน
1. **สถานะ (status)** ในโหมดรายวัน แสดงแค่ "มา / ขาด / วันหยุด" — ไม่มี ก่อนเวลา, ตรงเวลา, สาย, ลา
2. **ไม่มีคอลัมน์ "ชม.ทำงานจริง (capped)"** ที่ cap max 8 ชม. + OT approved
3. **ไม่มีตัวเลือกเรียงลำดับ** (sort by รหัส / ชื่อ / วันที่)

### สิ่งที่จะแก้ (ไฟล์เดียว: `PayrollExportDialog.tsx`)

**1. ปรับ status logic ใน `exportDaily`**
- ดึง `shift_start_time`, `work_schedules`, `attendance_adjustments` เพิ่ม เพื่อคำนวณสถานะถูกต้อง
- Mapping สถานะ:
  - **ก่อนเวลา** — check_in ก่อน shift_start
  - **ตรงเวลา** — check_in ตรงหรือภายใน grace period
  - **สาย** — check_in หลัง grace period
  - **ขาด** — ไม่มี check_in (วันทำงาน)
  - **ลา** — มี adjustment override เป็น leave/vacation/sick/personal
  - **วันหยุด** — เสาร์-อาทิตย์ / holiday (ไม่มี check_in)
  - **OT** — check_in วันหยุดที่มี flag OT

**2. เพิ่ม column ใหม่ใน `DAILY_COLUMNS`**
- `{ key: 'capped_hours', label: 'ชม.จริง (cap)', default: true }` — net hours capped at max_work_hours_per_day (default 8) + approved OT hours
- `{ key: 'ot_approved_hours', label: 'OT อนุมัติ (ชม.)', default: false }` — ชม. OT ที่ได้รับอนุมัติ

**3. เพิ่ม Sort selector**
- State: `sortBy: 'code' | 'name' | 'date'` (default: `'code'`)
- UI: dropdown ใต้ branch filter หรือข้าง mode tabs
- ใช้กับทั้ง summary (sort by code/name) และ daily (sort by code/name/date)
- Apply sorting ก่อน generate rows ทั้ง CSV/XLSX
- บันทึก preference ใน localStorage

**4. ดึงข้อมูลเพิ่มใน `exportDaily`**
- Query `employees` เพิ่ม fields: `shift_start_time`, `max_work_hours_per_day`, `break_hours`
- Query `work_schedules` สำหรับ branch ที่เลือก (เพื่อรู้ start_time ของแต่ละวัน)
- Query `attendance_adjustments` ในช่วงวันที่เลือก (เพื่อรู้ override status เช่น ลา)
- Query `overtime_requests` ที่ approved (เพื่อคำนวณ capped hours + OT)

### Data flow ตอน export daily

```text
1. Fetch: attendance_logs + work_schedules + adjustments + OT requests
2. For each employee × each day:
   a. Check adjustment override → ลา/วันหยุด/etc
   b. Check check_in vs shift_start → ก่อนเวลา/ตรงเวลา/สาย
   c. Calc raw hours → net (- break) → capped (min of net, max_hours + OT)
3. Sort rows by user preference
4. Generate CSV/XLSX
```

### Risk
- **Low** — export-only logic, ไม่กระทบหน้าอื่น
- ดึง query เพิ่มเฉพาะตอน export (ไม่ load ตอน dialog เปิด)
- ไม่แตะ logic ของ summary mode (ยกเว้น sorting)

| Change | Detail |
|--------|--------|
| `DAILY_COLUMNS` | เพิ่ม `capped_hours`, `ot_approved_hours` |
| `exportDaily()` | ดึง schedules/adjustments/OT, คำนวณ status ละเอียด, คำนวณ capped hours |
| Sort UI | เพิ่ม dropdown + state + apply ก่อน export |
| Preview | อัปเดต preview ให้แสดง status ใหม่ |
| localStorage | เพิ่ม `sortBy` ใน prefs |

