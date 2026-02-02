

## แผนแก้ไข - AttendanceEditDialog ไม่สามารถบันทึกได้

### ปัญหาที่พบ

| ปัญหา | สาเหตุ |
|-------|--------|
| กดปุ่มบันทึกไม่ได้ | ช่อง "เหตุผลในการแก้ไข" (required) อยู่ด้านล่างสุดและถูกซ่อน → user กรอกไม่ได้ → ปุ่มยังคง disabled |
| ช่องเวลาเข้า-ออกหายไป | ScrollArea ไม่ทำงานถูกต้อง → content ถูกตัดออก |
| เปิด "อนุญาตเข้าสาย" แล้วช่องเวลาหาย | เหตุผลเดียวกัน - content overflow ถูกซ่อน |

### Root Cause

บรรทัด 362 และ 346 ของ `AttendanceEditDialog.tsx`:

```tsx
// บรรทัด 346 - DialogContent overflow setting
<DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-y-auto">

// บรรทัด 362 - ScrollArea ไม่มี explicit height ที่ชัดเจน
<ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
```

**ปัญหา:**
1. `DialogContent` มี `overflow-y-auto` แต่ `ScrollArea` ข้างในก็มี scroll อีก → เกิด nested scroll ที่ทำให้ height calculation ผิดพลาด
2. `ScrollArea` ต้องการ **explicit height** ไม่ใช่แค่ `max-height` เพื่อให้ scroll bar แสดงถูกต้อง

### การแก้ไข

**บรรทัด 346 - DialogContent:**
```tsx
// เปลี่ยนเป็น
<DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
```
(ลบ `overflow-y-auto` ออก ให้ ScrollArea จัดการ scroll เอง)

**บรรทัด 362 - ScrollArea:**
```tsx
// เปลี่ยนเป็น
<ScrollArea className="flex-1 min-h-0 pr-4">
```
(`flex-1 min-h-0` จะทำให้ ScrollArea เติมพื้นที่ว่างและมี height ที่ชัดเจนสำหรับ scrolling)

---

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | บรรทัด | การเปลี่ยนแปลง |
|------|--------|---------------|
| `AttendanceEditDialog.tsx` | 346 | ลบ `overflow-y-auto` ออกจาก DialogContent |
| `AttendanceEditDialog.tsx` | 362 | เปลี่ยน `max-h-[calc(90vh-200px)]` เป็น `flex-1 min-h-0` |

---

### ผลลัพธ์ที่คาดหวัง

**Before:** 
- Dialog content ถูกตัด → ช่อง reason และ input เวลาไม่แสดง → บันทึกไม่ได้

**After:** 
- ScrollArea ทำงานถูกต้อง → เลื่อนดูได้ทั้งหมด → เห็นช่อง "เหตุผลในการแก้ไข" → กรอกได้ → บันทึกได้

