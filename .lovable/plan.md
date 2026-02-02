
## แผนแก้ไข - Dialog Scroll ไม่ทำงาน

### ปัญหาที่พบ

ใน `AttendanceEditDialog.tsx` บรรทัด 362:

```tsx
<ScrollArea className="flex-1 h-[calc(90vh-180px)] pr-4">
```

**ปัญหา:**
- `flex-1` และ `h-[calc(...)]` ขัดแย้งกัน ทำให้ Radix ScrollArea ไม่สามารถคำนวณ height ได้ถูกต้อง
- `DialogContent` มี `overflow-hidden` ซึ่งตัด content ที่เกินออก
- ScrollArea ต้องการ **fixed height** หรือ **max-height** ที่ชัดเจนเพื่อให้ scroll ทำงาน

---

### การแก้ไข

**บรรทัด 346 - DialogContent:**
```tsx
// จาก
<DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">

// เป็น  
<DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-y-auto">
```

**บรรทัด 362 - ScrollArea:**
```tsx
// จาก
<ScrollArea className="flex-1 h-[calc(90vh-180px)] pr-4">

// เป็น
<ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
```

---

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | บรรทัด | การเปลี่ยนแปลง |
|------|--------|---------------|
| `AttendanceEditDialog.tsx` | 346 | เปลี่ยน `overflow-hidden` เป็น `overflow-y-auto` |
| `AttendanceEditDialog.tsx` | 362 | เปลี่ยน `flex-1 h-[calc...]` เป็น `max-h-[calc(90vh-200px)]` |

---

### ผลลัพธ์

**Before:** Dialog เกินหน้าจอ → scroll ไม่ได้ → เนื้อหาหายไป

**After:** Dialog มี scrollbar → เลื่อนดูเนื้อหาได้ทั้งหมด → สามารถกดปุ่ม "บันทึก" และ "ยกเลิก" ได้
