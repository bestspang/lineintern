

## Next Phase: #2 Receipt Budget Widget + #4 Gacha Daily Missions

### สถานะ Features ที่ทำเสร็จแล้ว
| # | Feature | Status |
|---|---------|--------|
| 1 | Broadcast Branch/Role Filter | ✅ Done |
| 3 | Dashboard Action Items Widget | ✅ Done |

### สถานะ Receipt Smart Categorization
ตรวจสอบแล้ว — `receipt-submit/index.ts` **มี auto-category ใน AI prompt อยู่แล้ว** (บรรทัด 410: `"category": {"value": "Food & Dining|Transportation|Office Supplies|..."}`) ดังนั้นไม่ต้องแก้ edge function

สิ่งที่เหลือคือ **เพิ่ม Budget Usage Widget** ใน ReceiptAnalytics.tsx

---

### Feature #2: Receipt Budget Usage Widget

**สิ่งที่ทำ**: เพิ่ม "Monthly Budget Usage" card ใน ReceiptAnalytics.tsx ที่แสดง:
- ยอดใช้จ่ายเดือนนี้ vs เดือนก่อน (มี monthlyComparison อยู่แล้วใน analytics)
- % การเปลี่ยนแปลง (ขึ้น/ลง)
- Progress bar เทียบกับ quota limit (จาก receipt_plans)

**ไม่ต้องแก้ edge function หรือ DB** — ใช้ data ที่ query ได้อยู่แล้ว

| File | Change |
|------|--------|
| `src/pages/receipts/ReceiptAnalytics.tsx` | เพิ่ม Monthly Comparison card (~30 lines) ในส่วน Summary Cards |

---

### Feature #4: Gacha Daily Missions

**สิ่งที่ทำ**: ระบบ mission ง่ายๆ ที่คำนวณจาก data ที่มีอยู่แล้ว (ไม่ต้องสร้าง table ใหม่ในเฟสแรก)

**แนวทางที่ปลอดภัยกว่า (ไม่ต้อง migration)**: แทนที่จะสร้าง `daily_missions` table — ใช้ **computed missions** จาก data ที่มีอยู่:

1. เช็คว่าวันนี้ check-in ตรงเวลาหรือยัง → "มาตรงเวลาวันนี้ ✅"
2. เช็คว่าตอบแชท >= 3 ข้อความหรือยัง → "ตอบแชทวันนี้ ✅"
3. เช็คว่า streak >= 5 วันหรือยัง → "Streak 5 วัน 🔥"

แสดงเป็น "Daily Progress" card ใน MyPoints.tsx โดย query จาก:
- `attendance_logs` (check-in วันนี้)
- `happy_points` (streak ปัจจุบัน)
- `point_transactions` (แต้มที่ได้วันนี้)

**ไม่ต้อง migration, ไม่ต้องแก้ edge function** — เป็น UI-only ที่ query data ที่มีอยู่ผ่าน portal-data

| File | Change |
|------|--------|
| `supabase/functions/portal-data/index.ts` | เพิ่ม endpoint `daily-missions` ที่ compute missions จาก data ที่มี |
| `src/pages/portal/MyPoints.tsx` | เพิ่ม "Daily Progress" card (~50 lines) |

#### portal-data endpoint `daily-missions` logic:
```typescript
// Query today's data
const bangkokToday = getBangkokDate();

// Mission 1: On-time check-in today
const { data: todayCheckin } = await supabase
  .from('attendance_logs')
  .select('id, is_late')
  .eq('employee_id', employee_id)
  .eq('event_type', 'check_in')
  .gte('server_time', todayStart)
  .limit(1);

// Mission 2: Current streak
const { data: hp } = await supabase
  .from('happy_points')
  .select('current_punctuality_streak, daily_response_score')
  .eq('employee_id', employee_id)
  .single();

// Mission 3: Points earned today
const { data: todayPoints } = await supabase
  .from('point_transactions')
  .select('amount')
  .eq('employee_id', employee_id)
  .gte('created_at', todayStart);

return {
  missions: [
    { id: 'checkin', label: 'มาตรงเวลาวันนี้', icon: '🕐', 
      completed: todayCheckin?.length > 0 && !todayCheckin[0].is_late },
    { id: 'streak3', label: 'Streak 3 วันขึ้นไป', icon: '🔥',
      completed: (hp?.current_punctuality_streak || 0) >= 3 },
    { id: 'earn_points', label: 'ได้รับแต้มวันนี้', icon: '⭐',
      completed: todayTotalPoints > 0 },
  ],
  completed_count: ...,
  total_count: 3
};
```

---

### สรุป Files Changed

| File | Change | Risk |
|------|--------|------|
| `src/pages/receipts/ReceiptAnalytics.tsx` | เพิ่ม monthly comparison card | Very Low (additive) |
| `supabase/functions/portal-data/index.ts` | เพิ่ม `daily-missions` endpoint | Very Low (new endpoint) |
| `src/pages/portal/MyPoints.tsx` | เพิ่ม Daily Progress card | Very Low (additive) |

### Risk: Very Low
- ทั้งหมดเป็น additive — เพิ่ม card/section ใหม่ ไม่แก้ code เดิม
- ไม่มี DB migration
- ไม่แก้ edge function logic เดิม
- Daily missions เป็น computed จาก data ที่มีอยู่ (ไม่ต้องสร้าง table)

