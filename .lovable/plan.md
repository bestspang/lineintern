# Phase B — FAQ Sync + Sidebar Fix

อ้างอิงผลตรวจจาก `docs/PHASE_1E_DRIFT_REPORT.md` (Phase A)

## เป้าหมาย
ปิด content drift ระหว่างฟีเจอร์ที่ ship แล้วกับ Portal FAQ + เคลียร์ sidebar gap โดยไม่แตะ schema, ไม่ลบ FAQ เดิม, ไม่ยุ่งกับไฟล์ `// ⚠️ VERIFIED`

## งานที่จะทำ

### 1) เพิ่ม FAQ ใหม่ 6 หัวข้อ (INSERT `portal_faqs`)
ทุกแถว: `is_active=true`, มี `question_th/question_en/answer_th/answer_en`, category อิงของเดิมใน DB

1. **Daily Missions** — category `points` — "ภารกิจรายวันคืออะไร / ทำอย่างไรถึงจะได้ครบ"
2. **Achievement Badges** — category `points` — "เหรียญตรา Bronze/Silver/Gold ได้มายังไง / ดูได้ที่ไหน"
3. **Gacha Box** — category `points` — "กาชาคืออะไร / สุ่มได้กี่ครั้งต่อวัน / ของในกระเป๋าหมดอายุไหม"
4. **Notification Center** — category `portal` (หรือ general ตามที่มีอยู่) — "การแจ้งเตือนในพอร์ทัลอยู่ตรงไหน / real-time แค่ไหน"
5. **Notification Preferences (Manager)** — category `portal` — "หัวหน้าเปิด/ปิดการแจ้งเตือนคำขอได้อย่างไร"
6. **Manager Dashboard** — category `portal` — "เมนูอนุมัติ/สรุปทีมของหัวหน้าใช้อย่างไร"

### 2) อัปเดต FAQ เดิม 2 หัวข้อ (UPDATE `portal_faqs`)
1. **Remote Checkout** — อัปเดต `answer_th/en` ให้ตรงกับ approval flow ปัจจุบัน (manager อนุมัติผ่าน notification + audit)
2. **Direct Check-in Fallback** — อัปเดตให้ตรงกับ token-based access ปัจจุบัน (ไม่ผ่าน LINE webhook ก็ใช้ได้)

ทำผ่าน `supabase--insert` tool (INSERT + UPDATE) — ไม่ต้อง migration เพราะไม่แตะ schema

### 3) Sidebar fix
- เพิ่มเมนู **`/attendance/flexible-day-off`** เข้าใน `DashboardLayout.tsx` ใต้กลุ่ม Attendance Admin (อยู่หลัง "Day Off Settings" หรือใกล้เคียง) — เป็น additive nav entry เท่านั้น
- ไม่แตะ `/overview` (เป็น alias ของ `/` ตามที่ระบุใน Phase A — เจตนาเดิม)

### 4) Verify
- รัน `npm run audit:consistency` → ต้อง 7/0/0
- รัน `npm run smoke:quick` → ต้อง 16/0
- เปิด `/p/help` ใน preview ตรวจว่า FAQ ใหม่ขึ้นและค้นหาเจอ
- เปิด admin sidebar ตรวจว่าเมนู Flexible Day Off โผล่

### 5) Docs
- อัปเดต `docs/PHASE_1E_DRIFT_REPORT.md` ทำ checkbox Phase B done + ระบุจำนวนแถวที่ INSERT/UPDATE จริง
- อัปเดต `docs/STATUS.md` 1-2 บรรทัด

## สิ่งที่ "ไม่แตะ"
- ไม่แตะ `portal_faqs` schema / RLS
- ไม่ลบหรือ deactivate FAQ เดิม 35 แถว
- ไม่แตะ `bot_commands`, `webapp_page_config`
- ไม่แตะไฟล์ `// ⚠️ VERIFIED` (line-webhook handlers, attendance core, timezone utils)
- ไม่แตะ `/menu` handler, `employee_menu_tokens`, `portal_performance_events`
- ยังไม่ทำ Phase C (guardrails) — จะเสนอแยกหลัง Phase B ผ่าน

## ไฟล์ที่จะแก้
- DB (ผ่าน `supabase--insert`): `portal_faqs` (+6 INSERT, ~2 UPDATE)
- `src/components/DashboardLayout.tsx` (+1 nav entry)
- `docs/PHASE_1E_DRIFT_REPORT.md`
- `docs/STATUS.md`

## Regression checklist
- [ ] FAQ เดิม 35 แถวยังครบ + ยัง active
- [ ] Sidebar เดิม 60 รายการยังอยู่ครบ + ลำดับไม่เปลี่ยน
- [ ] `audit:consistency` 7/0/0
- [ ] `smoke:quick` 16/0
- [ ] ไม่มีไฟล์ VERIFIED ถูกแก้
