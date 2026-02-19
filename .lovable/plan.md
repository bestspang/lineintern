

## แก้ Leaderboard ไม่แสดงข้อมูล

### Root Cause

Edge function `portal-data` leaderboard query เลือก column `nickname` จาก employees table แต่ column นี้ **ไม่มีอยู่จริง** ทำให้ query error 500:

```
column employees_1.nickname does not exist
```

### สิ่งที่จะทำ

**แก้ไฟล์เดียว**: `supabase/functions/portal-data/index.ts`

ลบ `nickname` ออกจาก select ใน leaderboard case (บรรทัด ~963):

```
Before:
  employee:employees!inner(
    id,
    full_name,
    nickname,      <-- ไม่มี column นี้
    branch_id,
    exclude_from_points
  )

After:
  employee:employees!inner(
    id,
    full_name,
    branch_id,
    exclude_from_points
  )
```

แก้ไขเฉพาะจุดนี้จุดเดียว ไม่กระทบ feature อื่น

### ตรวจสอบ PointLeaderboard.tsx

Frontend ใช้ `item.employee?.full_name` เป็นหลัก และมี fallback `item.employee?.nickname` แต่จะไม่ error เพราะแค่ได้ undefined — แค่ลบ `nickname` จาก edge function ก็พอ
