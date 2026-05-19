## Phase D — Lock-in & Validation

Phase A (audit), B (FAQ + sidebar), C (feature-registry + guardrails) เสร็จแล้ว Phase D คือทำให้ guardrail "บังคับใช้จริง" และเคลียร์รายการ manual QA ที่ค้างจาก Phase 1D

---

### 1) Validate guardrail ทำงานจริง (ไม่ใช่แค่มีไฟล์)
- จงใจลบ `// ⚠️ VERIFIED` 1 marker ใน working copy แล้วรัน `npm run audit:consistency` → ต้องได้ C12 FAIL พร้อม diff รายไฟล์ → ใส่กลับ
- รัน `node scripts/feature-impact.mjs` โดยไม่ใส่ argument → ต้อง list 13 keys
- รันกับทั้ง 13 keys → ต้องไม่มี key ใด crash หรือชี้ไป route/file ที่ไม่มีจริง
- เช็คว่า `feature-registry.json` ทุก `routes[]` มี match จริงใน `src/App.tsx` (ถ้าไม่มี → แก้ registry ไม่ใช่แก้ route)

### 2) ผูก guardrail เข้า workflow ที่ AI ต้องเจอ
- เพิ่ม `"preinstall:guardrail": "node scripts/consistency-audit.mjs --offline"` หรือ npm script `check` ที่รวม `audit:consistency` + `smoke:quick` → ระบุใน `AI_GUARDRAILS.md` ว่าให้รันก่อน commit ใหญ่
- เพิ่ม flag `--offline` ใน `consistency-audit.mjs` ให้ข้าม check ที่ต้อง `psql` (C1, C10, C11 ที่ดึง DB) เพื่อให้ AI รันได้แม้ไม่มี DB access — return INFO แทน FAIL สำหรับ check เหล่านั้น
- เพิ่ม banner ใน `console.log` ตอนเริ่ม audit: "ถ้า check ใหม่ fail = AI กำลัง drift, อย่า disable check, ให้แก้ root cause"

### 3) เคลียร์ Phase 1D Manual-QA (5 ปุ่ม) ผ่าน browser tool ที่ปลอดภัย
ใช้ `browser--navigate_to_sandbox` + `browser--observe`/`screenshot` เช็คเฉพาะ render + disabled state — **ไม่กดปุ่ม mutating** (Approve/Reject/Resend จริง)
- [ ] `/attendance/employees` — เปิดหน้า, screenshot, ยืนยัน Resend Portal Link button render + disabled เมื่อไม่มี line_user_id
- [ ] `/attendance/ops-center` — เปิด, ยืนยัน "ตรวจการเชื่อมต่อ" button + StatCard เป็น clickable links ไป path ถูก
- [ ] `/attendance` token page — เปิดด้วย token ปลอม/หมดอายุ, ยืนยัน Thai error map ถูก (ไม่ใช่ raw English)
- [ ] OpsCenter StatCards → ตรวจ `<a href>` ใน DOM ว่าชี้ `/attendance/employees`, `/branches`, `/portal/approvals/*` ตามสเปก
- บันทึกผลใน `docs/PHASE_1E_DRIFT_REPORT.md` §5 (เปลี่ยนช่อง `[ ]` เป็น `[x]` พร้อมหมายเหตุ)

### 4) Coverage gap หลัง Phase C
ตอน Phase C เลือก 13 features ที่ "AI ชอบ regress" — ตรวจซ้ำว่ามี user-facing feature สำคัญที่หลุดจาก registry ไหม:
- ตรวจ `src/pages/portal/*.tsx` ทุกไฟล์ vs `feature-registry.json` → list ไฟล์ที่ไม่ถูก map
- ถ้าเจอ critical (เช่น Leave/OT request, Profile, Receipts portal) → เพิ่มเข้า registry (เฉพาะที่ AI ชอบแก้ผิด ไม่ทำให้บวม)
- ไม่ต้องครบ 100% — เพิ่มไม่เกิน 5 keys

### 5) Verification
- `npm run audit:consistency` → 9 pass / 0 fail / 3 info (เท่าเดิม) หรือดีกว่า
- `npm run audit:consistency --offline` → รันได้บนเครื่องไม่มี DB
- `npm run smoke:quick` → 16/0
- ทั้ง 13+ feature keys ผ่าน `feature-impact.mjs` ไม่มี broken reference
- Phase 1D §5 checklist → ครบทุกข้อ (pass หรือเขียน issue ชัดเจน)

### 6) Docs
- Append "Phase D — Executed" log ใน `docs/PHASE_1E_DRIFT_REPORT.md` (รวมผล manual-QA, coverage additions, guardrail validation)
- Update `docs/STATUS.md` 1 บรรทัด
- ถ้ามี feature key เพิ่ม → update `feature-registry.json._last_updated`

---

## สิ่งที่ "ไม่แตะ"
- `// ⚠️ VERIFIED` files ทุกไฟล์
- DB schema / RLS / FAQ data (Phase B จบแล้ว)
- ไม่กดปุ่ม mutating ใน live preview (Approve/Reject/Resend จริง)
- C1-C12 logic เดิม — เพิ่มเฉพาะ `--offline` flag
- ไม่เพิ่ม dependency ใหม่
- ไม่ refactor `consistency-audit.mjs` — เพิ่ม flag อย่างเดียว

## ไฟล์ที่จะแก้/สร้าง
- **EDIT** `scripts/consistency-audit.mjs` — เพิ่ม `--offline` flag + banner
- **EDIT** `package.json` — เพิ่ม script `check` (รวม audit + smoke)
- **EDIT** `.lovable/AI_GUARDRAILS.md` — ระบุ `npm run check`
- **EDIT** `.lovable/feature-registry.json` — เพิ่มได้สูงสุด 5 keys ถ้าจำเป็น
- **EDIT** `docs/PHASE_1E_DRIFT_REPORT.md` — Phase D log + §5 checklist updates
- **EDIT** `docs/STATUS.md`

## Regression checklist
- [ ] C1-C12 ทั้งหมด pass บน DB ปัจจุบัน
- [ ] `--offline` mode ไม่ false-fail บน check ที่ต้อง DB
- [ ] `smoke:quick` 16/0
- [ ] ทุก route ใน registry มีอยู่จริงใน App.tsx
- [ ] ไม่มี VERIFIED marker หาย
- [ ] ไม่มี FAQ ถูกแก้/ลบใน Phase นี้
- [ ] Manual-QA §5 ครบ 5 ข้อ
