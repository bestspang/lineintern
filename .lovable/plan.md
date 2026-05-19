## Goal

เพิ่ม 2 ความสามารถใหม่บนหน้า Admin โดยไม่แตะ business logic ที่ทำงานอยู่:

1. ปุ่ม "ส่ง / Resend ลิงก์ Member Portal" ให้พนักงาน (สำหรับคนที่ยังไม่เปิดใช้งาน)
2. การแจ้งเตือนใน OpsCenter เมื่อ `portal_performance_events = 0` พร้อมปุ่ม "ตรวจการเชื่อมต่อ"

---

## Affected modules / Status

| Module | Status | Action |
|---|---|---|
| `supabase/functions/line-webhook` `/menu` handler | WORKING — ⚠️ VERIFIED | **ไม่แตะ** ใช้เป็นต้นแบบเท่านั้น |
| `supabase/functions/portal-link-resend` (ใหม่) | NEW | สร้างใหม่ — mirror logic จาก /menu handler |
| `src/pages/attendance/Employees.tsx` | WORKING | เพิ่มปุ่มต่อแถว (additive) |
| `src/pages/attendance/OpsCenter.tsx` | WORKING — ⚠️ VERIFIED (additive only allowed) | เพิ่ม metric + ปุ่ม connection-test (additive) |
| `portal_performance_events` table / RLS | WORKING | ไม่แตะ |
| `employee_menu_tokens` schema | WORKING | ไม่แตะ — แค่ insert เพิ่ม |

---

## What must be preserved

- `/menu` command flow ใน line-webhook (ทุกบรรทัด)
- `portal_access_mode` 3 โหมด (`liff` / `token` / `both`) — edge function ใหม่ต้องเคารพการตั้งค่าเดิม
- OpsCenter card layout เดิม, navigate target ของ "Open Portal Performance", Pilot QA card text
- `employee_menu_tokens` lifetime 30 นาทีและ schema
- ไม่เปลี่ยน RLS, ไม่เพิ่ม policy ที่ขัดของเดิม

---

## What's actually new

### 1. Edge Function `portal-link-resend` (admin push)

Mirror logic ของ `/menu` handler ใน `line-webhook/index.ts` (line 9487-9549):

- รับ `{ employee_id: string }` (และ optional `mode`)
- ตรวจสิทธิ์ผู้เรียกผ่าน JWT (`verify_jwt = true` ใน config.toml) + ตรวจ role ใน `user_roles` (admin/owner/hr) ด้วย `has_role()`
- โหลด employee → ตรวจ `line_user_id` exists
- อ่าน `system_settings.portal_access_mode` + `api_configurations.LIFF_ID`
- ถ้า `liff`/`both` + LIFF_ID → ส่ง URL `https://liff.line.me/{LIFF_ID}` ผ่าน LINE **Push API**
- ถ้า `token` → INSERT `employee_menu_tokens` (expiry 30 นาที, format `emp_{id}_{ts}_{rand}` — ตรงกับ /menu) แล้ว push `{APP_URL}/portal?token=...`
- log ลง `bot_logs` หรือ `audit_logs` (event_type = `portal_link_resend`) เพื่อตรวจสอบย้อนหลัง
- คืน `{ success: true, mode, sent_at }` หรือ error code ที่ frontend map เป็นข้อความไทย

ใช้ `npm:@supabase/supabase-js@2`, CORS headers ตามมาตรฐาน, validate ด้วย Zod, ใช้ service-role client เฉพาะหลังจากตรวจสิทธิ์แล้ว

### 2. UI — `src/pages/attendance/Employees.tsx`

เพิ่มปุ่ม "ส่งลิงก์ Portal" (icon `Send`) ใน action column ของแต่ละ employee row:
- disabled เมื่อ `!line_user_id` พร้อม tooltip "ยังไม่ผูก LINE"
- คลิก → `supabase.functions.invoke('portal-link-resend', { body: { employee_id } })`
- toast (`sonner`) success/error เป็นภาษาไทย, แสดง mode ที่ส่ง (LIFF / Token Link)
- กันกดซ้ำด้วย local `sendingId` state
- ไม่ลบ/ย้าย/แก้ปุ่มอื่นในแถว

### 3. UI — `src/pages/attendance/OpsCenter.tsx` (Portal Performance card, additive)

ใน Card "Portal Performance Events" (line 194-219) เพิ่ม **ใต้** `Alert` ที่มีอยู่:

- ปุ่ม `ตรวจการเชื่อมต่อ` (variant outline, size sm)
- คลิก → ทำ 3 อย่าง parallel:
  1. `supabase.from('portal_performance_events').select('id', { head: true, count: 'exact' })` วัด latency
  2. `supabase.auth.getSession()` ตรวจ session
  3. `supabase.functions.invoke('portal-data', { body: { health: true } })` (head-only) — fallback: ปิงโปรเจค status endpoint
- แสดงผลด้วย mini-result list ใต้ปุ่ม: `DB read: OK 142ms` / `Auth session: OK` / `Edge function: OK`
- ถ้า fail แสดง badge destructive + error text
- ไม่ insert dummy row จริง (เพื่อไม่เกะกะ metric)

ปรับ Alert text เดิม: เพิ่มประโยค "ถ้าทดสอบแล้วการเชื่อมต่อปกติแต่ยังไม่มี event แสดงว่ายังไม่มีผู้ใช้เปิด portal จริง"

### 4. Permissions

- เพิ่มแถวใน `webapp_page_config` ไม่ต้อง (เพราะหน้าเดิมมีอยู่แล้ว)
- เพิ่ม `bot_commands` row สำหรับ `portal_link_resend` ไม่จำเป็น (ไม่ใช่ user-facing command)
- ตรวจว่า `has_role(auth.uid(), 'admin')`, `'owner'`, หรือ `'hr'` เท่านั้นที่เรียก function ได้

---

## Minimal-diff plan

1. **CREATE** `supabase/functions/portal-link-resend/index.ts` (~150 lines)
2. **CREATE** config block ใน `supabase/config.toml` สำหรับ function ใหม่ (default `verify_jwt = true`)
3. **EDIT** `src/pages/attendance/Employees.tsx` — เพิ่ม button + handler (~40 บรรทัด, additive)
4. **EDIT** `src/pages/attendance/OpsCenter.tsx` — เพิ่ม connection-test block ภายใน Portal Performance card (~50 บรรทัด, additive)
5. **NO migration** — ไม่แตะ schema
6. **UPDATE** `.lovable/registry-snapshot.json` เพิ่ม `portal-link-resend` เข้า edge function list

---

## Regression checklist

- `/menu` ใน LINE webhook ยังทำงานครบ 3 โหมด (manual test ใน DM)
- `employee_menu_tokens` validate ผ่าน `employee-menu-validate` ได้ปกติ (token format เดิม)
- หน้า Employees: ปุ่มเดิม (edit, delete, link LINE) ไม่ขยับตำแหน่ง
- OpsCenter: ปุ่ม "Open Portal Performance" navigate ถูกที่เดิม
- OpsCenter: Pilot QA card text ไม่เปลี่ยน
- Non-admin caller โดน 403 จาก `portal-link-resend`
- `npm run build`, `npm run smoke:quick`, `bun run test` ผ่านทั้งหมด
- `npm run audit:consistency` ผ่าน

---

## Doc updates

- `docs/PHASE_1D_CORE_DAILY_OPS_POLISH.md` — append "Resend Portal Link (Phase 1D.1)" section
- `docs/STATUS.md` — append row
