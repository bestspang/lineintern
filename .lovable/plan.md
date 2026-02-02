

## แผนดำเนินการ (แก้ไขตามคำขอ - ไม่เพิ่ม Point ให้ Noey)

### 1. อัพเดท Streak Noey (ไม่เพิ่ม Point)

```sql
-- อัพเดทเฉพาะ streak (point_balance คงเดิมที่ 295)
UPDATE happy_points
SET 
  current_punctuality_streak = 21,
  longest_punctuality_streak = 21,
  updated_at = NOW()
WHERE employee_id = 'a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af';
```

**ผลลัพธ์ Noey:**
| Field | Before | After |
|-------|--------|-------|
| Point Balance | 295 | **295** (ไม่เปลี่ยน) |
| Current Streak | 4 | **21** |
| Longest Streak | 15 | **21** |

---

### 2. แก้ไข Logic Punctuality ใน attendance-submit

**ไฟล์:** `supabase/functions/attendance-submit/index.ts`

**บรรทัด 963-979 เปลี่ยนจาก:**
```typescript
// Get grace period from settings (default 15 minutes)
const { data: gracePeriodSettings } = await supabase
  .from('attendance_settings')
  .select('grace_period_minutes')
  .eq('scope', 'global')
  .maybeSingle();
const gracePeriodMinutes = gracePeriodSettings?.grace_period_minutes || 15;

// Add grace period to shift start for on-time calculation
const [shiftH, shiftM] = shiftStart.split(':').map(Number);
const totalMinutes = shiftH * 60 + shiftM + gracePeriodMinutes;
const deadlineH = Math.floor(totalMinutes / 60);
const deadlineM = totalMinutes % 60;
const deadlineStr = `${String(deadlineH).padStart(2, '0')}:${String(deadlineM).padStart(2, '0')}:00`;

const isOnTime = hasApprovedLateStart || bangkokTimeStr <= deadlineStr;
```

**เป็น:**
```typescript
// NEW RULE: Punctuality/Streak requires check-in at or BEFORE shift start time
// Grace period is ONLY for not counting as "late" status, NOT for points/streak
// Example: shift 09:00 → must check in ≤ 09:00:00 to get punctuality bonus
//          check in at 09:01 = no bonus, streak resets (unless has Shield)

// If approved_late_start is true, treat as on-time regardless of actual time
const isOnTime = hasApprovedLateStart || bangkokTimeStr <= shiftStart;
```

---

### สรุปไฟล์ที่ต้องแก้ไข

| รายการ | ประเภท | รายละเอียด |
|--------|--------|-----------|
| Database | SQL Update | อัพเดท streak Noey เป็น 21 (ไม่เพิ่ม points) |
| `attendance-submit/index.ts` | Code | ลบ grace period ออกจาก punctuality logic |

---

### กฎหลังจากนี้

- ✅ มาตรงเวลาหรือก่อนเวลา → ได้ Punctuality (+10) และ Streak ต่อเนื่อง
- ❌ มาสาย 1 นาที (09:01) → ไม่ได้ Points และ Streak reset
- 🛡️ ยกเว้น: มี approved_late_start หรือ Streak Shield

