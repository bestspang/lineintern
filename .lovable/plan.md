## สถานะ Live ตอนนี้ (ตรวจแล้ว ✅)

ข่าวดี: script ที่คุณรันไปก่อนหน้านี้ **ทำงานสำเร็จเกือบหมด!** ผมเช็คฐาน Live ตรงๆ แล้วพบว่า:

| รายการ | สถานะ |
|--------|-------|
| ตาราง `daily_deposits`, `deposit_settings`, `deposit_reminders`, `deposit_approval_logs` | ✅ Drop หมดแล้ว |
| ตาราง `receipt_subscriptions` | ✅ Drop แล้ว |
| Cron job `deposit-reminder-hourly` (ตัวที่ทำให้ migration พัง) | ✅ ลบแล้ว |
| Migration 14 ตัว (จาก 15) ถูก mark เข้า `schema_migrations` | ✅ สำเร็จ |

**ขาดอย่างเดียว:** Migration `20260429073632` ยังไม่ถูก mark + cron job `audit-logs-cleanup-daily` ที่ migration นี้ควรสร้าง ยังไม่ถูกสร้าง

## ทำไม Publish ยังติดอยู่

Lovable เห็นว่า migration `20260429073632` ยังไม่ได้รันบน Live ก็จะพยายามรันใหม่ — ซึ่งโอเคนะครับเพราะตัว SQL idempotent อยู่แล้ว **แต่** น่าจะมี migration ตัวอื่นที่ต่อจากนี้ที่ทำให้ติด หรือ Lovable detect ว่าลำดับเริ่มเพี้ยน

วิธีปลอดภัยที่สุดคือ: **ทำงานที่ migration นี้ควรทำให้เสร็จเอง + mark ว่าทำแล้ว** เพื่อให้ลำดับสะอาด 100%

## แผน (Way 1 ต่อ — รัน SQL สั้นมาก)

**ผมจะสร้างไฟล์ `unblock_publish_v2.sql`** ให้คุณรันใน Cloud → SQL editor (Live) — ทำ 2 อย่างเท่านั้น:

```sql
BEGIN;

-- 1) สร้าง cron job ที่ migration 20260429073632 ควรสร้าง (idempotent)
SELECT cron.unschedule('audit-logs-cleanup-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-logs-cleanup-daily');

SELECT cron.schedule(
  'audit-logs-cleanup-daily',
  '15 17 * * *',
  $$SELECT public.cleanup_audit_logs(180);$$
);

-- 2) Mark migration ว่ารันสำเร็จแล้ว
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20260429073632')
ON CONFLICT (version) DO NOTHING;

-- 3) Verify
SELECT 
  (SELECT COUNT(*) FROM cron.job WHERE jobname = 'audit-logs-cleanup-daily') AS cron_created,
  (SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE version = '20260429073632') AS migration_marked;

COMMIT;
```

ผลที่คาดหวัง: `cron_created = 1`, `migration_marked = 1`

## ขั้นตอนสำหรับคุณ

1. ให้ผมอนุมัติแผนนี้ → ผมจะเขียนไฟล์ `unblock_publish_v2.sql` ไว้ที่ `/mnt/documents/`
2. เปิดไฟล์ → copy SQL ทั้งก้อน
3. ใน **Cloud → SQL editor (Live)** → paste → กด **Run**
4. บอกผมผลลัพธ์ของ verify (ควรได้ `1, 1`)
5. ผมจะเช็ค Live อีกรอบ ถ้าทุกอย่างเรียบร้อย → กด **Publish** ได้เลย

## ความเสี่ยง

- ✅ **ไม่กระทบข้อมูลผู้ใช้** — แตะแค่ `cron.job` (เพิ่ม 1 job) และ `schema_migrations` (เพิ่ม 1 row)
- ✅ **Idempotent** — รันซ้ำได้ปลอดภัย
- ✅ **ไม่กระทบ Test** — ทำเฉพาะ Live

## ทำไมไม่แก้ไฟล์ migration เอง

ไฟล์ migration เก่าถูกล็อก (Lovable ไม่ให้แก้) — เลยต้องสะสาง state ฝั่ง Live ตรงๆ แทน

---

**อนุมัติเพื่อให้ผมเขียนไฟล์ SQL ตัวสุดท้ายให้ครับ** หลังจากนั้นใช้เวลารันไม่ถึง 10 วินาที แล้ว Publish ได้เลย 🚀
