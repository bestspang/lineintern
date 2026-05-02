## สรุป: งานนี้ใหญ่กว่าที่คุยตอนแรก — ขอเสนอเวอร์ชันที่ทำงานได้จริง

ผม audit พบว่าระบบมี **80+ หน้า, 88 edge functions, 27 commands, 33+ FAQs** การจะ "เช็คทุกอย่าง" ในรอบเดียวเป็นไปไม่ได้ และจะกลายเป็นสิ่งที่คุณกลัวที่สุด — AI ลงไปแตะของที่ดีอยู่แล้ว

ผมขอเสนอเป็น **3 มินิแผน** ที่ทำในรอบนี้ได้จริง + ระบบป้องกันถาวร:

---

## ส่วนที่ 1: AI Regression Prevention (ทำก่อน — สำคัญสุด)

นี่คือ **เกราะระยะยาว** ที่จะหยุดปัญหาที่คุณเจอ ทำเสร็จแล้วทุกครั้งที่คุณ (หรือ AI คนอื่น) แก้โค้ด ระบบจะเตือนทันที

### 1A. ขยาย `.lovable/CRITICAL_FILES.md`
รวม list ไฟล์ที่ห้ามแก้ + เหตุผล + วิธีแก้ที่ปลอดภัย:
- `command-parser.ts`, `index.ts` (line-webhook), `timezone.ts`
- `useUserRole.ts`, `usePageAccess.ts`, `ProtectedRoute.tsx`
- `attendance-submit/`, `point-attendance-calculator/`
- All migrations (locked)

### 1B. เพิ่ม `// ⚠️ VERIFIED YYYY-MM-DD` markers บน hot functions
เลือกแค่ ~15 functions critical ที่สุด (ไม่ทำทั้งโค้ดเบส):
- `parseCommand`, `shouldTriggerBot` (command-parser)
- `formatBangkokISODate`, `getBangkokNow` (timezone)
- `has_role`, `has_admin_access` (auth — DB แล้ว แต่จะมี wrapper)
- `attendance-submit` validators
- `point-attendance-calculator` core
- เกณฑ์: function ที่ถ้าพังจะกระทบหลายฟีเจอร์

### 1C. ขยาย `scripts/smoke-test.mjs`
เพิ่ม checks ที่ run ได้ในไม่กี่วินาที:
- Edge functions แต่ละตัวตอบ 200/401 (ไม่ใช่ 500/404)
- bot_commands DB ทุก `command_key` มี handler ใน `command-parser.ts`
- Routes ใน `App.tsx` ทุก route component import ถูก
- Critical tables ยัง exist (`employees`, `attendance_logs`, ฯลฯ)

### 1D. สร้าง `.lovable/AI_GUARDRAILS.md` — คู่มือสำหรับ AI agent
รายการสิ่งที่ AI ต้องเช็คก่อนแก้:
- "ก่อนแก้ command — เช็ค bot_commands table + parser อย่าลบ alias เก่า"
- "ก่อนแก้ migration — สร้างใหม่ ห้ามแก้ของเก่า"
- "ก่อนแก้ point logic — รัน read_query ดู transactions ล่าสุดก่อน"
- "ก่อนลบ button/route — grep ทั่วโปรเจ็คว่ามี link/redirect มาที่นี่ไหม"

---

## ส่วนที่ 2: Help/Commands Sync (Phase 1)

ตรวจที่กลัวจะไม่ sync จริง:

### 2A. ตรวจ `/history` ที่หายจาก bot_commands DB
- Parser มี handler แต่ DB ไม่มี entry → `/help` จะไม่แสดง
- **Fix**: เพิ่ม row ใน bot_commands ผ่าน insert tool (หลังคุณยืนยัน)

### 2B. Sync Help.tsx STATIC_FAQS กับ portal_faqs DB
- DB เป็น source of truth (33+ items)
- STATIC_FAQS เป็น fallback ตอน DB load fail
- **Action**: ตรวจว่า fallback ครอบคลุมหัวข้อหลัก (attendance, points, leave, bag) ตามที่ DB มี — ไม่ overwrite ทั้งก้อน แค่ patch ส่วนที่หาย

### 2C. ตรวจว่าทุก command_key ใน DB → มี handler ใน webhook
สร้าง audit script (run ครั้งเดียว) เทียบ:
- bot_commands DB rows
- command-parser.ts commandMap entries
- line-webhook/index.ts switch cases

ถ้าเจอ orphan → รายงานให้คุณ ไม่แก้เอง

---

## ส่วนที่ 3: Quick UI/UX Spot Check (Phase 2 limited)

แทนที่จะ test ทุกหน้า (ไม่จริง) ขอ test เฉพาะ **Top 5 hottest pages** ที่ user กดบ่อยสุดผ่าน browser tool:
1. `/attendance/dashboard` (admin landing)
2. `/p/` (portal home)
3. `/p/checkinout` (action ที่สำคัญสุด)
4. `/p/mypoints` (gamification heart)
5. `/p/help` (ที่คุณห่วงเรื่อง sync)

เช็คว่า: ปุ่มหลักทำงาน, ไม่มี console error, ไม่มี dead button

---

## ส่วนที่จะ "ไม่ทำ" ในรอบนี้ (ตั้งใจ)

- ❌ ไม่ refactor function ใดๆ ที่มี VERIFIED marker
- ❌ ไม่แก้ migration เก่า
- ❌ ไม่ลบ/เปลี่ยน command alias เก่า
- ❌ ไม่ rewrite STATIC_FAQS ทั้งก้อน
- ❌ ไม่ test 80 หน้าหมด — เลือก top 5 ที่กระทบ user มากสุด

## Risk Matrix

| Action | Risk | Mitigation |
|--------|------|-----------|
| เพิ่ม VERIFIED comments | Very Low | เป็น comment เฉยๆ |
| ขยาย CRITICAL_FILES.md | Zero | เป็น docs |
| เพิ่ม row ใน bot_commands | Low | ใช้ insert tool, รีวิวก่อน |
| Smoke test script | Low | run-only ไม่แก้ data |
| Spot check 5 pages | Zero | read-only browser |
| Sync FAQ static | Low-Med | เพิ่มเท่านั้น ไม่ลบของเก่า |

## Output ที่คุณจะได้

1. **`/mnt/documents/audit-report.md`** — สรุปทุกสิ่งที่เจอ + ของที่ "ดูเหมือนจะมีปัญหาแต่ผมไม่กล้าแตะ" ให้คุณตัดสินใจ
2. ไฟล์ guard ใหม่ใน `.lovable/`
3. VERIFIED markers บน ~15 functions
4. Smoke test ที่ขยายแล้ว
5. Bug report ของหน้าที่ test ผ่าน browser

## เวลาประมาณ

3 ส่วนรวมกัน ~30-40 tool calls — ทำในรอบนี้ได้จบ ไม่กระทบ user

---

**กดอนุมัติแล้วผมเริ่มเลยตามลำดับ 1 → 2 → 3 ครับ**

ถ้าอยากปรับ scope บอกได้ เช่น "ข้ามส่วน 3" หรือ "เน้นแค่ Help sync"
