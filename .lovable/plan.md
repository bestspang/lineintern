
## Problem (verified)

- โดเมน `intern.gem.me` **ทำงานปกติ** (HTTP 200, SSL ดี, SPA fallback ใช้ได้)
- การ fetch `https://intern.gem.me/overview` แบบไม่มี cookie → ได้หน้า Sign In ปกติ (RootRedirect → `/auth`)
- ใน preview ของท่าน user `bestspang@gmail.com` ได้ role = **owner** และ menu/page config คืน 13 groups ครบ — ไม่มี deny จริง
- หน้าจอ "ไม่มีสิทธิ์เข้าถึง" ที่เห็นใน screenshot มาจาก **bundle เก่า + cookie เก่าใน Chrome ที่มี extension เยอะ** ของท่าน (เคยโหลด build ก่อนแก้ route mapping)

## ทำไม ProtectedRoute ถึงโชว์การ์ดนั้นได้ง่ายเกินไป

ใน `ProtectedRoute.tsx` ปัจจุบัน:
1. ถ้า `pageConfigs` ยังไม่มาทันเวลา หรือ network ตอบช้า/พลาด query เดียว → `canAccessPage` คืน false ทันที
2. ถ้าหา `getFirstAccessiblePage()` แล้ว null (เช่น cache เก่าก่อน fix mapping) → fall back ไปการ์ด "ไม่มีสิทธิ์เข้าถึง" ที่ไม่มีปุ่ม retry / sign out
3. ผู้ใช้ติดอยู่ที่หน้านี้ ไม่มีทางออกนอกจากปิดแท็บ

## แผนแก้ไข (Surgical, Zero Regression)

### 1. เพิ่ม "ทางออก" ในการ์ดไม่มีสิทธิ์ (ProtectedRoute.tsx)
ปุ่มเพิ่มเติม 3 ปุ่ม:
- **"ลองใหม่"** — `window.location.reload()` เพื่อโหลด bundle ใหม่และ refetch role/config
- **"ไปหน้าหลัก"** — navigate ไป `/`
- **"ออกจากระบบ"** — `signOut()` แล้วไป `/auth`

ไม่แตะตรรกะ permission เดิมเลย — เพิ่มแค่ UI escape hatches

### 2. Hardening: ถ้า role โหลดสำเร็จแต่ pageConfigs ว่าง → ใช้ menu group fallback แทน deny
ใน `usePageAccess.canAccessPage`: ถ้า `pageConfigs` ว่าง (network race / partial load) แต่ `canAccessMenuGroup` คืน true ให้ผ่าน — ป้องกัน false-deny ตอน config โหลดไม่ทัน

(เคสนี้เกิดยากสำหรับ owner เพราะ owner bypass อยู่แล้ว แต่ป้องกันไว้สำหรับ role อื่น)

### 3. แนะนำท่าน (manual)
- กด **Cmd+Shift+R** (hard refresh) ที่ `intern.gem.me`
- หรือเปิด **Incognito** เพื่อทดสอบโดยไม่มี cache/extension

## Files to touch

| File | Change | Risk |
|------|--------|------|
| `src/components/ProtectedRoute.tsx` | เพิ่ม 3 ปุ่ม Retry / Home / Sign Out ในการ์ดไม่มีสิทธิ์ | ต่ำมาก (UI only) |
| `src/hooks/usePageAccess.ts` | เพิ่ม fallback: ถ้า pageConfigs ว่าง + menu group access → allow | ต่ำ (ยังเช็ค menu group ก่อน) |

## ไม่แตะ
- AuthContext, RootRedirect, useUserRole — ทำงานถูกต้องแล้ว
- RLS, edge functions, DB
- routing, layout
- timezone, portal logic

## Regression checklist หลังแก้
1. Login `bestspang@gmail.com` → เห็น `/overview` พร้อม dashboard ครบ
2. Sign out → กลับไป `/auth`
3. role อื่น (เช่น employee) → ยัง redirect ไปหน้าที่เข้าได้ตามเดิม
4. config โหลดช้า → ไม่โชว์ deny ผิดพลาดอีกต่อไป
5. ถ้าไม่มีสิทธิ์จริง → การ์ดยังโชว์ แต่มีปุ่ม retry / home / sign out ใช้ได้
