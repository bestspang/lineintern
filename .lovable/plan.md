# 📋 Phase 4 Checklist — Residual Receipt/Deposit Cleanup

ผม scan ทุกชั้น (code, edge functions, DB, cron, storage, config tables) แล้ว นี่คือสถานะแบบจริงๆ ครับ — แยกเป็น ✅ ผ่าน / ⚠️ ยังเหลือ / ❌ ต้องแก้ทันที

---

## 1. 🛣️ Routes (App.tsx & nav)

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| Admin routes `/attendance/deposits`, `/deposit-settings` | ✅ ผ่าน | ลบจาก App.tsx แล้ว |
| Admin routes `/receipts/*` | ✅ ผ่าน | ลบทั้งกลุ่มแล้ว |
| Portal routes `/portal/deposit-*`, `/portal/receipt*` | ✅ ผ่าน | ลบครบ |
| LIFF routes `/liff/receipt-*`, `/liff/businesses` | ✅ ผ่าน | ลบทั้ง block |
| Bottom nav (PortalLayout) — ปุ่มฝากเงิน | ✅ ผ่าน | เหลือ 6 ปุ่มตามตกลง |
| Sidebar (DashboardLayout) — Receipts / Deposits group | ✅ ผ่าน | ลบจาก nav แล้ว |

---

## 2. 🤖 LINE Bot Commands

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| `command-parser.ts` — `/receipt`, `/businesses`, `/export` | ✅ ผ่าน | ลบจาก commandMap แล้ว |
| `bot_commands` table (DB) | ❌ **ต้องลบ** | ยังมี 6 rows: `receipt`, `receiptsummary`, `businesses`, `export_month`, `this_month`, `set_default_business` (category='receipt') |
| `/help` category list — `'receipt'` | ❌ **ต้องลบ** | `index.ts:5177, 5201` ยังโชว์หมวด "Receipts (DM Only)" ใน /help |

---

## 3. ⏰ Cron Jobs

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| `deposit-reminder-hourly` | ✅ ผ่าน | unschedule แล้ว |
| `deposit-reminder-daily` | ✅ ผ่าน | ไม่พบใน `cron.job` |
| Receipt-related cron | ✅ ผ่าน | ไม่มี cron ที่ reference receipt/deposit แล้ว |
| `CronJobs.tsx` — แสดงผลในหน้า admin | ✅ ผ่าน | ลบ description ของ deposit-reminder แล้ว |

---

## 4. ⚡ Edge Functions (Deno)

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| `receipt-submit`, `receipt-quota`, `receipt-monthly-report` | ✅ ผ่าน | ลบแล้ว |
| `deposit-submit`, `deposit-reminder` | ✅ ผ่าน | ลบแล้ว |
| `google-drive-upload`, `google-sheets-append` | ✅ ผ่าน | ลบแล้ว |
| `google-oauth` | ❌ **ยังอยู่** | AI claim ลบแล้วแต่จริงๆ ยังมีโฟลเดอร์ — ใช้แค่กับ Google Drive (receipt) ต้องลบ |
| `line-webhook/handlers/receipt-handler.ts` | ✅ ผ่าน | ลบแล้ว |
| `line-webhook/index.ts` — `handleImageMessage()` | ✅ ผ่าน | stub ดี (log + ignore) |
| `line-webhook/index.ts` — dead helpers | ⚠️ **dead code** | บรรทัด 8589–~9000 มี `downloadLineImage`, `getDocumentTypeName`, `computeImageHash`, `classifyDocumentType`, `extractDepositDataFromImage`, `determineTransferType`, `buildReimbursementFlex`, `buildDepositFlex` — ไม่ถูกเรียกใช้แล้ว ลบทิ้งได้ปลอดภัย (~400+ บรรทัด) |
| `index.ts:7876` — `from("receipt_approvers")` | ❌ **ต้องลบ** | query table ที่ drop ไปแล้ว → จะ error 500 ถ้า code path นี้ถูกเรียก |

---

## 5. 🗄️ Database

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| Tables หลัก (receipts, receipt_items, daily_deposits ฯลฯ) | ✅ ผ่าน | drop ครบ |
| `receipt_categories` | ❌ **ต้องลบ** | table ยังเหลือ |
| `receipt_ocr_corrections` | ❌ **ต้องลบ** | table ยังเหลือ |
| Functions `update_receipts_updated_at()`, `update_receipt_settings_updated_at()` | ❌ **ต้องลบ** | orphan triggers |
| `webapp_page_config` rows | ❌ **ต้องลบ** | ยัง 2 rows: `/attendance/deposits`, `/attendance/deposit-settings` (menu_group=`Deposits`) |
| `portal_faqs` (receipts) | ✅ ผ่าน | 0 rows |

---

## 6. 🪣 Storage Buckets

| Bucket | สถานะ | หมายเหตุ |
|---|---|---|
| `deposit-slips` | ❌ **ยังอยู่** | empty แต่ยังไม่ลบ — ต้อง drop |
| `receipt-files` | ❌ **ยังอยู่** | ยังอยู่ — ต้อง drop (ตอน Phase 2 บอกว่า manual แต่ลบผ่าน SQL ได้ถ้า empty) |

---

## 7. 🎨 Frontend UI Residuals

| ไฟล์ | สถานะ | หมายเหตุ |
|---|---|---|
| `src/pages/portal/ManagerDashboard.tsx` | ❌ **ต้องแก้** | ยังมี `counts.deposits`, label "ใบฝากเงิน", path `/portal/deposit-review-list` (route ตายแล้ว → คลิกแล้ว 404) |
| `src/lib/portal-actions.ts` | ⚠️ comment เก่า | บรรทัด 18, 20 — comment อ้าง deposit-upload (ลบ comment) |
| `src/lib/translations.ts:188` | ⚠️ unused key | `deposit: { th: 'ฝากเงิน', en: 'Deposit' }` — ลบ key ได้ |
| `src/pages/FeatureFlags.tsx:62` | ⚠️ unused option | dropdown `'deposit'` category — ลบ option |
| `src/pages/PreDeployChecklist.tsx:65` | ⚠️ unused checklist | "Test deposit slip upload" item — ลบ |
| `src/pages/settings/RoleManagement.tsx:123` | ❌ **ต้องลบ** | `'Deposits'` permission group ยังโชว์ในหน้า role config |
| `src/pages/settings/CuteQuotesSettings.tsx` | ⚠️ deposit option | ตัวเลือก "ฝากเงิน (Deposit)" ใน show_time, depositChance state, slider UI |
| `src/hooks/useCuteQuotes.ts` | ⚠️ deposit option | type `'deposit'` ใน show_time, deposit_chance setting |
| `src/components/attendance/LivenessCamera.tsx:12` | ⚠️ unused enum | `eventType?: 'deposit'` — ลบ |

> **CuteQuotes deposit option**: ถ้าจะ "เก็บไว้ใช้กับเหตุการณ์อื่น" ก็ปลอดภัย (UI เลือกได้แต่ไม่มี trigger เรียก) แต่ถ้าจะให้สะอาดก็ลบ

---

## 8. 📦 portal-data Edge Function

| Endpoint / Block | สถานะ | หมายเหตุ |
|---|---|---|
| `case 'check-today-deposit'` (line 1019) | ❌ **ต้องลบ** | query `daily_deposits` ที่ drop แล้ว → 500 error |
| `case 'my-receipt-quota'` (line 1048) | ❌ **ต้องลบ** | query `receipt_usage`, `receipt_subscriptions`, `receipt_plans` (drop หมด) → 500 error |
| `pending-counts` deposit query (line 640–700) | ❌ **ต้องลบ** | `from('daily_deposits')` → 500 error เมื่อ ManagerDashboard เรียก |
| `notify_receipts` field (line 1540) | ⚠️ unused | เหลือใน notification preferences default |

---

## 9. 📚 Documentation

| ไฟล์ | สถานะ |
|---|---|
| `SYSTEM_SYNC_CHECKLIST.md` — section 5 (Receipt), 6 (Deposit), 7 (Deposit Detection) | ⚠️ ลบ section ออก |
| `README.md`, `CLAUDE.md`, `index.html` `<title>` | ⚠️ ยังไม่ rebrand เป็น HR-only |

---

## 🎯 สรุปลำดับความสำคัญ

### 🔴 P0 — ของพังทันที (ต้องแก้ก่อน deploy)
1. **portal-data**: ลบ 3 cases (`check-today-deposit`, `my-receipt-quota`, `pending-counts` deposit block) — ป้องกัน 500 error
2. **ManagerDashboard.tsx**: ลบ deposit card + count + path ตาย
3. **line-webhook index.ts:7876**: ลบ query `receipt_approvers`
4. **DB**: drop `receipt_categories`, `receipt_ocr_corrections`, 2 orphan functions
5. **bot_commands table**: delete 6 receipt rows
6. **webapp_page_config**: delete 2 deposit rows
7. **Storage**: drop buckets `receipt-files`, `deposit-slips`

### 🟡 P1 — ขยะที่กวน (รอบเดียวจบ)
8. ลบ dead helpers ใน line-webhook (~400 บรรทัด)
9. ลบ category `'receipt'` ใน /help (index.ts:5177, 5201)
10. ลบ edge function `google-oauth`
11. RoleManagement: ลบ `'Deposits'` group
12. ManagerDashboard ใช้ pending-counts → ต้องอัปเดต field interface

### 🟢 P2 — เก็บกวาดเล็กๆ
13. translations.ts, FeatureFlags.tsx, PreDeployChecklist.tsx, LivenessCamera.tsx — ลบ keys/options ที่ไม่ใช้
14. CuteQuotesSettings + useCuteQuotes — ลบ deposit option (ถ้าตัดสินใจลบ)
15. portal-actions.ts — ลบ comment เก่า
16. SYSTEM_SYNC_CHECKLIST.md — ลบ section 5/6/7
17. notify_receipts field ใน notification defaults

---

## ❓ คำถามก่อนรัน Phase 4

1. **CuteQuotes `'deposit'` option** — เก็บไว้ (เผื่ออนาคต) หรือลบให้เกลี้ยง?
2. **Storage buckets** — drop ทั้งคู่เลยใช่ไหม? (`deposit-slips` + `receipt-files`)
3. **Rebrand index.html/README** — ทำใน Phase 4 นี้เลย หรือแยกเป็น Phase 5?

ตอบ 3 ข้อนี้แล้วผม execute Phase 4 ครบทุก P0 + P1 + P2 ในรอบเดียวครับ 🚀