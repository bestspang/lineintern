

## เพิ่ม Data Sources ให้ครบในระบบ AI Cross-Group Query

### สถานะปัจจุบัน

ตอนนี้ `ALL_DATA_SOURCES` มีแค่ 4 ตัว: `messages`, `attendance`, `employees`, `tasks`
และ backend จริง ๆ ดึงข้อมูลได้แค่ 3 ตัว: messages, attendance, employees (tasks ยังไม่มี retrieval logic)

### สิ่งที่จะเพิ่ม

เพิ่ม data sources ใหม่ 4 ตัว รวมเป็น 8 ตัว:

| Data Source | คำอธิบาย | ตาราง DB |
|---|---|---|
| messages | ข้อความในกลุ่ม | messages |
| attendance | เวลาเข้า-ออกงาน | attendance_logs |
| employees | ข้อมูลพนักงาน | employees |
| tasks | งานที่มอบหมาย | tasks |
| points | คะแนน Happy Points | happy_points, point_transactions |
| birthdays | วันเกิดพนักงาน | employees.date_of_birth |
| rewards | รางวัลและ redemption | reward_items, point_redemptions |
| leave | วันลา/วันหยุด | leave_requests, leave_balances |

### ไฟล์ที่แก้ไข

| File | Change |
|---|---|
| `src/pages/settings/AIQueryControl.tsx` | เพิ่ม data sources ใน `ALL_DATA_SOURCES` + label ภาษาไทย |
| `supabase/functions/line-webhook/utils/cross-group-query.ts` | เพิ่ม retrieval logic สำหรับ points, birthdays, rewards, leave, tasks + เพิ่ม prompt section |
| `supabase/functions/ai-query-test/index.ts` | เพิ่ม retrieval logic เดียวกันใน test console |

### รายละเอียดทางเทคนิค

**1. Frontend (`AIQueryControl.tsx`)**

เปลี่ยน `ALL_DATA_SOURCES` จาก array เป็น object ที่มี label:

```typescript
const ALL_DATA_SOURCES = [
  { key: 'messages', label: 'ข้อความ / Messages' },
  { key: 'attendance', label: 'เวลาเข้า-ออก / Attendance' },
  { key: 'employees', label: 'ข้อมูลพนักงาน / Employees' },
  { key: 'tasks', label: 'งานที่มอบหมาย / Tasks' },
  { key: 'points', label: 'คะแนน / Points' },
  { key: 'birthdays', label: 'วันเกิด / Birthdays' },
  { key: 'rewards', label: 'รางวัล / Rewards' },
  { key: 'leave', label: 'วันลา / Leave' },
];
```

**2. Backend retrieval (`cross-group-query.ts`)**

เพิ่ม section ใน `retrieveCrossGroupEvidence()`:

- **points**: ดึง `happy_points` (point_balance, streak) + `point_transactions` ล่าสุดของพนักงานใน branch ที่ match
- **birthdays**: ดึง `employees.date_of_birth` ที่ไม่เป็น null ใน branch ที่ match
- **rewards**: ดึง `reward_items` (active) + `point_redemptions` ล่าสุด
- **leave**: ดึง `leave_requests` ในช่วงเวลาที่กำหนด + `leave_balances`
- **tasks**: ดึง `tasks` ที่ `group_id` ตรงกับ target groups

เพิ่ม section ใน `buildCrossGroupPrompt()` สำหรับแต่ละ data source ใหม่

**3. Evidence type expansion**

เพิ่ม fields ใน `CrossGroupEvidence`:

```typescript
interface CrossGroupEvidence {
  messages: any[];
  attendance: any[];
  employees: any[];
  sources: any[];
  points?: any[];      // NEW
  birthdays?: any[];   // NEW
  rewards?: any[];     // NEW
  leave?: any[];       // NEW
  tasks?: any[];       // NEW
}
```

### สิ่งที่จะไม่แตะ

- ไม่แก้ DB schema (ใช้ตารางที่มีอยู่แล้ว)
- ไม่แก้ RLS policies
- ไม่แก้ tab อื่นใน AI Query Control (Access Rules, Access Matrix, etc.)
- ไม่แก้ logic เดิมของ messages, attendance, employees

### Smoke Test

1. เปิด Settings > AI Cross-Group > Access Rules > Edit rule
2. ดู "Accessible Data Sources" ต้องเห็น 8 ตัวเลือกพร้อม label ภาษาไทย
3. เปิด Export Policy > Edit group > ดู data sources ต้องเห็น 8 ตัวเลือกเช่นกัน
4. ใช้ Test Console ถามเกี่ยวกับคะแนน/วันเกิด ต้องได้คำตอบจากข้อมูลจริง
5. Access Matrix ต้องแสดง data sources ใหม่ได้ถูกต้อง

