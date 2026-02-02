

## แผนแก้ไข Points ntp.冬至 - วันที่ 30 ม.ค. 2569

### ปัญหาที่พบ

เช่นเดียวกับ Noey - ntp.冬至 ได้รับอนุญาตให้เข้างานสายวันที่ 30 ม.ค. แต่ระบบบันทึกว่าสาย ทำให้:

| รายการ | ก่อนแก้ | หลังแก้ |
|--------|--------|--------|
| Punctuality bonus (30 ม.ค.) | ❌ ไม่ได้ | ✅ +10 |
| 10-Day Streak bonus | ❌ ไม่ได้ | ✅ +50 |
| **Point balance** | **140** | **200** |
| Current streak | 1 | 10 |
| Longest streak | 8 | 10 |

---

### การดำเนินการ

#### 1. Database Migration - แก้ไขคะแนน

```sql
-- 1. เพิ่ม Attendance Adjustment สำหรับวันที่ 30 ม.ค.
INSERT INTO attendance_adjustments (
  employee_id,
  adjustment_date,
  override_status,
  reason,
  adjusted_by_user_id,
  approved_late_start,
  approved_late_reason
) VALUES (
  '0a9c61de-8482-49ac-8586-e7878a740812', -- ntp.冬至
  '2026-01-30',
  'on_time',
  'Owner approved late start - ทำงานกะพิเศษถึงเที่ยงคืน',
  (SELECT id FROM auth.users LIMIT 1),
  true,
  'ทำงานกะพิเศษถึงเที่ยงคืน'
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
  '0a9c61de-8482-49ac-8586-e7878a740812',
  'bonus',
  'attendance',
  10,
  '🕐 Punctuality bonus - 30 ม.ค. 69',
  '{"reference_date": "2026-01-30", "manual_adjustment": true}'
);

-- 3. เพิ่ม Streak Bonus 10 วัน
INSERT INTO point_transactions (
  employee_id,
  transaction_type,
  category,
  amount,
  description,
  metadata
) VALUES (
  '0a9c61de-8482-49ac-8586-e7878a740812',
  'bonus',
  'streak',
  50,
  '🔥 มาเช้าต่อเนื่อง 10 วัน! (ย้อนหลัง 30 ม.ค.)',
  '{"streak_days": 10, "manual_adjustment": true, "original_date": "2026-01-30"}'
);

-- 4. อัพเดท happy_points
UPDATE happy_points
SET 
  point_balance = point_balance + 60,
  total_earned = total_earned + 60,
  current_punctuality_streak = 10,
  longest_punctuality_streak = 10,
  updated_at = NOW()
WHERE employee_id = '0a9c61de-8482-49ac-8586-e7878a740812';
```

#### 2. ส่งประกาศ LINE (เหมือน Noey)

สร้าง Broadcast ส่งไปยัง Glowfish Office Group:

```
📢 สรุป Points

👤 ntp.冬至
📅 วันที่ 30 ม.ค. 2569

✅ น่ารักที่สุด!!!!
✅ มาเช้าต่อเนื่องเป๊ะๆครบ 10 วัน เอาไปเลย +50 คะแนน
```

---

### ไฟล์ที่ต้องดำเนินการ

| รายการ | ประเภท | รายละเอียด |
|--------|--------|-----------|
| Database Migration | SQL | เพิ่ม adjustment + transactions + update happy_points |
| Broadcast | API Call | ส่งประกาศไปกลุ่ม LINE |

---

### ผลลัพธ์ที่คาดหวัง

**ntp.冬至 หลังแก้ไข:**
- Point balance: 140 → **200** (+60)
- Current streak: 1 → **10**
- Longest streak: 8 → **10**
- มีบันทึก audit trail ว่าได้รับอนุญาตเข้าสาย

