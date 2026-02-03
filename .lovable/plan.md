

## แผนแก้ไข: Streak ไม่คำนวณจาก Attendance Adjustments

### 1. Root Cause Analysis

| Data Source | ถูกนับใน Streak? | ข้อมูล mefonn |
|-------------|-----------------|---------------|
| `attendance_logs` | ✅ ใช่ | 2026-02-03 เท่านั้น |
| `attendance_adjustments` | ❌ ไม่ | 2026-02-02 (Admin เพิ่ม) |

**ผลลัพธ์:** Streak = 1 วัน (เฉพาะ 02-03) แทนที่จะเป็น 2 วัน (02-02 + 02-03)

---

### 2. วิธีแก้ไข

#### แก้ไข `streak-backfill/index.ts`

ปรับ function `recalculateStreak` ให้รวม `attendance_adjustments` ที่:
- `override_status = 'present'`
- `override_check_in IS NOT NULL`

```typescript
// เพิ่มหลังบรรทัด 173 (หลัง query attendance_logs)

// Also get attendance adjustments (Admin manual entries)
const { data: adjustments } = await supabase
  .from('attendance_adjustments')
  .select('adjustment_date, override_check_in, override_status')
  .eq('employee_id', employeeId)
  .eq('override_status', 'present')
  .not('override_check_in', 'is', null)
  .gte('adjustment_date', thirtyDaysAgoStr);

// Merge adjustments into logs (adjustments override actual logs)
const adjustmentMap = new Map();
for (const adj of adjustments || []) {
  if (adj.override_check_in) {
    const checkInTime = `${adj.adjustment_date}T${adj.override_check_in}`;
    adjustmentMap.set(adj.adjustment_date, {
      server_time: checkInTime,
      branch_id: null,
      isFromAdjustment: true
    });
  }
}
```

#### ปรับ Loop ที่สร้าง dailyLogs

```typescript
// ใน loop บรรทัด 183-189 - ให้ adjustment override attendance_logs
for (const log of logs) {
  const dateStr = log.server_time.split('T')[0];
  // Skip if this date has an adjustment (adjustment takes priority)
  if (adjustmentMap.has(dateStr)) continue;
  
  if (!dailyLogs.has(dateStr)) {
    const isOnTime = await isCheckInOnTime(supabase, employeeId, log.server_time, log.branch_id);
    dailyLogs.set(dateStr, { log, isOnTime });
  }
}

// Add adjustments to dailyLogs
for (const [dateStr, adjLog] of adjustmentMap) {
  // For adjustments, check if check_in time is on-time
  const isOnTime = await isCheckInOnTime(supabase, employeeId, adjLog.server_time, null);
  dailyLogs.set(dateStr, { log: adjLog, isOnTime });
}
```

---

### 3. ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การแก้ไข | Risk Level |
|------|---------|------------|
| `supabase/functions/streak-backfill/index.ts` | เพิ่ม query attendance_adjustments และ merge เข้า dailyLogs | กลาง |

---

### 4. ผลกระทบและการทดสอบ

**ผลกระทบ:**
- ✅ ไม่กระทบ attendance_logs logic เดิม
- ✅ ไม่กระทบ real-time check-in streak calculation
- ✅ รองรับ Admin adjustment ย้อนหลังทุกกรณี

**การทดสอบ:**
1. เรียก `streak-backfill` function หลังแก้ไข
2. ตรวจสอบว่า mefonn มี streak = 2 วัน
3. ตรวจสอบพนักงานคนอื่นว่าไม่ได้รับผลกระทบ

---

### 5. Prevention Measures

เพิ่ม comment ใน `streak-backfill/index.ts`:

```typescript
// ⚠️ VERIFIED 2026-02-03: Streak calculation includes BOTH sources:
// 1. attendance_logs (real check-ins)
// 2. attendance_adjustments (Admin manual entries with override_status='present')
// Adjustments take priority over logs for the same date
// DO NOT remove adjustment handling without understanding impact on Admin-adjusted records
```

---

### 6. ทางเลือกอื่น (ไม่แนะนำ)

**ทางเลือก A:** สร้าง attendance_log record เมื่อ Admin เพิ่ม adjustment
- ❌ ข้อมูลซ้ำซ้อน
- ❌ ยากในการแยกว่าอันไหนจริง อันไหน Admin เพิ่ม

**ทางเลือก B:** Run streak-backfill หลังทุกครั้งที่ Admin แก้ไข
- ❌ Performance impact
- ❌ ต้องแก้ AttendanceEditDialog ด้วย

**วิธีที่เลือก:** แก้ `streak-backfill` ให้รวม adjustments เป็นวิธีที่ clean ที่สุด

