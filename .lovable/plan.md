

## แผนเพิ่ม Bot Alert Settings (เปิด/ปิด & Aggregate Mode)

### สรุปปัญหา
- Alert "ผู้ใช้ที่ไม่ได้ลงทะเบียนพยายามส่งรูป" ถูกส่งทุกครั้ง ทำให้รบกวน Admin
- ต้องการให้ Admin สามารถ:
  1. เปิด/ปิด alert นี้ได้
  2. เลือก mode: Real-time หรือ Aggregate (สรุปรวม)
  3. Default = ปิด

---

### การเปลี่ยนแปลง

#### 1. เพิ่ม Setting ใน Database

**ตาราง:** `system_settings`

```sql
INSERT INTO system_settings (setting_key, setting_value, category, description, is_editable)
VALUES (
  'bot_alert_unregistered_user',
  '{"enabled": false, "mode": "aggregate", "aggregate_interval_hours": 24}',
  'bot',
  'Settings for unregistered user image alerts. Mode: realtime (send immediately) or aggregate (daily summary)',
  true
);
```

**Schema ของ `setting_value`:**
```json
{
  "enabled": false,         // เปิด/ปิด alert (default: ปิด)
  "mode": "aggregate",      // "realtime" หรือ "aggregate"
  "aggregate_interval_hours": 24  // สรุปทุกกี่ชั่วโมง (default: 24)
}
```

---

#### 2. เพิ่ม UI Settings ใน Admin Dashboard

**ไฟล์:** `src/pages/Settings.tsx`

เพิ่ม Card ใหม่สำหรับ Bot Alert Settings:

```
┌─────────────────────────────────────────────────────────┐
│ 🔔 Bot Alert Settings                                   │
│ ตั้งค่าการแจ้งเตือนจาก Bot                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ☐ แจ้งเตือนเมื่อผู้ใช้ที่ไม่ได้ลงทะเบียนส่งรูป        │
│   (ปิดอยู่)                                            │
│                                                         │
│ [เมื่อเปิดจะแสดง options เพิ่ม:]                        │
│                                                         │
│ ◉ Real-time - ส่งทันทีทุกครั้ง                          │
│ ○ Aggregate - สรุปรวมวันละครั้ง                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

#### 3. แก้ไข Edge Function

**ไฟล์:** `supabase/functions/line-webhook/index.ts`

ตรงส่วน `handleImageMessage` (~line 8908-8929):

**Before:**
```typescript
if (!employee) {
  await notifyAdminGroup(`📸 ผู้ใช้ที่ไม่ได้ลงทะเบียนพยายามส่งรูป`, {...});
  return;
}
```

**After:**
```typescript
if (!employee) {
  // ตรวจสอบ setting ก่อนส่ง alert
  const alertSetting = await getUnregisteredUserAlertSetting();
  
  if (alertSetting.enabled) {
    if (alertSetting.mode === 'realtime') {
      // ส่งทันที
      await notifyAdminGroup(`📸 ผู้ใช้ที่ไม่ได้ลงทะเบียนพยายามส่งรูป`, {...});
    } else {
      // บันทึกลง queue สำหรับ aggregate
      await queueUnregisteredUserAlert({...});
    }
  }
  return;
}
```

---

#### 4. สร้าง Aggregate Alert Cron Job (Optional)

**ไฟล์:** `supabase/functions/unregistered-user-alert-summary/index.ts`

Cron job ที่รันทุกวัน/ตามที่ตั้ง เพื่อส่งสรุป:

```
📊 สรุป Bot Alert ประจำวัน
━━━━━━━━━━━━━━━━━━━━━━
📸 ผู้ใช้ที่ไม่ได้ลงทะเบียนส่งรูป: 15 ครั้ง

🔹 Central Park สีลม: 8 ครั้ง
   - User 8da68c: 5 ครั้ง
   - User f2a91b: 3 ครั้ง
   
🔹 Good Lime: 7 ครั้ง
   - User c3b72d: 7 ครั้ง
```

---

### รายละเอียดทางเทคนิค

#### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|--------------|
| `src/pages/Settings.tsx` | เพิ่ม Bot Alert Settings Card |
| `supabase/functions/line-webhook/index.ts` | ตรวจสอบ setting ก่อนส่ง alert |

#### ไฟล์ใหม่ที่ต้องสร้าง (สำหรับ Aggregate mode)

| ไฟล์ | รายละเอียด |
|------|-----------|
| `supabase/functions/unregistered-user-alert-summary/index.ts` | Cron job สรุป alert รายวัน |

#### Database Changes

| ตาราง | การเปลี่ยนแปลง |
|------|--------------|
| `system_settings` | INSERT setting ใหม่ `bot_alert_unregistered_user` |
| `unregistered_user_alerts` (ใหม่) | เก็บ queue สำหรับ aggregate mode |

---

### Flow Diagram

```text
User sends image
       │
       ▼
┌──────────────────┐
│ Is Employee?     │
└────────┬─────────┘
         │ No
         ▼
┌──────────────────┐
│ Check Setting    │
│ bot_alert_       │
│ unregistered_user│
└────────┬─────────┘
         │
    ┌────┴────┐
    │ enabled │
    │ = true? │
    └────┬────┘
     No  │  Yes
     │   │
     ▼   ▼
  Skip  ┌─────────────┐
        │ mode =      │
        │ realtime?   │
        └──────┬──────┘
          Yes  │  No (aggregate)
          │    │
          ▼    ▼
     Send   Save to queue
     Alert  (daily summary)
```

---

### ผลลัพธ์ที่คาดหวัง

| สถานะ | Before | After |
|-------|--------|-------|
| Default | ส่ง alert ทุกครั้ง | ไม่ส่ง alert (ปิดอยู่) |
| เปิด + Realtime | - | ส่งทันทีทุกครั้ง |
| เปิด + Aggregate | - | สรุปวันละครั้ง |

---

### ความเสี่ยง

- **ต่ำมาก** - เป็นการเพิ่ม feature ใหม่ ไม่กระทบ logic เดิม
- Default = ปิด จึงไม่มีผลกระทบทันทีหลัง deploy

### ขั้นตอนการ Implement

1. สร้าง Migration เพิ่ม setting ใน `system_settings`
2. สร้างตาราง `unregistered_user_alerts` สำหรับ queue (aggregate mode)
3. เพิ่ม UI Card ใน `Settings.tsx`
4. แก้ไข `line-webhook/index.ts` ให้ตรวจสอบ setting
5. สร้าง Cron job `unregistered-user-alert-summary` สำหรับ aggregate
6. Test ทั้ง 3 โหมด: ปิด, Realtime, Aggregate

