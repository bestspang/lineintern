## เป้าหมาย

ทำให้ทุก part / feature / UI / help / FAQ / bot command **sync กันจริง** หลังจาก Phase 1B–1D เพิ่ม feature ใหม่หลายตัว และวาง **กันชน** ที่บังคับให้ AI รอบหน้าไม่กลับมาแก้ของที่ดีอยู่แล้วให้พัง

วิธีของผมจะ **ไม่ "rewrite ทั้งแอป"** — เพราะนั่นคือต้นตอที่ทำให้ AI พังของเดิม ตามที่ `.lovable/AI_GUARDRAILS.md` (rule "If The User Says Fix Everything") เตือนไว้

---

## สถานะปัจจุบัน (วัดจริงก่อนวางแผน)

- `npm run audit:consistency` → 7 pass / 0 fail / 0 warn (route, command-parser, portal-actions, supervisor role, FAQ category ทั้งหมด sync)
- `npm run smoke:quick` → 16 pass / 0 fail (DB ไม่มี receipt/deposit ค้าง, registry-snapshot ตรง, bot_commands 27 ตัวตรงกับ parser)
- DB: `portal_faqs` 35 รายการ / 4 หมวด, `bot_commands` 27 ตัว, `webapp_page_config` ยังไม่ถูก audit เทียบกับ route 70 ตัวใน snapshot

**แปลว่าโครงสร้างไม่ drift** — สิ่งที่ user เห็นว่า "ไม่ทันกัน" คือ **content drift** (FAQ/help text) และ **interaction drift** (ปุ่มใหม่ที่ยังไม่เคยมีคนกดจริง) ไม่ใช่ structural drift

---

## ขอบเขตที่จะทำ (3 phase, อนุมัติทีละ phase)

### Phase A — Drift Discovery (read-only, ไม่แก้โค้ดเลย)

ผมจะสร้าง **drift report** ที่ `docs/PHASE_1E_DRIFT_REPORT.md` โดยเทียบ:

1. **Help / FAQ vs Features ใหม่**
   - feature ใหม่ตั้งแต่ Phase 1B: Daily Missions, Achievement Badges, Notification Center, Notification Preferences, Manager Dashboard, Remote Checkout, Resend Portal Link, OpsCenter Connection Check, GPS retry UX, Gacha Box, Streak Shield bag
   - หาว่าตัวไหน **ยังไม่มี** ใน `portal_faqs` หรือ `Help.tsx`
   - หาว่า FAQ ที่มีอยู่อันไหน **ข้อความล้าสมัย** (อ้าง flow เก่า)

2. **Bot commands `/help` flex message vs `bot_commands` DB**
   - คำสั่งใน DB 27 ตัว → render ใน `/help` ครบไหม
   - คำสั่งที่ disabled อยู่ใน DB ยังโผล่ใน UI ไหม

3. **Admin sidebar vs route ใหม่**
   - route ใน `App.tsx` 121 ตัว vs entry ใน `DashboardLayout.tsx`
   - หาว่า page ไหนเข้าถึงได้แค่จาก URL ตรง (ไม่มีปุ่ม nav)

4. **`webapp_page_config` coverage**
   - query DB → list admin route ที่ **ไม่มี** row config → `usePageAccess` จะ default deny
   - report เท่านั้น (ไม่เพิ่ม row จนกว่าจะอนุมัติ)

5. **ปุ่มที่ยังไม่เคย verify ด้วยมือ** (จาก Phase 1D ล่าสุด)
   - Resend Portal Link button → คลิกจริงในเบราว์เซอร์
   - OpsCenter Connection Check → คลิกจริง
   - OpsCenter StatCard navigation (Setup Issues, Pending Actions) → คลิกจริง
   - GPS retry / error UX บน `/attendance` → trigger จริง
   - ทุกข้อรายงานเป็น `[ ] ผ่าน` / `[x] พบปัญหา + root cause`

**Deliverable Phase A**: 1 markdown file รายงานรวม + categorize "ต้องแก้" vs "OK" vs "informational"

---

### Phase B — Fix Confirmed Drift (additive only, อนุมัติรายการก่อนแก้)

หลัง Phase A user เห็นรายการแล้ว เลือกว่าจะแก้ตัวไหน ผมจะแก้แบบ:

- **FAQ ขาด** → INSERT row ใหม่ใน `portal_faqs` ผ่าน migration (additive — ไม่ลบของเดิม)
- **FAQ ล้าสมัย** → UPDATE row เฉพาะที่เห็นชอบ (มี diff ก่อนเสมอ)
- **`/help` flex ไม่ครบ** → แก้ template ใน `line-webhook/index.ts` แบบเพิ่ม entry เท่านั้น
- **Sidebar ขาด** → เพิ่ม nav item ใน `DashboardLayout.tsx` (ไม่ย้าย ไม่ลบของเดิม)
- **ปุ่ม UI พังจริง** → fix แบบ minimal diff + ทดสอบในเบราว์เซอร์ก่อน commit

**ทุกครั้ง**: run `npm run audit:consistency` + `npm run smoke:quick` ก่อน-หลัง, ต้อง 0 fail ทั้งสองรอบ

---

### Phase C — Regression Prevention (กันชนสำหรับ AI รอบหน้า)

ปัญหาที่ user เจอซ้ำ ๆ คือ "AI ชอบแก้ของที่ดีอยู่แล้วให้พัง" ผมจะเพิ่ม **3 ชั้นกัน**:

1. **ขยาย consistency-audit ให้ครอบคลุมขึ้น**
   - เพิ่ม Check C10: `bot_commands.is_enabled=true` ทุกตัวต้องมี keyword ปรากฏใน `/help` template ของ `line-webhook/index.ts`
   - เพิ่ม Check C11: feature ที่ขึ้นทะเบียนใน `.lovable/feature-registry.json` (ไฟล์ใหม่) ต้องมี row ใน `portal_faqs` หรือ `Help.tsx` อย่างน้อย 1 entry
   - เพิ่ม Check C12: `// ⚠️ VERIFIED` marker count ห้ามลดลงเทียบกับ baseline ใน `.lovable/verified-baseline.json`
   - ถ้า count ลด → exit 1 (ตรวจจับ AI ลบ marker เพื่อ "clean up")

2. **ไฟล์ feature registry ใหม่** `.lovable/feature-registry.json`
   - ลิสต์ feature user-facing ทุกตัว + ผูกกับ: route, nav entry, FAQ keys, command keys, edge function
   - AI รอบหน้าเปิดอ่านไฟล์นี้ก่อนแก้ → รู้ว่า feature นี้กระทบกี่จุด
   - ใช้เป็น input ของ audit script

3. **Pre-edit checklist hook** ใน `.lovable/AI_GUARDRAILS.md`
   - เพิ่ม section "Before editing any feature listed in feature-registry.json, run `node scripts/feature-impact.mjs <feature-key>` ที่จะ print ทุก file ที่ต้องเช็คพร้อมกัน"
   - script ใหม่ `scripts/feature-impact.mjs` — read-only, แสดง dependency map ของ feature นั้น

**ผลลัพธ์**: ครั้งต่อไป AI พิมพ์ "ฉันจะ refactor X" → script เตือนทันทีว่า X กระทบ 5 ไฟล์ + 3 FAQ + 1 command → AI จะลังเลก่อนแตะ

---

## สิ่งที่ **จะไม่ทำ** (เพื่อกันการพังของเดิม)

- ❌ ไม่แตะ `// ⚠️ VERIFIED` files (line-webhook/index.ts, portal-data, attendance-submit, employee-documents, timezone modules)
- ❌ ไม่ rewrite Help.tsx, ไม่ rewrite OpsCenter card
- ❌ ไม่ migration ที่ลบ/rename column
- ❌ ไม่แก้ schema (`employees`, `portal_faqs`, `bot_commands`)
- ❌ ไม่ผูก `.env` กับ LIVE LINE webhook ref
- ❌ ไม่ลบ FAQ เก่า (เพิ่ม/อัพเดทเท่านั้น)

---

## ขออนุมัติ

ผมจะเริ่ม **Phase A เท่านั้น** ก่อน — produce drift report → user อ่าน → เลือก scope ของ Phase B → จบแล้วค่อยทำ Phase C

ถ้า user ตกลง พิมพ์ "Approve Phase A" หรือบอกให้ปรับ scope ก่อน
