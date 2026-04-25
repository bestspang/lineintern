
# Phase 4 — Final Cleanup, Smoke Test Guide & Help FAQ Resilience

แบ่งเป็น 5 ส่วน ตามที่คุณขอ + จัดลำดับตามความเสี่ยง

---

## 🚨 ส่วนที่ 1 — แก้ P0 Bug ก่อน (ระบบจะพังถ้าไม่แก้)

### 1.1 `supabase/functions/portal-data/index.ts`
**ปัญหา:** เรียก table `daily_deposits` ที่ถูก DROP ไปแล้ว → ManagerDashboard 500 error

- ลบ `case 'check-today-deposit'` (line ~1019-1045)
- ลบ `case 'my-receipt-quota'` (line ~1048-1110) + query `receipt_usage`, `receipt_subscriptions`, `receipt_plans`
- ใน `pending-counts-by-branch` (line ~640-700): ลบ `depositsQuery` + `daily_deposits` join + คืนค่า `deposits: 0` ออกจาก response
- ใน `notification-preferences` (line ~1540): ลบ `notify_receipts` field

### 1.2 `supabase/functions/line-webhook/index.ts`
**ปัญหา:** Query `receipt_approvers` table ที่ถูก DROP → 500

- ลบ block ที่ query `receipt_approvers` (line ~7876)
- ลบ helper functions ที่ไม่ใช้แล้ว (~400 บรรทัด): `extractDepositDataFromImage`, `classifyDocumentType`, `determineTransferDirection`, `documentTypeLabels`, prompts การ OCR
- **เก็บ** stub `handleImageMessage` ไว้ตามเดิม (logging only)
- **เก็บ** deprecation handler สำหรับ command `/receipt` etc. ไว้ตามเดิม (ตอบ user แบบสุภาพ)

---

## 🧹 ส่วนที่ 2 — ลบ Receipt/Deposit residue ตามที่คุณขอ

### 2.1 Frontend cleanup
- **`src/pages/portal/ManagerDashboard.tsx`**: ลบ `deposits: number` จาก type, ลบจาก `useState`, ลบจาก `totalPending`, ลบการ์ด "ใบฝากเงิน" (`/portal/deposit-review-list`), ลบ import `Banknote` ถ้าไม่ได้ใช้ที่อื่น
- **`src/pages/settings/RoleManagement.tsx`**: ลบ `'Deposits': { label: 'Deposits', ... }` (line 123)
- **`src/pages/settings/CuteQuotesSettings.tsx`**: ลบ option `'deposit'` จาก showTime list, ลบ `depositChance` state, ลบการ์ด "ฝากเงิน (Deposit)", ลบ import `Banknote`
- **`src/hooks/useCuteQuotes.ts`**: ลบ `'deposit'` ออกจาก union types, ลบ `deposit_chance` field, ลบ branch `eventType === 'deposit'` logic
- **`src/lib/translations.ts`**: ลบ key `deposit`
- **`src/pages/FeatureFlags.tsx`**: ลบ option `{ value: 'deposit', label: 'Deposit', ... }`
- **`src/pages/PreDeployChecklist.tsx`**: ลบ checklist item `deposit_upload`
- **`src/lib/portal-actions.ts`**: ลบ JSDoc references `/portal/deposit-upload`, `/portal/deposit-review-list`

### 2.2 Database cleanup (migration)
```sql
-- Drop residual tables
DROP TABLE IF EXISTS public.receipt_ocr_corrections CASCADE;
DROP TABLE IF EXISTS public.receipt_categories CASCADE;

-- Clean bot_commands (6 rows)
DELETE FROM public.bot_commands WHERE category = 'receipt';

-- Clean webapp_page_config (18 rows for Deposits menu)
DELETE FROM public.webapp_page_config 
WHERE menu_group = 'Deposits' OR page_path LIKE '/attendance/deposit%';

-- Clean profile.notification_preferences notify_receipts (data update via insert tool)
-- handled via UPDATE statement
```

### 2.3 Storage buckets — **ขออนุมัติก่อนลบ**
- `deposit-slips` (private)
- `receipt-files` (private)  
→ ผมจะ list contents ก่อน, ถ้า empty ค่อย drop

### 2.4 Edge function deletion
- ตอน Phase 2 ลบ `receipt-submit/quota/monthly-report` ไปแล้ว — ผมจะรัน `supabase--delete_edge_functions` ให้เพื่อลบจาก deployed runtime ด้วย

---

## 🛡️ ส่วนที่ 3 — Help FAQ Resilience (ทำให้ไม่พังหลังลบ category)

### 3.1 ปัญหาปัจจุบัน
- `FAQ_CATEGORIES` เป็น **hardcoded array** → ถ้าเพิ่ม/ลบ category ใน DB จะไม่ sync
- ถ้า user เลือก category ที่ไม่มี FAQ เลย → จะเห็น empty state แต่ไม่รู้ว่าเลือกผิดหรือ DB ว่าง
- ถ้า DB query fail → fall back to STATIC_FAQS_TH/EN ซึ่งทุกอันถูก label เป็น `'general'` → tab อื่นจะว่างเปล่า

### 3.2 แก้ไข `src/pages/portal/Help.tsx`
1. **Dynamic categories**: คำนวณ category list จาก `dbFaqs` ที่มีอยู่จริง (`Array.from(new Set(dbFaqs.map(f => f.category)))`) merge กับ static labels
2. **Auto-hide empty categories**: แสดงเฉพาะ tab ที่มี FAQ จริง + แสดง count ในแต่ละ tab `(N)`
3. **Better empty states** แยก 3 เคส:
   - DB ว่าง + ไม่มี static → "ยังไม่มีคำถามในระบบ กรุณาติดต่อ HR"
   - มี FAQ แต่ search ไม่เจอ → "ไม่พบคำถามที่ตรงกับ '<keyword>' ลองค้นด้วยคำอื่น"
   - เลือก category ที่ไม่มี → auto-redirect เป็น 'all' + toast แจ้ง
4. **Reset filter button**: ถ้า no results → ปุ่ม "ล้างการค้นหา" 
5. **Loading state ที่ดีขึ้น**: skeleton ตาม count จริง (3 → 5 cards)

### 3.3 ไม่แตะ
- Quick Actions section (ใช้ `getVisibleActions` registry แล้ว — แข็งแรง)
- Contact card (static)
- STATIC_FAQS fallback (เก็บไว้กรณี DB error 100%)

---

## 🔍 ส่วนที่ 4 — ตรวจ Foreign Key / Reference ที่ค้าง

### 4.1 ผลตรวจ DB (ทำแล้ว)
- ✅ ไม่มี FK จาก table อื่นชี้กลับเข้า receipt tables  
- ⚠️ พบ FK เดียว: `receipt_ocr_corrections.corrected_by_employee_id → employees(id) ON DELETE SET NULL` — **ปลอดภัย** (FK ออกไป ไม่ใช่เข้ามา) จะหายไปเมื่อ DROP table
- ✅ FAQ category='receipts': **ไม่มีอยู่แล้วใน DB** (มีแค่ attendance/general/leave-ot/points) → confirmed clean
- ⚠️ `bot_commands` 6 rows category='receipt' — ยังค้าง (ผม clean ใน 2.2)
- ⚠️ `webapp_page_config` 18 rows menu_group='Deposits' — ยังค้าง (clean ใน 2.2)

### 4.2 จะตรวจเพิ่มเติมใน Phase 4
- Trigger ที่อ้าง receipt/deposit (จาก initial scan: ไม่มี triggers ใน DB เลย — ปลอดภัย)
- Cron jobs (`get_cron_jobs()`) — confirm ไม่มี receipt/deposit jobs
- RLS policies orphan
- Functions ที่ยังอ้าง receipt tables

---

## 📋 ส่วนที่ 5 — Smoke Test Guide (สั้น กระชับ)

ผมจะสร้าง **`docs/SMOKE_TEST_PHASE4.md`** มีหัวข้อ:

### A. Build & Type Safety (ในเครื่อง)
```bash
bun install
bunx tsc --noEmit          # ต้องไม่มี error
bun run build              # build production สำเร็จ
```

### B. Dashboard Smoke Test
- เปิด `/overview` → เห็น stats ครบ ไม่มี Receipt card
- เปิด `/dashboard` (admin sidebar) → ไม่มี menu group "Receipts" และ "Deposits"
- เปิด `/settings/roles` → permission groups ไม่มี "Receipts"/"Deposits"
- Console: ตรวจว่าไม่มี 404 จาก `*receipt*` หรือ `*deposit*`

### C. Portal Smoke Test
- `/portal` → PortalHome render สำเร็จ ไม่มี "ฝากเงิน" ใน bottom nav
- `/portal/manager-dashboard` (manager role) → ไม่มีการ์ด "ใบฝากเงิน", `totalPending` ถูก
- `/portal/my-profile` → ไม่มี Google Drive section
- `/portal/help` → category tabs แสดงเฉพาะที่มีข้อมูลจริง, search ทำงาน, empty state ชัดเจน
- `/portal/notifications` → ไม่มี toggle `notify_receipts`

### D. LINE Bot Command Test (ผ่าน `/test-bot` หรือ DM จริง)
ทดสอบว่าคำสั่งเก่าตอบ deprecation ถูกต้อง:
| ส่ง | คาดหวัง |
|---|---|
| `/receipt` | "⚠️ ระบบใบเสร็จถูกยกเลิกแล้ว" |
| `/receiptsummary` | deprecation message |
| `/businesses` | deprecation message |
| รูปใบเสร็จ | **ไม่ตอบ** + log ใน `bot_message_logs` |
| `/help` | ไม่แสดง command receipt/deposit ใน list |
| `/checkin` | ทำงานปกติ |

### E. Edge Function Health
```bash
# เช็คใน Supabase Cloud > Edge Functions logs
# ดูว่า portal-data, line-webhook ไม่มี error 
# "relation receipt_approvers does not exist" / "daily_deposits does not exist"
```

### F. DB Sanity Queries
```sql
-- ต้องคืน 0 rows
SELECT * FROM bot_commands WHERE category IN ('receipt','deposit');
SELECT * FROM webapp_page_config WHERE menu_group IN ('Receipts','Deposits');
SELECT table_name FROM information_schema.tables 
  WHERE table_schema='public' 
  AND (table_name LIKE '%receipt%' OR table_name LIKE '%deposit%');
SELECT category, COUNT(*) FROM portal_faqs GROUP BY category;
```

---

## 📝 ลำดับการทำ (atomic, regression-safe)

1. **P0 backend fix** (portal-data + line-webhook) → push, ทดสอบว่า 500 หาย
2. **DB cleanup migration** → tables/bot_commands/webapp_page_config/buckets
3. **Frontend residue removal** → 8 ไฟล์ตาม 2.1
4. **Help.tsx dynamic FAQ enhancement**
5. **สร้าง `docs/SMOKE_TEST_PHASE4.md`**
6. **รัน typecheck + build verify**
7. **อัปเดต `.lovable/plan.md`** เป็น Phase 4 complete

---

## ❓ คำถามที่ต้องอนุมัติก่อนเริ่ม

1. **Storage buckets**: drop ทั้งคู่เลย (`deposit-slips` + `receipt-files`) ใช่ไหม? ผมจะ list contents ก่อนยืนยัน
2. **Cute Quotes 'deposit' option**: ลบทิ้งเลย หรือเก็บไว้เผื่อ deposit feature กลับมาใช้กับ context อื่น?
3. **`notify_receipts` ใน profile preferences**: ลบ column เลย หรือ deprecate (เก็บ column ไว้ ไม่ render ใน UI)?
4. **Rebrand `index.html` + `README.md`** จาก "LINE Intern" → "LINE HR" ใน Phase 4 นี้เลย หรือแยก Phase 5?

ตอบได้สั้นๆ เลยครับ จากนั้นผมจะลุย Phase 4 ให้จบในรอบเดียว ✅
