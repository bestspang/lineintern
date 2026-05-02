# 🚨 CRITICAL FILES — ห้าม AI แก้โดยไม่จำเป็น

> **เป้าหมาย:** ป้องกัน AI ในรอบหน้าแก้ของที่ทำงานดีอยู่แล้วให้พัง
> **อ่านก่อนแตะ:** ทุกครั้งที่จะแก้ไฟล์ในนี้ ต้อง justify ว่าแก้เพราะอะไร และไม่กระทบ behavior ที่ระบุ
> **คู่มือเต็ม:** ดู [`AI_GUARDRAILS.md`](./AI_GUARDRAILS.md) — pre-edit checklist, regression traps, cross-surface map

---

## 🔒 P0 — Critical Path Files (พังคือพังทั้งระบบ)

| ไฟล์ | Verified | สิ่งที่ห้ามทำ |
|---|---|---|
| `supabase/functions/portal-data/index.ts` | 2026-04-26 | ห้าม chain `.select()` หลัง `.eq()` (TS pattern). ใช้ Fix #2 pattern จาก plan.md |
| `supabase/functions/line-webhook/index.ts` | 2026-04-25 | ห้าม refactor `processTextMessage` dispatcher. ห้ามลบ deprecation handlers ของ /receipt commands |
| `supabase/functions/line-webhook/utils/command-parser.ts` | 2026-04-25 | ทุกครั้งที่เพิ่ม commandType ต้อง add handler ใน index.ts ด้วย |
| `supabase/functions/attendance-submit/index.ts` | 2026-05-02 | Token validation logic เคยพังหลายรอบ — แก้เฉพาะเมื่อจำเป็น |
| `supabase/functions/_shared/timezone.ts` | 2026-05-02 | ห้าม double-convert. ดู header doc ในไฟล์ |
| `src/lib/timezone.ts` | 2026-05-02 | Frontend display only — ห้ามใช้แทน server-side timezone math |
| `src/hooks/useUserRole.ts` | 2026-05-02 | Auth/role source — ห้ามเก็บ role ใน profiles |
| `src/hooks/usePageAccess.ts` | 2026-05-02 | Page-level RBAC — coordinate กับ ProtectedRoute + role_access_levels DB |
| `src/components/ProtectedRoute.tsx` | 2026-05-02 | Auth gate — coordinate กับ AuthContext + RootRedirect |
| `src/lib/portal-actions.ts` | 2026-05-02 | Canonical action registry — drives Home + Help quick-actions |
| `src/integrations/supabase/client.ts` | auto-gen | **NEVER EDIT** — auto-generated |
| `src/integrations/supabase/types.ts` | auto-gen | **NEVER EDIT** — auto-generated |

## 🔐 P1 — ระวังเป็นพิเศษ (cross-surface impact)

| ไฟล์ | เหตุผล |
|---|---|
| `src/lib/portal-actions.ts` | ทุก path ต้อง match route ใน `App.tsx` (มี build-time check) |
| `src/App.tsx` | route group order matters: admin routes ห้ามอยู่หลัง catch-all |
| `src/components/portal/PortalLayout.tsx` | bottom nav มี exactly 6 items — ลบเพิ่มต้อง coordinate กับ user |
| `src/pages/portal/Help.tsx` | FAQ rendering ใช้ dynamic categories จาก DB — ห้ามกลับไปเป็น hardcoded |
| `scripts/smoke-test.mjs` | Phase 4.5 regression guard — ห้ามแก้โดยไม่ขอ user (ถ้าจะเพิ่ม check ใหม่ ให้ append section ใหม่ ไม่ใช่ rewrite) |
| `SYSTEM_SYNC_CHECKLIST.md` | source of truth สำหรับ cross-module sync — อัปเดตเมื่อเพิ่ม feature |

## 📌 Behavioral Invariants (พฤติกรรมห้ามเปลี่ยน)

1. **Portal access**: รองรับ 3 modes (`liff`, `token`, `both`) — ดู SYSTEM_SYNC_CHECKLIST §1
2. **Bangkok timezone**: ทุก date/time UI + business logic ใช้ Asia/Bangkok เท่านั้น
3. **Roles in user_roles table**: ห้ามเก็บ role ใน profiles (security)
4. **Receipt/Deposit removed (Phase 2-4)**: ห้ามเพิ่มกลับโดยไม่ถาม user
5. **Bot commands**: deprecation messages สำหรับ /receipt, /deposit ต้องคงอยู่จนกว่า user สั่งลบ
6. **HR-focused scope**: ตัด feature ที่ไม่เกี่ยว HR ออก (Phase 1 decision)
7. **🚨 LINE Webhook URL — NEVER auto-suggest changing it**:
   - **Live/Production project ref**: `bjzzqfzgnslefqhnsmla` ← LINE Console webhook URL ต้องชี้ที่นี่เท่านั้น
   - **Test/Preview project ref**: `phhxdgaiwgaiuecvfjgj` ← นี่คือ Lovable preview env (อยู่ใน `.env`, `supabase/config.toml`)
   - ❌ ห้าม AI แนะนำให้เปลี่ยน webhook URL ใน LINE Developers Console เพื่อ "match" กับ `.env` หรือ `config.toml` — จะทำให้ pproduction LINE bot ตาย, พนักงาน check-in/checkout ไม่ได้
   - ✅ ถ้า `verify-line-webhook` รายงาน mismatch — แค่บอก user ว่าเป็น expected mismatch ระหว่าง preview vs production เพราะ Lovable ใช้ project ref คนละตัวสำหรับ test
   - **Incident**: 2026-04-30 — AI แนะนำให้ user เปลี่ยน webhook ไป `phhxdgaiwgaiuecvfjgj` ตาม `.env` ทำให้ checkout ใช้งานไม่ได้ทั้งวัน

## 🛡️ Supabase Query Patterns (กฎที่เคยพัง)

```ts
// ❌ WRONG — chain .select() หลัง .eq() ทำให้ TS พัง
let q = supabase.from('x').select('id', { count: 'exact', head: true }).eq('a', 1);
q = q.eq('b', 2).select('id, joined:y!inner(z)', { count: 'exact', head: true }); // ❌

// ✅ RIGHT — decide select string ก่อน build
const sel = needsJoin ? 'id, joined:y!inner(z)' : 'id';
let q = supabase.from('x').select(sel, { count: 'exact', head: true }).eq('a', 1);
if (needsJoin) q = q.eq('joined.z', val);

// ✅ Embed 1-to-1 relationship — cast type ตรงๆ เพราะ generated types มอง array
const { data } = await supabase.from('employees').select('id, employee_roles(role_key)').single();
const row = data as { id: string; employee_roles: { role_key: string } | { role_key: string }[] | null };
const roleObj = Array.isArray(row.employee_roles) ? row.employee_roles[0] : row.employee_roles;
```

## 📝 Process Rules for AI

1. **เปิดไฟล์ในลิสต์นี้ → อ่าน VERIFIED comment ก่อน** ถ้ามี
2. **มี `// ⚠️ VERIFIED [DATE]` comment → ห้ามแตะ block นั้น** เว้นแต่ user สั่งตรงๆ
3. **แก้แล้ว → อัปเดต VERIFIED date** + เพิ่ม note ว่าแก้อะไร
4. **ลบ feature → ต้อง audit cross-surface** (DB tables, bot_commands, webapp_page_config, FAQ, routes, nav)
5. **เพิ่ม feature → อัปเดต SYSTEM_SYNC_CHECKLIST.md**

---
**Last updated:** 2026-05-02 (added VERIFIED markers + AI_GUARDRAILS.md cross-link)
