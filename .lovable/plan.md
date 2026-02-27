

## Fix: Employee List Scroll + Select All Checkbox

### Problems
1. **`max-h-36` (144px) is too short** — ไม่สามารถ scroll ดูคนสุดท้ายได้
2. **"เลือกทั้งหมด" เป็นปุ่ม text เล็กๆ** — user ต้องการ checkbox "Select All" ที่ชัดเจนกว่า

### Changes

**File: `src/components/attendance/PayrollExportDialog.tsx`**

1. เพิ่ม `max-h-36` → `max-h-52` (208px) เพื่อให้เห็นคนมากขึ้น
2. เพิ่ม "เลือกทั้งหมด" checkbox row ที่ sticky อยู่บนสุดของ list (sticky top-0, bg-muted/30, border-b)
3. คง "เลือกทั้งหมด" button ข้างบนไว้เหมือนเดิม (ไม่แตะ)

### Risk: Very Low
- UI-only change, ไม่แตะ logic/export/data

