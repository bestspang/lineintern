## ปัญหา (Root Cause)

ผมตรวจ cross-surface แล้ว **เจอจุดที่ "หลุด sync" จริง** ไม่ใช่แค่ทฤษฎี:

### 🔴 P0 — Page Access Registry หลุด (กระทบสิทธิ์ผู้ใช้จริง)

`webapp_page_config` เป็นตารางที่คุม role-based access ของ admin pages (อ่านโดย `usePageAccess.ts` + `RoleManagement.tsx`) แต่ **44 routes ใหม่ไม่ได้ลงทะเบียน** รวมถึง `/attendance/employee-documents` (ที่เพิ่งทำเสร็จ 4 รอบ!) และยังมี **11 entries ค้างใน DB ที่ route ลบ/ย้ายไปแล้ว**

ผลกระทบ: HR/Manager บางคนกดเมนูแล้วเข้าไม่ได้, หรือเข้าได้ทั้งที่ไม่ควรมีสิทธิ์ (default `can_access`).

ตัวอย่างที่ขาด:
```
/attendance/employee-documents   ← เพิ่งทำเสร็จ
/attendance/bag-management
/audit-logs, /feature-flags, /pre-deploy-checklist
/profile-sync-health, /branch-report
+ approvals, portal pages อีก 30+
```

ตัวอย่างที่ stale (route ไม่มีแล้ว):
```
/alerts, /integrations, /reports, /safety-rules
/settings/alerts, /settings/users, /settings/roles, ...
```

### 🟡 P1 — Bot Commands sync (ดี)
ตรวจแล้ว `command-parser.ts` ↔ `bot_commands` ตรงกัน 100% (มี `history` ใน DB ที่ parser handle แยก — ตั้งใจ ไม่ใช่ bug)

### 🟡 P1 — Portal FAQ
ตอนนี้มี 31 entries ใน 4 หมวด แต่ไม่ครอบคลุมฟีเจอร์ใหม่ (employee documents, gacha, bag, leaderboard) — ต้องเช็คว่า user ถามอะไรแล้วไม่เจอคำตอบบ่อยจาก `faq_logs`

### 🔴 P0 — สาเหตุเชิงระบบ: ไม่มี automated guard
`SYSTEM_SYNC_CHECKLIST.md` มีอยู่แล้วแต่เป็น **manual checklist** — AI ไม่ได้บังคับเช็คทุกครั้ง จึงพลาดซ้ำได้ตลอด `scripts/smoke-test.mjs` เช็คแค่ build + routes + DB sanity แต่ไม่เช็ค `routes ↔ webapp_page_config`

---

## แผนแก้ (Step-by-Step, Minimal-Diff)

### Step 1 — Sync `webapp_page_config` (Migration)
สร้าง migration เพิ่ม row ที่ขาด (44 paths × 7 roles) ด้วย sensible defaults:
- HR/Admin/Owner pages → admin/owner/hr มี access
- Portal pages (`/my-*`, `/approvals/*`) → ทุก role (เพราะ portal มี gate ของตัวเอง อยู่นอก webapp_page_config scope จริงๆ — ดูข้อ 1a)
- ใช้ `ON CONFLICT (role, page_path) DO NOTHING` เพื่อไม่ทับของเดิม
- **ลบ stale entries** 11 รายการที่ route ลบไปแล้ว

**1a — Scope clarification:** ตรวจ `usePageAccess.ts` ว่าเช็ค `/portal/*` ด้วยไหม ถ้าไม่ ให้ skip portal paths ใน migration (ลด noise)

### Step 2 — เพิ่ม automated guard ใน `scripts/smoke-test.mjs`
เพิ่ม **section ใหม่** (ไม่แก้ section เก่าเพื่อตามกฎ "VERIFIED"):
- `SECTION F — Page Access Registry Sync`
  - parse routes จาก `src/App.tsx`
  - parse `webapp_page_config` migrations (หรือ snapshot file)
  - report PASS/FAIL ถ้ามี route ที่ไม่ลงทะเบียน
- `SECTION G — Bot Commands Sync`
  - parse `command-parser.ts` commandMap
  - parse `bot_commands` entries จาก migrations
  - report mismatch

### Step 3 — เพิ่ม snapshot file `.lovable/registry-snapshot.json`
ไฟล์ generated รวม "ความจริงปัจจุบัน": `routes`, `bot_commands`, `webapp_pages`, `portal_faqs categories`. ใช้เป็น source for smoke-test และเป็น **context เริ่มต้นที่ AI จะอ่านก่อนแก้** (ลิงก์จาก `CRITICAL_FILES.md`)

### Step 4 — อัปเดต `CRITICAL_FILES.md` + `SYSTEM_SYNC_CHECKLIST.md`
เพิ่มหัวข้อใหม่:
- **§8 Page Registry** — checklist เมื่อเพิ่ม route ใหม่ ต้อง insert ใน webapp_page_config
- **🚨 AI Pre-flight rule:** ก่อนเพิ่ม route/command/setting ใหม่ ต้องรัน `node scripts/smoke-test.mjs --skip-build` แล้ว fix sync ทันที
- เพิ่ม pointer ไปที่ `.lovable/registry-snapshot.json`

### Step 5 — Help/FAQ refresh (เล็ก)
- Portal `/help` page: เช็คว่า dynamic FAQ แสดงครบ 4 categories จริง (ปัจจุบันมี attendance/leave-ot/points/general แต่ไม่มี `documents` ทั้งที่มีหน้าใหม่)
- Bot `/help` command (handler ใน webhook): query `bot_commands` แบบ dynamic อยู่แล้ว ไม่ต้องแก้
- เพิ่ม FAQ seed migration: 3-4 ข้อสำหรับ employee documents (ไฟล์อะไรที่อัปได้, ขนาด, ใครเห็นได้)

### Step 6 — Verify ด้วย browser
หลัง deploy migration: เปิด `/settings/roles` → กด toggle access แล้วเช็คว่า dropdown มีหน้า `/attendance/employee-documents` ปรากฏ + role hr/admin/owner ติ๊กไว้ default

---

## สิ่งที่จะ "ไม่" แตะ (Preservation List)

- ❌ ไม่แก้ `EmployeeDocuments.tsx` (เพิ่ง verify เสร็จ 4 รอบ)
- ❌ ไม่แก้ `line-webhook/index.ts` core dispatcher (มี VERIFIED comment)
- ❌ ไม่แก้ `command-parser.ts` (sync ดีอยู่แล้ว)
- ❌ ไม่แก้ `portal-data/index.ts`, `attendance-submit/index.ts` (P0 critical)
- ❌ ไม่แก้ schema `webapp_page_config` (แค่ insert/delete rows)
- ❌ ไม่แตะ smoke-test sections A-E ที่มีอยู่ — เพิ่ม F, G ใหม่ append เท่านั้น

---

## ไฟล์ที่จะสร้าง/แก้

| ไฟล์ | Action | เหตุผล |
|---|---|---|
| `supabase/migrations/<new>_sync_page_registry.sql` | CREATE | insert 44 missing + delete 11 stale |
| `supabase/migrations/<new>_seed_documents_faq.sql` | CREATE | FAQ entries สำหรับ employee documents |
| `scripts/smoke-test.mjs` | EDIT (append) | เพิ่ม Section F, G |
| `.lovable/registry-snapshot.json` | CREATE | source of truth สำหรับ AI context |
| `.lovable/CRITICAL_FILES.md` | EDIT | เพิ่ม pre-flight rule + §8 |
| `SYSTEM_SYNC_CHECKLIST.md` | EDIT | เพิ่ม §8 Page Registry |

---

## Regression Checklist (จะรันหลังแก้)

```
[ ] bun run build ผ่าน
[ ] node scripts/smoke-test.mjs ผ่านทุก section รวม F, G ใหม่
[ ] /settings/roles แสดง /attendance/employee-documents
[ ] HR login เปิดหน้า /attendance/employee-documents ได้
[ ] Bot /help ใน LINE ยังแสดง command list ครบ
[ ] /portal/help ยังโหลด FAQ ได้
[ ] ไม่มี route 404 จาก nav menu เดิม
```

---

## วิธีป้องกัน AI พังของเก่าซ้ำ (Long-term Fix)

ปัญหาที่เจอ: AI รอบหน้าจะ **ไม่รู้** ว่ามีอะไรเพิ่งทำเสร็จ ถ้าไม่บอก จึง:

1. **`registry-snapshot.json`** = AI โหลดอ่านเป็นบริบทแรกได้
2. **Pre-flight rule ใน `CRITICAL_FILES.md`** = AI ต้องรัน smoke-test ก่อน claim ว่าเสร็จ
3. **`// ⚠️ VERIFIED [date]` comments** = มีอยู่แล้ว — จะเพิ่มใน components ที่ stable แล้วเพื่อยิ่งเข้ม
4. **Smoke test Section F/G** = bot กดปุ่ม "Try to fix" ก็จะ fail loud ถ้าหลุด sync

ถ้าอนุมัติ ผมจะลงมือทันทีตาม Step 1→6.