

## Plan: เพิ่ม Column "สายกี่นาที" + ตั้งค่า Grace Period

### ไฟล์เดียว: `src/components/attendance/PayrollExportDialog.tsx`

**1. เพิ่ม column ใหม่ใน `DAILY_COLUMNS`**
- `{ key: 'late_minutes', label: 'สาย (นาที)', default: true }` — แสดงจำนวนนาทีที่สาย (0 ถ้าไม่สาย, `-` ถ้าไม่มี check_in)

**2. เพิ่ม UI ตั้งค่า "นับสายหลังจากกี่นาที"**
- State: `lateThreshold: number` (default จาก `globalGrace` ที่ดึงจาก `attendance_settings`)
- UI: Input number ขนาดเล็กข้าง sort dropdown — label: "นับสายหลังจาก (นาที)"
- ค่านี้จะใช้แทน `globalGrace` ในการตัดสินว่า status = "สาย" หรือ "ตรงเวลา"
- บันทึกใน localStorage

**3. ปรับ logic ใน `exportDaily`**
- ใช้ `lateThreshold` แทน `globalGrace` ในการเปรียบเทียบ
- คำนวณ `lateMinutes = Math.max(0, Math.round(diffMinutes - 0))` เมื่อสาย (diffMinutes > lateThreshold)
- เพิ่ม `late_minutes` ใน `rowData`

**4. อัปเดต preview** ให้แสดง column ใหม่ได้

### Risk: Low — export-only, ไม่กระทบหน้าอื่น

