## คุณพูดถูก 100% — และผมเข้าใจผิดในรอบก่อน

ขอโทษครับ การแนะนำให้เปลี่ยน webhook URL ในรอบก่อนเป็น **คำแนะนำที่ผิดและสร้างความเสียหายจริง** หลักฐานชัดมาก

---

## หลักฐาน: มี 2 Supabase projects อยู่จริง

| สิ่งที่เช็ก | Test (`phhxdgaiwgaiuecvfjgj`) | **Live/Production (โปรเจกต์เดิม)** |
|---|---|---|
| attendance_logs ล่าสุด | 2026-04-29 (ของเก่า) | **2026-04-30 04:11 UTC** ✅ มี check-in วันนี้ |
| attendance_tokens 24h | 0 | **3 tokens** ✅ |
| logs ใน 7 วัน | 19 | 35 |
| Employee `U57ca2120...` | ไม่มี | ไม่มี (เป็นลูกค้าในกลุ่ม ไม่ใช่พนักงาน — ถูกต้องแล้ว) |
| `webhook_verification_logs` table | มี | **ไม่มี** (schema ต่างกัน!) |

แปลว่า:
- พนักงาน 3 คน (ntp.冬至, Noey, Porsza) **check-in สำเร็จเมื่อเช้าวันนี้** ใน Live project
- Webhook เดิมที่ใช้งานอยู่ชี้ไปที่ **Live project** (โปรเจกต์เดิม)
- `phhxdgaiwgaiuecvfjgj` คือ **Test/Preview project** ที่ Lovable สร้างให้สำหรับ environment นี้
- ผมเห็น `.env` มี `VITE_SUPABASE_URL=phhxdgaiwgaiuecvfjgj` แล้วเข้าใจผิดว่าเป็น production

---

## ผลกระทบจากคำแนะนำผิดของผม

ถ้าคุณ "เปลี่ยน webhook URL ใน LINE Developers Console" ตามที่ผมบอก:

```
LINE → ส่ง event ไปที่ Test project (phhxdgaiwgaiuecvfjgj)
         ↓
Test project ไม่มี employee mapping ของพนักงานจริง
         ↓
Bot ตอบ "คุณไม่ใช่พนักงาน" หรือ ignore
         ↓
ส่ง checkout/checkin ไม่ได้ ❌ (ตรงกับอาการที่คุณเจอ)

ขณะเดียวกัน Live project ที่ทำงานอยู่จริง ไม่ได้รับ event อีกต่อไป
         ↓
ระบบ attendance live ตายไปด้วย ❌
```

**ส่วน publish ไม่ได้** — เป็นคนละเรื่องกัน เป็น lockfile drift จริง (แก้ไปแล้วในรอบก่อน) ไม่เกี่ยวกับ webhook

---

## สิ่งที่ต้องทำทันที (Recovery Plan)

### Step 1 — แก้กลับ LINE webhook URL ให้ชี้ไป Live project (คุณทำเอง 30 วินาที)

ต้องรู้ก่อนว่า project ref เดิมคืออะไร:
- CLAUDE.md เขียนว่า `bjzzqfzgnslefqhnsmla` แต่นั่นอาจเป็น doc เก่า
- ขอดูจาก LINE Console ก่อน หรือคุณจำได้ไหมว่า URL เดิมคืออะไร?

**สิ่งที่อยากให้คุณช่วยตอบ** (เลือกทางที่สะดวก):
- (ก) เปิด LINE Developers Console → Messaging API → ดู Webhook URL ที่ตั้งอยู่ตอนนี้ แล้วบอกผม (หรือ screenshot)
- (ข) ถ้าจำได้ บอก project ref เดิม (พิมพ์ `bjzzqfzgnslefqhnsmla` หรืออื่น?)
- (ค) ให้ผมช่วยหาจาก code/migration history

เมื่อรู้ URL เดิมแล้ว → ตั้งกลับใน LINE Console → attendance/checkout จะกลับมาทำงานทันที (ไม่ต้องแก้ code)

### Step 2 — แก้ documentation ที่ทำให้ AI สับสน (โดยผม หลัง user approve)

หลัง switch เป็น default mode:
1. **อัปเดต `CLAUDE.md`** — แก้ "Live Supabase project" ให้ตรงความเป็นจริง พร้อมหมายเหตุว่า `phhxdgaiwgaiuecvfjgj` = Test, ของจริง = (ref ที่คุณยืนยัน)
2. **อัปเดต `LINE_INTERN_SETUP.md`** — ลบ/แก้ webhook URL example ที่อ้างถึง `bjzzqfzgnslefqhnsmla` ถ้าผิด
3. **เพิ่ม note ใน `.lovable/CRITICAL_FILES.md`** ว่า:
   > ⚠️ AI ห้ามแนะนำให้เปลี่ยน LINE webhook URL โดยอัตโนมัติ — webhook URL ใน LINE Console ต้องชี้ไป **production project** เสมอ ไม่ใช่ preview/test ที่อยู่ใน `.env`
4. **อัปเดต memory** (`mem://infrastructure/line-webhook-error-routing` หรือสร้างใหม่) ให้ AI รอบหน้าไม่ทำผิดซ้ำ

### Step 3 — ไม่แตะอะไรเลยใน code (รอบนี้)

- ❌ ไม่แตะ `attendance-submit/index.ts`
- ❌ ไม่แตะ `line-webhook/index.ts`
- ❌ ไม่ deploy edge function ใหม่
- ❌ ไม่สร้าง migration
- ✅ แก้แค่ docs + memory เพื่อกัน regression รอบหน้า

---

## ส่วน publish (แยกเรื่อง)

publish ที่ fail ในรอบก่อนเป็นเรื่อง **lockfile drift** จริง (ผมเช็คแล้วว่า `npm ci` fail เพราะ `vitest, pg, jsdom...` หายจาก `package-lock.json`) — แก้ไปแล้วในรอบที่ลงท้ายว่า "ROOT CAUSE FIXED. READY TO RETRY PUBLISH"

ลอง retry publish อีกที **หลังจาก** Step 1 (กู้ webhook URL) เพื่อแยกตัวแปร

---

## สรุปสั้น (ผิดจริง → แก้ตรงจุด → ไม่แก้จุดที่ดีอยู่แล้ว)

**ผิดจริง:** ผมแนะนำให้คุณเปลี่ยน webhook URL ไป Test project → ทำให้ bot ในงานจริงรับ event ไม่ได้ → checkout/checkin พัง

**แก้ตรงจุด:** เปลี่ยน webhook URL ใน LINE Console กลับไปชี้ Live project (คุณทำใน LINE Console)

**ไม่แตะ:** code ทั้งหมด — เพราะ code ทำงานได้ดีอยู่ ปัญหาอยู่ที่การชี้ webhook ผิดที่

**ขอให้คุณช่วย:** ยืนยัน project ref ของ Live (Step 1 ตัวเลือก ก/ข/ค) เพื่อผมจะได้ใส่ลง docs ให้ถูก และ AI รอบหน้าจะไม่พลาดซ้ำ
