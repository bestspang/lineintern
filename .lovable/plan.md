

## แผนเพิ่ม Streak Info ในข้อความ Checkout

### ตัวอย่างผลลัพธ์ที่ต้องการ

**ก่อน:**
```
คุณ ntp.冬至 เช็คเอาต์ เวลา 18:18
📍 สาขา: Glowfish Office
```

**หลัง:**
```
คุณ ntp.冬至 เช็คเอาต์ เวลา 18:18
📍 สาขา: Glowfish Office
🔥 มาตรงเวลา 21 days streak!
```

---

### การเปลี่ยนแปลง

**ไฟล์:** `supabase/functions/attendance-submit/index.ts`

#### 1. เพิ่มการดึง Streak Data (ก่อนบรรทัด 1269)

```typescript
// Fetch streak info for checkout message
let streakInfo = '';
if (token.type === 'check_out') {
  const { data: happyPointsData } = await supabase
    .from('happy_points')
    .select('current_punctuality_streak')
    .eq('employee_id', token.employee.id)
    .maybeSingle();
  
  const currentStreak = happyPointsData?.current_punctuality_streak || 0;
  if (currentStreak > 0) {
    streakInfo = `\n🔥 มาตรงเวลา ${currentStreak} days streak!`;
  }
}
```

#### 2. แก้ไข Group Message (บรรทัด 1275)

**จาก:**
```typescript
let groupMessage = `${flagIcon}${remoteIcon}คุณ ${token.employee.full_name} ${actionText}${isRemoteCheckin ? ' (Remote)' : ''} เวลา ${timeStr}\n📍 สาขา: ${token.employee.branch?.name || 'ไม่ระบุ'}`;
```

**เป็น:**
```typescript
let groupMessage = `${flagIcon}${remoteIcon}คุณ ${token.employee.full_name} ${actionText}${isRemoteCheckin ? ' (Remote)' : ''} เวลา ${timeStr}\n📍 สาขา: ${token.employee.branch?.name || 'ไม่ระบุ'}${streakInfo}`;
```

---

### สรุป

| รายการ | รายละเอียด |
|--------|-----------|
| ไฟล์ | `attendance-submit/index.ts` |
| เพิ่ม | Query ดึง `current_punctuality_streak` จาก `happy_points` |
| แก้ไข | เพิ่ม `${streakInfo}` ท้าย group message |
| แสดงเมื่อ | Checkout + streak > 0 |

