
## แผนแก้ไข: auto-checkout-midnight ไม่ได้ update work_sessions

### 🎯 Root Cause Analysis

**ปัญหา:**
`auto-checkout-midnight` สร้าง `attendance_logs` (check_out) แต่**ไม่ได้ update `work_sessions`** เลย!

**เปรียบเทียบ 3 Functions:**

| Function | สร้าง attendance_logs | update work_sessions |
|----------|---------------------|---------------------|
| `attendance-submit` (checkout ปกติ) | ✅ บรรทัด 1051-1123 | ✅ ครบ |
| `auto-checkout-grace` (hours_based) | ✅ บรรทัด 188-199 | ✅ บรรทัด 214-224 |
| `auto-checkout-midnight` (time_based) | ✅ บรรทัด 236-251 | ❌ **ขาดหายไป!** |

**ผลกระทบ:**
- `work_sessions` ค้างเป็น `active` ตลอดไป
- `actual_end_time`, `total_minutes`, `net_work_minutes` เป็น null
- Dashboard แสดงพนักงานเข้างานอยู่ทั้งที่ checkout แล้ว

---

### 📋 การแก้ไข

#### ไฟล์ที่ต้องแก้: `supabase/functions/auto-checkout-midnight/index.ts`

**เพิ่ม Logic Update Work Sessions (หลังบรรทัด 258):**

```typescript
// ✅ NEW: Update work_session to mark as auto_closed
// Find active session for this employee on target date
const { data: activeSession, error: sessionFetchError } = await supabase
  .from('work_sessions')
  .select('id, actual_start_time, break_minutes')
  .eq('employee_id', empId)
  .eq('work_date', targetDate)
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .maybeSingle();

if (activeSession && !sessionFetchError) {
  // Calculate work duration
  const actualStartTime = new Date(activeSession.actual_start_time);
  const totalMinutes = Math.floor((midnightTime.getTime() - actualStartTime.getTime()) / (1000 * 60));
  const breakMinutes = activeSession.break_minutes || 60;
  const netWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
  
  const { error: updateError } = await supabase
    .from('work_sessions')
    .update({
      checkout_log_id: checkoutLog.id,
      actual_end_time: midnightTime.toISOString(),
      total_minutes: totalMinutes,
      net_work_minutes: netWorkMinutes,
      status: 'auto_closed', // Use auto_closed status same as auto-checkout-grace
      updated_at: new Date().toISOString()
    })
    .eq('id', activeSession.id);
  
  if (updateError) {
    console.error(`[auto-checkout-midnight] Error updating work session for ${employee.full_name}:`, updateError);
  } else {
    console.log(`[auto-checkout-midnight] Updated work session ${activeSession.id} for ${employee.full_name}: ${(netWorkMinutes / 60).toFixed(1)}h net`);
  }
} else {
  console.warn(`[auto-checkout-midnight] No active session found for ${employee.full_name} on ${targetDate}`);
}
```

**ตำแหน่งที่เพิ่ม:**
- หลังบรรทัด 258 (`console.log(\`[auto-checkout-midnight] Auto checked out ${employee.full_name}\`);`)
- ก่อนการส่ง LINE notification

---

### 🔍 Technical Details

**Work Session Fields ที่ต้อง Update:**

| Field | Value | คำอธิบาย |
|-------|-------|---------|
| `checkout_log_id` | `checkoutLog.id` | Link ไปยัง attendance_log ที่เพิ่งสร้าง |
| `actual_end_time` | `midnightTime.toISOString()` | 23:59:59 Bangkok (16:59:59 UTC) |
| `total_minutes` | คำนวณจาก start → end | รวมเวลาทำงานทั้งหมด |
| `net_work_minutes` | `total_minutes - break_minutes` | หลังหักพัก |
| `status` | `'auto_closed'` | สถานะ auto checkout |
| `updated_at` | `new Date().toISOString()` | Timestamp update |

**Pattern เดียวกับ `auto-checkout-grace` (บรรทัด 206-229):**
- ใช้ `maybeSingle()` เพื่อป้องกัน error ถ้าไม่มี session
- ใช้ status `auto_closed` แทน `completed` เพื่อแยก manual vs auto
- Log warning ถ้าไม่เจอ session

---

### ⚠️ ความเสี่ยงและการป้องกัน

| ความเสี่ยง | การป้องกัน |
|-----------|-----------|
| Session ไม่มี | ใช้ `maybeSingle()` + log warning |
| Error update | Try-catch + log error |
| Duplicate update | Query `status: 'active'` เท่านั้น |
| เวลาคำนวณผิด | ใช้ `midnightTime` เดียวกับ checkout log |

---

### 📊 สรุปการเปลี่ยนแปลง

| รายการ | รายละเอียด |
|--------|-----------|
| **ไฟล์** | `supabase/functions/auto-checkout-midnight/index.ts` |
| **ตำแหน่ง** | หลังบรรทัด 258 |
| **เพิ่ม** | ~35 บรรทัด (query + update work_sessions) |
| **Pattern** | คัดลอกจาก `auto-checkout-grace` บรรทัด 206-229 |
| **Impact** | แก้ bug work_sessions ค้าง active หลัง midnight auto-checkout |

---

### ✅ หลังแก้ไข

1. **Deploy** edge function `auto-checkout-midnight`
2. **Manual Fix** สำหรับ 3 พนักงานที่ยังค้าง (Noey, Pass, ntp.冬至)
3. **Test** รอวันถัดไปดู cron job ทำงานถูกต้อง

