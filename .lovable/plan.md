

## แผนแก้ไข: จำกัด Admin LINE Group ให้เห็นเฉพาะ Admin/Owner

### ปัญหาที่พบ

ส่วน **"Admin LINE Group"** ใน `/attendance/settings` แสดงให้ทุก role เห็นและแก้ไขได้ แต่ควรจำกัดให้เฉพาะ **admin** และ **owner** เท่านั้น

### วิธีแก้ไข

**แก้ไขไฟล์:** `src/pages/attendance/Settings.tsx`

1. **Import** `useUserRole` hook
2. **เรียกใช้** `hasFullAccess` จาก hook
3. **Conditional render** Card "Admin LINE Group" เฉพาะเมื่อ `hasFullAccess === true`

```typescript
// เพิ่ม import
import { useUserRole } from '@/hooks/useUserRole';

// ใน component
const { hasFullAccess } = useUserRole();

// Conditional render
{hasFullAccess && (
  <Card>
    {/* Admin LINE Group Configuration */}
    ...
  </Card>
)}
```

---

### รายละเอียดทางเทคนิค

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/pages/attendance/Settings.tsx` | Import hook + wrap Card ด้วย condition |

### ผลลัพธ์

| Role | เห็น Admin LINE Group |
|------|----------------------|
| owner | ✅ เห็น |
| admin | ✅ เห็น |
| hr, manager, field, etc. | ❌ ไม่เห็น |

### หมายเหตุ

- ใช้ `hasFullAccess` จาก `useUserRole` ที่มีอยู่แล้ว
- ไม่กระทบส่วนอื่นของหน้า Settings

