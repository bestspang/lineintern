## เป้าหมาย
ตรวจ "ความสอดคล้อง" (consistency) ของระบบทั้งหมด — ทุก function/feature/UI ที่ผูกกัน ต้อง up-to-date กัน — **โดยไม่แตะของที่ทำงานดีอยู่แล้ว** และ **เพิ่มกลไกป้องกัน AI รอบถัดไปแก้ของดีให้พัง**

> Memory rule: "AI ชอบเข้าไปปรับ function ที่ทำงานได้ดีแล้วให้พัง" → แผนนี้ออกแบบมาเพื่อแก้ pattern นี้โดยตรง

---

## ผลการสำรวจ (sources of truth ที่มีอยู่แล้ว)

ระบบมี source-of-truth files เหล่านี้แล้ว (ดี — เราจะเสริม ไม่ใช่สร้างใหม่):
- `.lovable/registry-snapshot.json` — รายการ admin/portal routes + bot command types
- `.lovable/CRITICAL_FILES.md` — รายการไฟล์ห้ามแตะ + behavioral invariants
- `src/lib/portal-actions.ts` — canonical portal action registry (path↔role↔label)
- `scripts/smoke-test.mjs` — Phase 4.5 regression guard (16/16 ผ่าน)
- DB tables: `bot_commands` (27 rows), `portal_faqs` (35 rows, 4 categories), `webapp_page_config` (64 distinct paths)

## รายการ "consistency drift" ที่พบ (ที่ต้องแก้จริง)

| # | จุด | สถานะ | ความเสี่ยง |
|---|---|---|---|
| D1 | `Help.tsx` มี static fallback FAQ — เนื้อหาบางส่วน hardcoded ไม่ตรงกับ DB ปัจจุบัน (DB มี 35 / static มี ~15) | drift แต่ไม่พัง (DB มาก่อน static) | ต่ำ |
| D2 | Phone placeholder `02-XXX-XXXX` ใน Help.tsx | ไม่ใช่เบอร์จริง | ต่ำ — UX |
| D3 | `PortalLayout` bottom-nav ใช้ role string `'supervisor'` แต่ระบบจริงใช้ `'manager'` (ตาม CRITICAL_FILES) | อาจซ่อนปุ่ม Approvals ผิด role | กลาง |
| D4 | `webapp_page_config` มี ops-center/portal-performance ครบ 9 roles แล้ว (ผ่านจริง) | ✅ ตรง | — |
| D5 | `bot_commands` ครบ 27 รายการ ตรงกับ `command-parser.ts` commandMap | ✅ ตรง | — |
| D6 | Phone/email ใน Help.tsx เป็น placeholder | ผู้ใช้กดแล้วไม่ติดต่อใคร | ต่ำ |

**ที่ "ดีอยู่แล้ว" และห้ามแตะ:**
- `line-webhook/index.ts`, `attendance-submit`, `command-parser.ts`, `portal-data` — ทุก ⚠️ VERIFIED comment
- `EmployeeDocuments.tsx` — Phase 1A เสร็จแล้ว
- Bangkok timezone helpers, payroll, points ledger
- ปุ่ม UI ทั้งหมดใน Ops Center / Portal Performance — เพิ่งทำเสร็จ Phase 1B/1C

---

## แผนงาน 4 task (additive only, no refactor)

### Task 1 — สร้าง Cross-Surface Sync Audit Tool (กลไกป้องกัน)

สร้าง `scripts/consistency-audit.mjs` (read-only, ไม่ mutate อะไรเลย) ที่ตรวจ:

1. **Routes ↔ Snapshot** — ทุก route ใน `App.tsx` ต้องอยู่ใน `registry-snapshot.json` (smoke test มี F3 อยู่แล้ว — ไม่ซ้ำ)
2. **Routes ↔ webapp_page_config** — admin route ทุก path ต้องมี config (ตรวจหารายการ "missing")
3. **portal-actions.ts ↔ App.tsx** — ทุก `path` ใน `PORTAL_ACTIONS` ต้องมี route จริง
4. **bot_commands ↔ command-parser.ts** — ทุก `command_key` ใน DB ต้องมีใน `commandMap`/`ParsedCommand['commandType']`
5. **portal_faqs categories ↔ Help.tsx tabs** — ทุก category ใน DB ต้องมีใน Help tabs (ปัจจุบัน: attendance, leave-ot, points, general)
6. **Role strings consistency** — สแกนหา `'supervisor'` ในโค้ดที่ไม่ควรมี (ระบบใช้ `'manager'`)
7. **CRITICAL_FILES.md ↔ filesystem** — ไฟล์ที่ระบุว่า P0/P1 ยังมีอยู่จริง

Script จะ print `PASS/FAIL/WARN` แต่ละหัวข้อ พร้อมรายการ drift — ไม่แก้อะไรอัตโนมัติ

เพิ่ม npm script: `"audit:consistency": "node scripts/consistency-audit.mjs"`

### Task 2 — แก้ drift ที่พบจริง (เฉพาะที่ปลอดภัย)

D3 (สำคัญสุด): `src/components/portal/PortalLayout.tsx` line 30 → ลบ `'supervisor'` ออก (เหลือ `['manager','admin','owner']`) — แก้ 1 บรรทัด, additive ที่จริงคือ "ลด" ที่ไม่มีผล เพราะ DB ไม่มี role 'supervisor' แล้ว

D2/D6 (cosmetic): เพิ่ม comment `// TODO: replace with real contact via api_configurations` แทนการแก้เนื้อหา — ให้ user ใส่เบอร์จริงเอง ไม่ทำเป็น dynamic เพราะเสี่ยง over-engineering

D1 (drift FAQ): **ไม่แก้** — static fallback ออกแบบมาเป็น safety net เฉพาะตอน DB error เท่านั้น (ดู comment ⚠️ VERIFIED 2026-02-03) → แค่บันทึกใน sync doc

### Task 3 — เพิ่ม "AI Guard Header" pattern ที่ไฟล์เสี่ยง

เพิ่ม comment block สั้นๆ ที่ส่วนบนของไฟล์ที่ AI ชอบเข้ามาแก้ผิดบ่อย (เลือก 5 ไฟล์ที่เสี่ยงสุด):
- `src/pages/portal/PortalHome.tsx`
- `src/pages/portal/CheckInOut.tsx`
- `src/pages/attendance/OpsCenter.tsx`
- `src/pages/attendance/PortalPerformance.tsx`
- `src/components/portal/PortalLayout.tsx`

Pattern (ตามที่ใช้อยู่แล้ว):
```ts
/**
 * ⚠️ VERIFIED 2026-04-29 — STABLE, DO NOT REFACTOR
 * Touchpoints: <list of cross-surface dependencies>
 * Allowed changes: additive UI only (new card, new button)
 * Forbidden: changing data fetch, role gating, navigation, layout grid
 * If a fix is required: open issue, document scope, get user OK first.
 */
```

### Task 4 — อัปเดตเอกสาร "ความสัมพันธ์ข้ามฟีเจอร์"

สร้าง/อัปเดต `SYSTEM_SYNC_CHECKLIST.md` ให้มี section ใหม่:
- **Cross-surface dependency map** — ตารางว่า "ถ้าเปลี่ยน X ต้องอัปเดต Y, Z ด้วย"
  - เปลี่ยน bot command → อัปเดต `bot_commands` table + `command-parser.ts` + `Help.tsx`
  - เพิ่ม admin route → อัปเดต `App.tsx` + `webapp_page_config` + `DashboardLayout.tsx` + `registry-snapshot.json`
  - เพิ่ม portal action → อัปเดต `portal-actions.ts` + `App.tsx` + `Help.tsx` quick actions
  - เปลี่ยน FAQ category → อัปเดต `portal_faqs` table + `Help.tsx` tabs
- ลิงก์ไปที่ `consistency-audit.mjs` ใหม่

---

## ไฟล์ที่จะเปลี่ยน (สรุป)

| ไฟล์ | Action | ขนาดประมาณ |
|---|---|---|
| `scripts/consistency-audit.mjs` | สร้างใหม่ | ~250 บรรทัด |
| `package.json` | เพิ่ม 1 script | +1 บรรทัด |
| `src/components/portal/PortalLayout.tsx` | แก้ 1 บรรทัด (ลบ `'supervisor'`) | -1 บรรทัด |
| `src/pages/portal/PortalHome.tsx` | เพิ่ม guard comment | +8 บรรทัด |
| `src/pages/portal/CheckInOut.tsx` | เพิ่ม guard comment | +8 บรรทัด |
| `src/pages/attendance/OpsCenter.tsx` | เพิ่ม guard comment | +8 บรรทัด |
| `src/pages/attendance/PortalPerformance.tsx` | เพิ่ม guard comment | +8 บรรทัด |
| `SYSTEM_SYNC_CHECKLIST.md` | เพิ่ม cross-surface dep map section | ~80 บรรทัด |
| `.lovable/CRITICAL_FILES.md` | เพิ่มอ้างอิงถึง audit script | +5 บรรทัด |

**ห้ามแตะ:**
- ทุกไฟล์ใน `.lovable/CRITICAL_FILES.md` P0
- Edge functions ทุกตัว
- DB schema (ไม่มี migration ใหม่)
- ปุ่ม/UI behavior ที่มีอยู่
- `Help.tsx` content (แค่อ่าน, ไม่แก้)
- Bot commands, FAQ data

---

## เกณฑ์ตรวจสอบ (acceptance)

1. `npm run audit:consistency` รันได้ผ่าน รายงาน drift ครบทุกหัวข้อ
2. `npm run smoke:quick` ยังผ่าน 16/16
3. ทุก ⚠️ VERIFIED comment เดิมยังอยู่ครบ
4. ไม่มี behavioral change ที่ผู้ใช้สังเกตได้ (UI, ปุ่ม, route, ข้อความ — เหมือนเดิมหมด)
5. มี mechanism ใหม่ให้ AI รอบถัดไปเช็คก่อนแก้ (`audit:consistency` + AI Guard Headers)

---

## รายงานสุดท้ายจะมี
1. รายการ drift ที่พบ (จาก audit script รันครั้งแรก)
2. ไฟล์ที่แก้จริง + diff สรุป
3. ไฟล์ที่ "พบ drift แต่ไม่แก้" + เหตุผล
4. ผล build + smoke + audit
5. คำแนะนำให้ user รัน `npm run audit:consistency` ก่อน sign-off Phase ใหม่ทุกครั้ง
6. Verdict: SYSTEM CONSISTENT / DRIFT FOUND (with list)