## 🎯 Goal

สร้าง **automated smoke test** ที่รันด้วยคำสั่งเดียว แล้วเช็ค Phase 4.5 checklist ครบ:
1. Build & TypeScript ผ่าน
2. Key routes ใน `src/App.tsx` มีอยู่จริง (ไม่ orphan)
3. Database ไม่มี residual receipt/deposit references
4. พิมพ์ผล **PASS / FAIL / SKIP** เป็นตาราง พร้อม exit code (0 = ทุกอย่าง pass)

## 📦 Deliverables

### 1. `scripts/smoke-test.mjs` (Node ESM, ใช้ bun/node รันได้)
Test runner ที่:
- รัน `bun run build` แล้ว parse output หา TS errors
- อ่าน `src/App.tsx` แล้ว grep หา dead routes (`/receipts`, `/deposits`, `/receipt-management`, etc.)
- เปิด connection ไป Postgres (ใช้ `PG*` env vars ที่มีอยู่แล้ว) แล้ว run sanity SQL จาก `docs/SMOKE_TEST_PHASE4.md` Section F:
  ```sql
  SELECT COUNT(*) FROM bot_commands WHERE category IN ('receipt','deposit');
  SELECT COUNT(*) FROM webapp_page_config WHERE menu_group IN ('Receipts','Deposits');
  SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_schema='public' AND (table_name LIKE '%receipt%' OR table_name LIKE '%deposit%');
  SELECT COUNT(*) FROM portal_faqs WHERE category IN ('receipts','deposits');
  ```
  ทุก query ต้อง return 0 → PASS, > 0 → FAIL พร้อมแสดง count
- Grep `supabase/functions/` หา references ที่ตกหล่น: `daily_deposits`, `receipt_approvers`, `receipt_quota`
- Grep `src/` หา dead imports (`from.*receipts`, `from.*deposits`)
- Output แบบนี้:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Phase 4.5 Smoke Test
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [PASS]  A1. Build (bun run build)         3.2s
  [PASS]  A2. No TypeScript errors          
  [PASS]  B1. No /receipts routes in App.tsx
  [PASS]  B2. No /deposits routes in App.tsx
  [PASS]  C1. bot_commands clean (0 rows)
  [PASS]  C2. webapp_page_config clean (0 rows)
  [FAIL]  C3. Tables clean — found 2: receipt_categories, deposit_slips_x
  [PASS]  C4. portal_faqs clean (0 rows)
  [PASS]  D1. No edge fn references to daily_deposits
  [PASS]  D2. No edge fn references to receipt_approvers
  [SKIP]  E1. Storage bucket purge (manual — see docs)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Result: 10 pass, 1 fail, 1 skip
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```
- Exit code: 0 = all pass (skip OK), 1 = any fail

### 2. `package.json` — เพิ่ม script
```json
"scripts": {
  ...
  "smoke": "node scripts/smoke-test.mjs",
  "smoke:quick": "node scripts/smoke-test.mjs --skip-build"  // สำหรับ dev loop ที่ build แล้ว
}
```

### 3. Update `docs/SMOKE_TEST_PHASE4.md`
เพิ่มหัวข้อบนสุด:
```
## Quick Run (Automated)
bun run smoke    # full check: build + routes + DB sanity
bun run smoke:quick  # skip build (useful in dev loop)
```
ส่วน manual checklist (B/C/D ที่ต้องเปิดเบราว์เซอร์เอง) เก็บไว้เหมือนเดิมเพราะ automate ไม่ได้แบบ deterministic

## 🛠️ Technical Approach (key details)

| ส่วน | วิธีทำ |
|---|---|
| Build check | `child_process.spawn('bun', ['run', 'build'])` + capture stderr, regex `/TS\d+/` |
| Route check | อ่าน `src/App.tsx` ด้วย `fs.readFileSync` + regex `/path=["']\/(receipts|deposits)/` |
| DB check | `import pg from 'pg'`; ใช้ env `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` (มีอยู่แล้วใน sandbox); ถ้าไม่มี → SKIP DB tests + warn user |
| Edge fn grep | `child_process.spawn('rg', [pattern, 'supabase/functions/', '--count'])` |
| Pretty print | ใช้ ANSI colors แบบง่าย (green ✓, red ✗, yellow -) |

## 🛡️ Safety / Regression Prevention

- Script เป็น **read-only** (SELECT + grep + build) — ไม่แตะ DB หรือ files
- ติด `// ⚠️ VERIFIED` comment บน critical sections (build parser, SQL queries) ตามคอนเวนชันที่มีอยู่ใน `mem://constraints/verified-working-comment-convention`
- เพิ่มใน `.lovable/CRITICAL_FILES.md` ว่า `scripts/smoke-test.mjs` คือ regression guard — AI ห้าม "ปรับปรุง" โดยไม่ขอ
- รับ flag `--json` เพื่อให้ CI/automation parse ผลได้ (optional ใน future)

## 📋 Regression Checklist หลัง implement

- [ ] `bun run smoke` exit 0 บน main branch ปัจจุบัน
- [ ] ลอง break ของอย่าง 1 อย่าง (เช่น insert dummy row category='receipt' ใน bot_commands) → script ต้อง FAIL
- [ ] `bun run build` ยัง pass (script ไม่กระทบ build)
- [ ] ไม่ต้องแก้ไฟล์ใดๆ ในระบบ production code

## ❓ ก่อน execute มี 1 คำถาม

ตอนรัน DB sanity check, ผมควร:
- **A) ใช้ `pg` library** (npm install) — pure ESM, ไม่ต้องพึ่ง `psql` CLI, ทำงานได้ทุก env
- **B) shell out to `psql`** — เบาๆ ไม่เพิ่ม dependency แต่ต้องมี `psql` ติดตั้ง (ใน sandbox มี, ใน CI/local ของ user อาจไม่มี)

แนะนำ **A** เพราะ portable กว่า + เพิ่ม dep เดียว (`pg` ~50KB) แลกกับการรันได้ทุกที่. โอเคไหม?

ถ้าโอเค → approve plan แล้วผมจะลุยเลย
