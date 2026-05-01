# แผนตรวจหาสาเหตุ Publish ล้มเหลว (3 จุด)

เนื่องจาก local build ผ่าน + webhook ถูกต้องแล้ว แต่ Publish ยัง fail → ต้อง isolate ทีละชั้น

## จุดที่ 1: Frontend Build (npm ci / vite build)

**วิธีเช็ค (เมื่อ approve plan แล้วผมจะรัน):**
1. `npm ci` แบบสะอาด (ลบ `node_modules` ก่อน) — จำลอง pipeline จริง
2. `npm run build` แบบ production — ดู warning/error ที่ local อาจซ่อน
3. ตรวจ `package-lock.json` lockfileVersion + ว่ามี `node_modules` lock อยู่ใน git ไหม
4. ตรวจไฟล์ที่ Lovable pipeline sensitive: `.npmrc`, `vite.config.ts`, `tsconfig.json`, `index.html`

**สัญญาณที่จะเจอ:** peer-dep conflict, missing module, TS strict error, Rollup chunk error

---

## จุดที่ 2: Backend Edge Functions Deployment

มี 80+ functions — ถ้าตัวใดตัวหนึ่ง deploy ไม่ผ่าน Publish จะ fail ทั้งระบบ

**วิธีเช็ค:**
1. ดูว่ามี `deno.lock` ที่ root ของ `supabase/functions/` ไหม (เป็น root cause ที่พบบ่อย — ถ้ามีให้ลบทิ้ง ตาม Lovable docs)
2. ตรวจ `supabase/config.toml` ว่ามี function config block ที่ผิด syntax ไหม
3. Scan import ของทุก function หา:
   - `https://esm.sh/...` ที่ไม่ pin version → drift
   - import path พิมพ์ผิด / ไฟล์ไม่มีจริง
   - `npm:` specifier ที่ resolve ไม่ได้
4. ลอง `supabase--deploy_edge_functions` ทีละกลุ่ม (เช่น line-webhook, attendance-*) เพื่อหาตัวที่ fail
5. อ่าน `supabase--edge_function_logs` ของ function ที่แก้ล่าสุด หา boot error

**สัญญาณที่จะเจอ:** "Failed to deploy function X", boot error, lockfile incompatible

---

## จุดที่ 3: Database Migrations / Schema Sync

Publish จะ apply migrations จาก Test → Live ถ้ามี migration ที่ conflict กับ Live schema = fail

**วิธีเช็ค:**
1. List migrations 30 ตัวล่าสุด (เห็นแล้ว — ล่าสุด `20260429095719`)
2. Query Live (`environment: production`) ดู migration ที่ apply ไปแล้วล่าสุดผ่าน `supabase_migrations.schema_migrations`
3. หา migration ที่อยู่ใน repo แต่ยังไม่ apply บน Live → เปิดอ่านดู SQL
4. มองหา destructive ops: `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN TYPE`, `RENAME`
5. มองหา CHECK constraint ที่ใช้ `now()` (immutable violation), หรือ trigger บน schema reserved (`auth`, `storage`)
6. รัน `supabase--linter` ดู warning

**สัญญาณที่จะเจอ:** "Migration failed", "column already exists", "constraint violation", "function does not exist"

---

## ลำดับที่จะทำ

1. **Backend ก่อน** (น่าสงสัยที่สุด — frontend build ผ่านแล้ว, edge function logs ปกติแต่ไม่ได้แปลว่า deploy ผ่าน): หา `deno.lock`, scan imports, ลอง deploy ทีละกลุ่ม
2. **Migrations** ต่อ: เทียบ Test vs Live, อ่าน SQL ที่ค้าง
3. **Build สุดท้าย**: clean `npm ci` + production build เพื่อยืนยัน

## สิ่งที่จะ "ไม่" แตะ
- ไม่แก้ logic ใดๆ ใน `// ⚠️ VERIFIED` files (attendance, timezone, routing)
- ไม่เปลี่ยน LINE webhook URL (คงไว้ที่ live ref `bjzzqfzgnslefqhnsmla`)
- ไม่ rename/drop ตารางหรือคอลัมน์โดยไม่ถามก่อน
- ไม่ refactor edge functions ที่ deploy ผ่านอยู่แล้ว

## Deliverable หลังตรวจเสร็จ

รายงานสั้นๆ ระบุ:
- จุดไหนคือ root cause (1 ใน 3)
- ไฟล์/migration ตัวที่ fail
- patch เล็กที่สุดที่จะ unblock โดยไม่กระทบของเดิม
- ขอ approve ก่อนแก้จริง

กด Approve เพื่อเริ่มสแกนได้เลยครับ
