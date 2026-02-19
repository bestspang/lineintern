
## แผนลบพนักงาน Inactive ออกจาก Leaderboard และล้าง Points

### สถานะปัจจุบัน

- พนักงาน inactive ที่ยังมี points: **Pass** (120 pts, earned: 120, spent: 0)
- ปัจจุบันทั้ง Leaderboard (portal) และ HappyPoints Dashboard (admin) กรองแค่ `exclude_from_points` แต่ **ไม่ได้กรอง `is_active`** ทำให้พนักงานที่ลาออกแล้วยังแสดงอยู่ใน ranking

### สิ่งที่จะทำ

#### 1. Zero out points ของพนักงาน inactive (Data update)

อัปเดต happy_points ของ "Pass" ให้เป็น 0:
- `point_balance` = 0
- `total_earned` = 0  
- `total_spent` = 0
- `current_punctuality_streak` = 0

#### 2. เพิ่ม filter `is_active = true` ใน Leaderboard query (portal-data)

แก้ `supabase/functions/portal-data/index.ts` เพิ่ม `.eq('employee.is_active', true)` ใน leaderboard case

#### 3. เพิ่ม filter `is_active` ใน HappyPoints Dashboard (admin)

แก้ `src/pages/attendance/HappyPoints.tsx` เพิ่มการกรอง `is_active = false` ออกจากทั้ง table และ stats

---

### รายละเอียดทางเทคนิค

| ลำดับ | ไฟล์/Action | การแก้ไข |
|-------|-------------|---------|
| 1 | DB (data update) | Zero out happy_points สำหรับ employee_id ที่ is_active = false |
| 2 | `supabase/functions/portal-data/index.ts` | เพิ่ม `.eq('employee.is_active', true)` ใน leaderboard query |
| 3 | `src/pages/attendance/HappyPoints.tsx` | เพิ่มเงื่อนไข filter `is_active` ในทั้ง query หลักและ stats query |

### Cross-Feature Impact
- ไม่กระทบ feature อื่น เป็นการเพิ่ม filter condition เท่านั้น
- พนักงาน active ทุกคนยังแสดงตามปกติ
- Default behavior ไม่เปลี่ยน (เพิ่ม filter เฉพาะ inactive)
