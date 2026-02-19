

## Fix: Edit Reward Dialog ไม่สามารถ Scroll ได้

### ปัญหา
DialogContent ใน Rewards.tsx ไม่มี scroll handling ทำให้เมื่อ form มีเนื้อหาเยอะ (Name, Description, Category, Icon, Stock, Use Mode, Switches) จะล้นหน้าจอและ scroll ไม่ได้

### สาเหตุ
- `DialogContent` ใช้แค่ `className="max-w-lg"` ไม่มี overflow/grid layout
- Form content ยาวเกินหน้าจอ โดยเฉพาะบนมือถือ

### วิธีแก้ (ตาม pattern ที่ใช้อยู่ในโปรเจค)
ใช้ pattern เดียวกับ AttendanceEditDialog:

1. เพิ่ม `!grid !grid-rows-[auto_1fr_auto] overflow-hidden max-h-[85vh]` บน `DialogContent`
2. ครอบ form content ด้วย `ScrollArea` ใน wrapper `flex-1 min-h-0`
3. แยก Submit button ออกมาอยู่ข้างนอก ScrollArea (fixed footer)

### ไฟล์ที่แก้
- `src/pages/attendance/Rewards.tsx` (1 ไฟล์)

### ความเสี่ยง
- ต่ำมาก: แก้เฉพาะ layout ของ dialog ไม่แตะ logic ใดๆ
