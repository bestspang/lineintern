

## ✅ เสร็จแล้ว: จำกัด Admin LINE Group ให้เห็นเฉพาะ Admin/Owner

### การเปลี่ยนแปลงที่ทำ

**ไฟล์:** `src/pages/attendance/Settings.tsx`

1. ✅ Import `useUserRole` hook
2. ✅ เรียกใช้ `hasFullAccess` จาก hook ที่ top level
3. ✅ Wrap Card "Admin LINE Group" ด้วย `{hasFullAccess && ...}`

### ผลลัพธ์

| Role | เห็น Admin LINE Group |
|------|----------------------|
| owner | ✅ เห็น |
| admin | ✅ เห็น |
| hr, manager, field, etc. | ❌ ไม่เห็น |
