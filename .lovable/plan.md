# Phase C — Anti-Drift Guardrails

## สถานะของ 2 งานแรกในข้อความ
- **Sidebar `/attendance/flexible-day-off`** — ✅ ทำในรอบก่อนแล้ว: `DashboardLayout.tsx:176` มีเมนู "Flexible Day-Off Config" → `/attendance/flexible-day-off` คู่กับ `/attendance/flexible-day-off-requests` ที่ `:175`. Route ใน `App.tsx:174` ตรงกัน
- **FAQ 2 รายการ** — ✅ ทำในรอบก่อนแล้ว: `46359bc7…` (Remote Checkout approval flow) และ `f46c6cb1…` (เช็คอินไม่ได้ + token fallback) อัปเดตใน DB เรียบร้อย

ยืนยันด้วย `psql` + `rg` แล้วในรอบนี้ — ไม่ต้องทำซ้ำ จะโฟกัส Phase C อย่างเดียว

---

## เป้าหมาย Phase C
สร้างรั้วป้องกันไม่ให้ AI รอบถัดไป:
- ลบ/แก้ฟีเจอร์ที่ทำงานอยู่โดยไม่รู้ตัว
- เพิ่ม route/command/feature ใหม่โดยไม่ sync DB หรือ FAQ
- ลบ `// ⚠️ VERIFIED` marker ที่กันของพังไว้

---

## งานที่จะทำ

### 1) สร้าง `.lovable/feature-registry.json` (ใหม่)
Source of truth ของฟีเจอร์ user-facing — โครงสร้าง:
```json
{
  "_purpose": "Feature → surfaces mapping. AI must read before editing any feature.",
  "_last_updated": "2026-05-19",
  "features": {
    "daily-missions": {
      "label_th": "ภารกิจรายวัน",
      "routes": ["/portal/my-points"],
      "nav_entries": [],
      "faq_keywords_th": ["ภารกิจรายวัน", "missions"],
      "edge_fns": [],
      "tables": ["happy_points", "point_transactions"],
      "verified_files": []
    },
    "achievement-badges": { ... },
    "gacha-box": { ... },
    "notification-center": { ... },
    "notification-preferences": { ... },
    "manager-dashboard": { ... },
    "remote-checkout": { ... },
    "direct-checkin-fallback": { ... },
    "resend-portal-link": { ... },
    "ops-center-health-check": { ... },
    "streak-shield": { ... },
    "flexible-day-off": { ... }
  }
}
```
รวมประมาณ 12-15 ฟีเจอร์ที่เป็น user-facing สำคัญ (ไม่ต้องครบทุกอย่าง — แค่ของที่ AI ชอบเข้าไปแก้)

### 2) สร้าง `.lovable/verified-baseline.json` (ใหม่)
สแน็ปช็อตจำนวน `// ⚠️ VERIFIED` markers ปัจจุบัน:
```json
{
  "_purpose": "Baseline for C12 — verified marker count must never drop below this.",
  "_generated_at": "2026-05-19",
  "marker_count": 17,
  "file_count": 17,
  "files": [ "<list of 17 files>" ]
}
```
รัน `rg "⚠️ VERIFIED"` เพื่อ generate ครั้งแรก

### 3) เพิ่ม 3 check ใหม่ใน `scripts/consistency-audit.mjs`
- **C10** — ทุก `bot_commands.is_enabled=true` ต้องมี handler ใน `command-parser.ts` (เช็คว่า `commandType` มีอยู่ใน parsedUnion) → ป้องกัน command พังเงียบ
- **C11** — ทุก `feature_key` ใน `feature-registry.json` ต้องมีอย่างน้อย 1 FAQ ที่ตรง keyword (TH หรือ EN) ใน `portal_faqs` **หรือ** มี static fallback ใน `Help.tsx` → ป้องกัน FAQ drift
- **C12** — นับ `⚠️ VERIFIED` marker ปัจจุบัน เทียบกับ `verified-baseline.json` → ถ้าน้อยกว่า baseline = FAIL พร้อม diff รายไฟล์ → ป้องกัน AI ลบ marker

C10/C11 ดึงข้อมูล DB ผ่าน `psql` (เหมือน check เดิม) — C12 อ่านไฟล์อย่างเดียว

### 4) สร้าง `scripts/feature-impact.mjs` (ใหม่)
CLI tool: `node scripts/feature-impact.mjs <feature-key>`
- อ่าน `feature-registry.json`
- พิมพ์รายการ routes / nav / FAQ / edge fn / verified files ที่เกี่ยวข้อง
- เตือน "READ THESE FILES BEFORE EDITING"
- ถ้า key ไม่มี → list keys ที่มีให้เลือก

ใช้เป็นเครื่องมือให้ AI เรียกก่อนแก้ฟีเจอร์

### 5) อัปเดต `.lovable/AI_GUARDRAILS.md`
เพิ่ม Step 1 checklist:
- "เปิด `.lovable/feature-registry.json` หาฟีเจอร์ที่เกี่ยวข้องก่อนแก้"
- "รัน `node scripts/feature-impact.mjs <key>` เพื่อดู surfaces ทั้งหมด"
- "อย่าลบ `⚠️ VERIFIED` marker — ถ้าจำเป็นต้องย้าย ให้ย้ายไฟล์อื่นทันที"
- ระบุว่า C10/C11/C12 จะ fail build ถ้าละเลย

### 6) Verify
- `npm run audit:consistency` → ต้อง 10 pass / 0 fail (เพิ่มจาก 7 → 10)
- `npm run smoke:quick` → ยัง 16/0
- รัน `node scripts/feature-impact.mjs daily-missions` ทดสอบเอาต์พุต
- จงใจลบ `⚠️ VERIFIED` 1 อันแล้วรัน audit → ต้องได้ C12 FAIL (แล้วใส่กลับ)

### 7) Docs
- อัปเดต `docs/PHASE_1E_DRIFT_REPORT.md` — บันทึก Phase C done + ระบุไฟล์ใหม่
- อัปเดต `docs/STATUS.md` 1 บรรทัด

---

## สิ่งที่ "ไม่แตะ"
- ไม่แตะไฟล์ `// ⚠️ VERIFIED` ใดๆ
- ไม่แตะ DB schema / RLS / FAQ data
- ไม่แตะ `bot_commands`, `webapp_page_config`
- ไม่เปลี่ยน logic ของ C1-C9 / smoke เดิม — เพิ่มอย่างเดียว
- ไม่ทำ feature-registry แบบ "ครบ 100%" — เน้น 12-15 ฟีเจอร์ที่ AI ชอบ regress

## ไฟล์ที่จะแก้/สร้าง
- **NEW** `.lovable/feature-registry.json`
- **NEW** `.lovable/verified-baseline.json`
- **NEW** `scripts/feature-impact.mjs`
- **EDIT** `scripts/consistency-audit.mjs` (เพิ่ม C10/C11/C12 ต่อท้าย)
- **EDIT** `.lovable/AI_GUARDRAILS.md` (เพิ่ม Step 1 checklist)
- **EDIT** `docs/PHASE_1E_DRIFT_REPORT.md` (Phase C done log)
- **EDIT** `docs/STATUS.md`

## Regression checklist
- [ ] C1-C9 ยัง pass หมด ไม่มี check เดิมพัง
- [ ] C10/C11/C12 pass บน DB+code ปัจจุบัน
- [ ] `smoke:quick` 16/0 ไม่เปลี่ยน
- [ ] `feature-impact.mjs` รันได้ทุก key
- [ ] ไม่มี VERIFIED marker หาย
- [ ] ไม่มี FAQ ถูกแก้/ลบใน Phase นี้
