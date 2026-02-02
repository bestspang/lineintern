

## แผนดำเนินการ - แก้ไข Points Noey + ส่งประกาศ + Feature ป้องกันอนาคต

### ส่วนที่ 1: Database Migration - แก้ไขคะแนน Noey

```sql
-- 1. เพิ่ม Attendance Adjustment สำหรับวันที่ 30 ม.ค.
INSERT INTO attendance_adjustments (
  employee_id,
  adjustment_date,
  override_status,
  reason,
  adjusted_by_user_id
) VALUES (
  'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af',
  '2026-01-30',
  'on_time',
  'Owner approved late start - ทำงานกะพิเศษถึงเที่ยงคืน',
  (SELECT id FROM auth.users LIMIT 1)
);

-- 2. เพิ่ม Punctuality Bonus ย้อนหลัง
INSERT INTO point_transactions (
  employee_id,
  transaction_type,
  category,
  amount,
  description,
  metadata
) VALUES (
  'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af',
  'bonus',
  'attendance',
  10,
  '🕐 Punctuality bonus - 30 ม.ค. 69',
  '{"reference_date": "2026-01-30", "manual_adjustment": true}'
);

-- 3. เพิ่ม Streak Bonus 15 วัน
INSERT INTO point_transactions (
  employee_id,
  transaction_type,
  category,
  amount,
  description,
  metadata
) VALUES (
  'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af',
  'bonus',
  'streak',
  50,
  '🔥 มาเช้าต่อเนื่อง 15 วัน! (30 ม.ค.)',
  '{"streak_days": 15, "manual_adjustment": true, "original_date": "2026-01-30"}'
);

-- 4. อัพเดท happy_points
UPDATE happy_points
SET 
  point_balance = point_balance + 60,
  total_earned = total_earned + 60,
  current_punctuality_streak = 4,
  longest_punctuality_streak = GREATEST(longest_punctuality_streak, 15),
  updated_at = NOW()
WHERE employee_id = 'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af';
```

---

### ส่วนที่ 2: ส่งประกาศ LINE (ตามที่ user ระบุ)

**สร้าง Broadcast Entry:**

| Field | Value |
|-------|-------|
| title | สรุป Points - Noey |
| message_type | text |
| content | `📢 สรุป Points\n\n👤 Noey\n📅 วันที่ 30 ม.ค. 2569\n\n✅ น่ารักที่สุด!!!! \n✅ มาเช้าต่อเนื่องเป๊ะๆครบ 15 วัน เอาไปเลย +50 คะแนน\n` |
| status | scheduled |
| recipients | Group: Glowfish Office |

---

### ส่วนที่ 3: Feature "Approved Late Start"

#### 3.1 Database Schema Change

```sql
ALTER TABLE shift_assignments
ADD COLUMN IF NOT EXISTS approved_late_start BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_late_reason TEXT,
ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES auth.users(id);
```

#### 3.2 Edge Functions Updates

| File | Changes |
|------|---------|
| `point-attendance-calculator/index.ts` | Check `approved_late_start` flag |
| `point-streak-calculator/index.ts` | Don't break streak if approved |

#### 3.3 UI Updates

| File | Changes |
|------|---------|
| `src/pages/attendance/Schedules.tsx` | เพิ่ม toggle "อนุญาตเข้างานสาย" |
| `src/components/attendance/ScheduleCalendar.tsx` | แสดง indicator เมื่อมีการอนุญาต |

---

### ลำดับการทำงาน

1. **Database Migration** - แก้ไขคะแนน Noey + เพิ่ม columns ใหม่
2. **Broadcast** - สร้าง broadcast entry และ trigger ส่ง
3. **Edge Functions** - อัพเดท logic
4. **UI** - เพิ่มฟีเจอร์ approve late ในหน้า Schedules

