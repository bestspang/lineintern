

## แผนแก้ไข - Dialog สไลด์ไม่ได้

### สาเหตุของปัญหา (Root Cause)

**ไฟล์:** `src/components/attendance/AttendanceEditDialog.tsx` บรรทัด 404

```tsx
<DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85dvh] flex flex-col">
```

**ปัญหา:**
1. `DialogContent` base มี `display: grid` (จาก `dialog.tsx` บรรทัด 39)
2. `flex flex-col` override `grid` ไม่สมบูรณ์บน mobile browsers
3. `ScrollArea` ต้องการ parent ที่มี fixed height + `overflow: hidden` ถึงจะ scroll ได้

---

### การแก้ไข

**บรรทัด 404 แก้ DialogContent:**

```tsx
<DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85dvh] !flex !flex-col overflow-hidden">
```

**บรรทัด 425 แก้ ScrollArea:**

```tsx
<ScrollArea className="flex-1 min-h-0 overflow-y-auto -mr-4 pr-4">
```

หรือกำหนด height ให้ ScrollArea โดยตรง:

```tsx
<div className="flex-1 min-h-0 overflow-hidden">
  <ScrollArea className="h-full pr-4">
```

---

### รายละเอียดการแก้ไข

| บรรทัด | ปัจจุบัน | แก้ไขเป็น |
|--------|---------|----------|
| 404 | `flex flex-col` | `!flex !flex-col overflow-hidden` |
| 425 | `className="flex-1 min-h-0 pr-4"` | wrap ด้วย div ที่มี `overflow-hidden` |

**ไฟล์ที่ต้องแก้:** `src/components/attendance/AttendanceEditDialog.tsx`

---

### โค้ดที่แก้ไข

**1. DialogContent (บรรทัด 404):**

```tsx
<DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85dvh] !grid !grid-rows-[auto_1fr_auto] overflow-hidden">
```

**2. Wrap ScrollArea ด้วย div (บรรทัด 420-425):**

```tsx
{isLoading ? (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
) : (
  <div className="min-h-0 overflow-hidden">
    <ScrollArea className="h-full max-h-[calc(85dvh-180px)] pr-4">
      {/* ... existing content ... */}
    </ScrollArea>
  </div>
)}
```

---

### ผลลัพธ์ที่คาดหวัง

**Before:** 
- Dialog ไม่สามารถ scroll ได้ เนื้อหาด้านล่างถูก cut off

**After:** 
- Dialog scroll ได้ปกติทั้งบน desktop และ mobile
- Header และ Footer คงที่ เฉพาะเนื้อหาตรงกลาง scroll ได้

