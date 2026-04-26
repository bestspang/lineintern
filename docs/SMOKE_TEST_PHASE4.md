# Smoke Test Guide — Phase 4 / 4.5

> รันหลัง deploy ทุกครั้งที่แก้ portal-data, line-webhook, หรือ critical files
> เป้าหมาย: detect regression ใน 5 นาที

---

## A. Build & Type Safety (เครื่อง dev)

```bash
bun install
bun run build      # ต้อง exit 0, no TS errors
```

✅ **Pass criteria:** build สำเร็จ, ไม่มี `TS####` errors ใน output

---

## B. Admin Dashboard

| ทดสอบ | คาดหวัง |
|---|---|
| เปิด `/overview` | Stats cards แสดงครบ ไม่มี Receipt/Deposit cards |
| เปิด `/attendance/dashboard` | Charts โหลด, ไม่มี console error |
| เปิด `/settings/roles` | Permission groups ไม่มี "Receipts"/"Deposits" |
| เปิด `/cron-jobs` | Job list โหลด, ไม่มี receipt/deposit jobs |
| Sidebar nav | ไม่มี menu group "Receipts" หรือ "Deposits" |
| Console (DevTools) | ไม่มี 404 ที่มี `*receipt*` หรือ `*deposit*` ใน URL |

---

## C. Employee Portal

| ทดสอบ | คาดหวัง |
|---|---|
| `/p` (PortalHome) | โหลดได้, แสดง points + today attendance |
| Bottom nav | มี **6 ปุ่ม** (ไม่มี "ฝากเงิน") |
| `/p/manager-dashboard` (manager role) | แสดง pending OT/Leave counts, **ไม่มีการ์ด "ใบฝากเงิน"** |
| `/p/help` | Category tabs แสดงเฉพาะที่มีข้อมูลจริง, search ทำงาน |
| `/p/help` → search "asdfgh" | แสดง empty state พร้อมปุ่มล้างค่า |
| `/p/my-profile` | โหลดได้, ไม่มี Google Drive section |
| `/p/notifications` | ไม่มี toggle `notify_receipts` |

---

## D. LINE Bot Commands (`/test-bot` หรือ DM จริง)

| ส่งข้อความ | คาดหวัง |
|---|---|
| `/help` | command list ไม่มี receipt/deposit |
| `/receipt` | ตอบ deprecation message สุภาพ |
| `/receiptsummary` | deprecation message |
| `/businesses` | deprecation message |
| ส่งรูปภาพ | **ไม่ตอบ** (silent ignore) + log ใน bot_message_logs |
| `/checkin` | ทำงานปกติ, ส่ง token link |
| `/menu` | เปิด LIFF menu |
| `/summary` | สรุปข้อความล่าสุด |

---

## E. Edge Function Health

ดู Edge Function logs ใน Lovable Cloud:

| Function | ไม่ควรเห็น error |
|---|---|
| `portal-data` | `relation receipt_* does not exist`, `daily_deposits does not exist`, TS errors |
| `line-webhook` | `receipt_approvers does not exist`, signature verify fail |
| `attendance-submit` | token validation fail (rate > 1%) |

---

## F. DB Sanity Queries (psql / Supabase SQL editor)

ทุก query ต้องคืน **0 rows**:

```sql
SELECT * FROM bot_commands WHERE category IN ('receipt','deposit');
SELECT * FROM webapp_page_config WHERE menu_group IN ('Receipts','Deposits');
SELECT table_name FROM information_schema.tables
  WHERE table_schema='public'
    AND (table_name LIKE '%receipt%' OR table_name LIKE '%deposit%');
SELECT * FROM portal_faqs WHERE category IN ('receipts','deposits');
```

ผลรวม FAQ categories ที่ยังใช้:
```sql
SELECT category, COUNT(*) FROM portal_faqs GROUP BY category ORDER BY category;
-- คาดหวัง: attendance, general, leave-ot, points (ไม่มี receipts/deposits)
```

---

## G. Regression Critical Path (ห้ามพัง)

ทุกข้อต้องผ่านก่อน sign-off Phase 4.5:

- [ ] `bun run build` exit 0
- [ ] `portal-data` deploy สำเร็จ + ไม่มี boot error
- [ ] PortalHome โหลดได้ทั้ง self / manager role
- [ ] LINE webhook ตอบ /help, /menu, /checkin ปกติ
- [ ] Attendance check-in/out flow ไม่กระทบ
- [ ] FAQ search ไม่ throw error เมื่อค้นคำที่ไม่มี

---

## เมื่อเจอปัญหา

1. ดู Edge Function logs ก่อน — error stack จะระบุ root cause
2. เช็ค `.lovable/CRITICAL_FILES.md` ว่าไฟล์ที่พังอยู่ใน critical list ไหม
3. ถ้าใช่ → revert ไป commit ก่อนหน้าก่อน + วิเคราะห์ root cause ทีละขั้น
4. ถ้าไม่ใช่ → ใช้ minimal-diff fix pattern ตาม project knowledge

---

**Last updated:** 2026-04-26 (Phase 4.5 hotfix complete)
