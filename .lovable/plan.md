
## แผนเพิ่มปุ่ม Toggle สำหรับ Work Reminder และ Work Summary

### สถานะปัจจุบัน

ใน Attendance Settings มี toggle อยู่แล้ว 3 กลุ่ม:
- Daily Summary (สรุปเข้างาน) - มี toggle
- Birthday Reminder - มี toggle  
- Auto Checkout Notification - มี toggle

**ยังไม่มี toggle สำหรับ:**
1. **Work Reminder** - แจ้งเตือนงาน เช่น "📅 แจ้งเตือนงาน... เหลือเวลา 23 ชม."
2. **Work Summary** - สรุปงานตอนเช้า เช่น "สวัสดีตอนเช้าทุกคน! สรุปงานสำคัญ..."

---

### สิ่งที่จะทำ

#### 1. เพิ่ม 2 columns ใน attendance_settings

```sql
ALTER TABLE attendance_settings 
ADD COLUMN work_reminder_enabled boolean DEFAULT true,
ADD COLUMN work_summary_enabled boolean DEFAULT true;
```

#### 2. เพิ่ม Toggle UI ใน Settings.tsx

เพิ่ม Card ใหม่ "Work Reminder & Summary Settings" ใน Attendance Settings page ที่มี:

- **Toggle: เปิดใช้งาน Work Reminder** - เปิด/ปิดการแจ้งเตือนก่อนถึงกำหนดงาน (24h, 6h, 1h)
- **Toggle: เปิดใช้งาน Work Summary** - เปิด/ปิดสรุปงานประจำวัน (ตอนเช้า/เย็น)

#### 3. แก้ Edge Functions ให้เช็ค toggle

**work-reminder/index.ts:**
- เพิ่มการ query `attendance_settings` ตอนเริ่มต้น
- ถ้า `work_reminder_enabled = false` → return early ไม่ส่งแจ้งเตือน

**work-summary/index.ts:**
- เพิ่มการ query `attendance_settings` ตอนเริ่มต้น
- ถ้า `work_summary_enabled = false` → return early ไม่ส่งสรุป

---

### รายละเอียดทางเทคนิค

| ลำดับ | ไฟล์ | การแก้ไข |
|-------|------|---------|
| 1 | DB Migration | เพิ่ม 2 columns |
| 2 | `src/pages/attendance/Settings.tsx` | เพิ่ม formData fields + Toggle UI Card |
| 3 | `supabase/functions/work-reminder/index.ts` | เช็ค `work_reminder_enabled` ก่อนทำงาน |
| 4 | `supabase/functions/work-summary/index.ts` | เช็ค `work_summary_enabled` ก่อนทำงาน |

### Cross-Feature Impact
- ไม่กระทบ feature อื่น - เป็นการเพิ่ม guard check ใน edge functions ที่มีอยู่แล้ว
- Default เป็น `true` ทั้งคู่ จึงไม่เปลี่ยนพฤติกรรมเดิม
