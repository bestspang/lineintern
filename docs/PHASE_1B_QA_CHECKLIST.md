# Phase 1B — Manual QA Checklist
**LINE LIFF / Member Portal · Performance & Reliability**

> Use together with `node scripts/smoke-test.mjs --skip-build` (automated).
> This document covers the **manual** QA that the smoke test cannot perform.

---

## Section A · Setup ก่อนเริ่มทดสอบ

### Required
- [ ] Tester role: **admin** หรือ **owner** (สำหรับ Section G)
- [ ] อุปกรณ์: Android phone จริง + iPhone จริง (มี LINE app ติดตั้ง)
- [ ] Desktop browser (Chrome) สำหรับ Section H
- [ ] Test employee account ที่มี:
  - [ ] `line_user_id` ตั้งค่าแล้ว
  - [ ] `auth_user_id` linked
  - [ ] `branch_id` พร้อม geofence
  - [ ] `is_active = true`
- [ ] Sample expired attendance link (สร้างไว้ล่วงหน้า — ปล่อยให้หมดอายุ > 10 นาที)
- [ ] เข้าถึง `/attendance/ops-center` และ `/attendance/portal-performance` ได้

### Pass criteria template
แต่ละ test case ใช้รูปแบบ:
- ✅ **PASS** — ตรงตามเกณฑ์ pass ทั้งหมด
- ⚠️ **PARTIAL** — ทำงานได้แต่มี cosmetic issue
- ❌ **FAIL** — ไม่ตรงเกณฑ์ pass หรือเข้าเกณฑ์ fail
- 📸 Screenshot: แนบทุก case ที่ไม่ใช่ PASS
- 📝 Notes: ผู้ทดสอบจดเพิ่ม

---

## Section B · LIFF Open & First Paint (5 cases)

### B1. Cold start จาก LINE rich menu
**Steps:**
1. ปิด/kill LINE app ออก
2. เปิด LINE ใหม่ → ไปที่ห้องที่ตั้ง rich menu
3. แตะปุ่ม "เปิด Member Portal" บน rich menu
4. นับเวลาตั้งแต่แตะปุ่มถึง portal home interactive

**Pass:** Thai skeleton ปรากฏ < 1s · portal home interactive < 3s · ไม่มี white flash
**Fail:** จอขาว > 1.5s · interactive > 5s · เกิด JS error

---

### B2. Warm start (LIFF cached)
**Steps:**
1. เปิด portal ครั้งแรก รอจนโหลดเสร็จ
2. กดปิด → เปิดใหม่ทันทีจาก rich menu (ภายใน 1 นาที)

**Pass:** interactive < 1.5s
**Fail:** > 3s หรือต้อง re-login

---

### B3. เปิดนอก LINE (desktop browser)
**Steps:**
1. เปิด `https://intern.gem.me/portal/` ใน Chrome desktop

**Pass:** แสดง fallback/instruction ภาษาไทยให้เปิดผ่าน LINE · ไม่มี JS crash
**Fail:** จอขาว · stack trace แสดงให้ user เห็น

---

### B4. เปิดซ้ำเร็วๆ (back/forward)
**Steps:**
1. เปิด portal → กด browser back → กด forward 2-3 รอบ
2. เปิด DevTools Network tab

**Pass:** ไม่มี duplicate `liff.init` · ไม่มี duplicate `employee-liff-validate` request
**Fail:** เห็น call ซ้ำ ≥ 2 ครั้งใน 1 วินาที

---

### B5. Slow 3G simulation
**Steps:**
1. Chrome DevTools → Network → throttle "Slow 3G"
2. โหลด `/portal/` ใหม่

**Pass:** เห็น Thai skeleton + loading strings ทันที · ไม่มี infinite spinner เกิน 30s
**Fail:** จอขาวค้าง · timeout error เป็นภาษาอังกฤษ

---

## Section C · Expired Link UX (3 cases)

### C1. Token หมดอายุ (> 10 นาที)
**Steps:**
1. ใช้ link attendance ที่เตรียมไว้ (อายุ > 10 นาที)
2. กดเปิด

**Pass:** แสดง "ลิงก์หมดอายุ" หรือข้อความไทยที่เข้าใจง่าย · มีปุ่มขอ link ใหม่ หรือบอกให้ DM bot
**Fail:** generic 500 · จอขาว · ข้อความอังกฤษล้วน · ไม่มี recovery path

---

### C2. Token ที่ใช้ไปแล้ว (status=used)
**Steps:**
1. เช็กอินสำเร็จด้วย token หนึ่ง
2. เปิด link เดิมซ้ำใน tab ใหม่

**Pass:** "ลิงก์ถูกใช้งานแล้ว" + CTA แนะนำขั้นตอนต่อไป
**Fail:** สร้าง attendance log ซ้ำ · จอขาว · error เข้าใจยาก

---

### C3. Token ผิดรูปแบบ
**Steps:**
1. เปิด `/attendance?token=xxx-fake-token-xxx`

**Pass:** ข้อความไทยที่เป็นมิตร · ไม่แสดง exception trace
**Fail:** เห็น "TypeError" · "undefined" · stack trace

---

## Section D · GPS Denied Retry (4 cases)

### D1. ครั้งแรก — user ปฏิเสธ
**Steps:**
1. ใช้อุปกรณ์ที่ยังไม่เคยให้สิทธิ์ portal นี้
2. เปิดหน้า check-in
3. เมื่อ browser ขอสิทธิ์ GPS → กด "Block"

**Pass:** ข้อความไทย "กรุณาอนุญาตการเข้าถึงตำแหน่ง" · มีปุ่ม Retry มองเห็นชัด
**Fail:** infinite spinner · ข้อความอังกฤษล้วน · ไม่มี retry

---

### D2. กด Retry หลังเปิดสิทธิ์ใหม่
**Steps:**
1. เปิดสิทธิ์ location ใน browser/OS settings
2. กลับมา portal → กด Retry

**Pass:** ได้ตำแหน่ง → flow ดำเนินต่อ
**Fail:** ยังเห็น error เดิม · ต้อง refresh จึงทำงาน

---

### D3. GPS timeout (สัญญาณอ่อน)
**Steps:**
1. เปิดสิทธิ์ GPS แต่ปิด WiFi และอยู่ในห้องที่สัญญาณ GPS อ่อน
2. กดเริ่มเช็กอิน

**Pass:** แสดง timeout ภายใน 15s · มีปุ่ม retry · ไม่ infinite spinner
**Fail:** spinner ค้างเกิน 30s โดยไม่มี feedback

---

### D4. GPS ปิดที่ระดับ OS
**Steps (iOS):**
1. Settings → Privacy → Location Services → OFF
2. เปิด portal check-in

**Pass:** ข้อความไทยแนะนำให้เปิด location ใน Settings · ไม่อ้างว่าสำเร็จ
**Fail:** เช็กอินสำเร็จโดยไม่มี GPS · ข้อความสับสน

---

## Section E · Camera Denied Retry (3 cases)

### E1. ปฏิเสธสิทธิ์กล้อง
**Steps:**
1. เปิดหน้า check-in (สาขาที่บังคับ liveness)
2. เมื่อขอสิทธิ์กล้อง → Block

**Pass:** ข้อความไทย + ปุ่ม retry · (ถ้า liveness optional ต้องมี skip)
**Fail:** จอดำค้าง · ไม่มี recovery

---

### E2. ไม่มีกล้องหลัง (front-only)
**Steps:**
1. ใช้อุปกรณ์ที่มีแต่กล้องหน้า (เช่น tablet เก่า)

**Pass:** fallback ใช้กล้องหน้าได้ หรือแสดง "ไม่พบกล้องหลัง" ที่ชัดเจน
**Fail:** crash · จอดำ · ข้อความอังกฤษ

---

### E3. สลับ tab แล้วกลับ
**Steps:**
1. เริ่ม liveness → สลับไป tab อื่น 5s → กลับมา

**Pass:** กล้อง resume ได้ หรือ restart สะอาดด้วยข้อความบอก user
**Fail:** จอค้าง · ต้อง refresh

---

## Section F · Check-in / Check-out Reliability (5 cases)

### F1. Check-in ปกติใน geofence
**Pass:** success message · LINE DM ยืนยัน · `attendance_logs` มี 1 row ใหม่
**Fail:** ไม่มี DM · ไม่มี row · error

---

### F2. Check-in นอก geofence
**Pass:** ข้อความไทยบอกระยะห่างจาก branch · ไม่บันทึก
**Fail:** บันทึกสำเร็จทั้งที่อยู่นอกพื้นที่ · ข้อความสับสน

---

### F3. Double-tap ปุ่ม submit
**Steps:**
1. กดปุ่มเช็กอินสองครั้งติดเร็วที่สุดเท่าที่ทำได้
2. ตรวจ `/attendance/logs` หลังจากนั้น

**Pass:** มีเพียง 1 row ของช่วงเวลานั้น
**Fail:** มี 2 rows ซ้ำกัน

---

### F4. Check-out โดยยังไม่ได้ check-in
**Pass:** บล็อกพร้อม helpful message ภาษาไทย
**Fail:** บันทึก check-out โดยไม่มี check-in คู่กัน

---

### F5. เน็ตหลุดกลาง submit
**Steps:**
1. เริ่ม submit → ปิด WiFi/4G ทันที
2. รอ 5s → เปิดเน็ตใหม่

**Pass:** offline queue เก็บ intent · sync เมื่อ reconnect · ไม่มี duplicate
**Fail:** ข้อมูลหาย · duplicate row · ต้องส่งใหม่ด้วยมือ

---

## Section G · Admin Ops Center & Performance Dashboard (3 cases)

### G1. เปิด `/attendance/ops-center` (admin)
**Pass:** 4 sections (LIFF / Check-in counts / Pending / Setup) render < 2s · ตัวเลขตรงกับ `/attendance/logs` ของวันนี้
**Fail:** ตัวเลขขัดแย้ง · loading ค้าง · console error

---

### G2. เปิด `/attendance/portal-performance` (admin)
**Pass:**
- KPI 4 ใบ (First Paint / LIFF Init / Check-in Latency / Error Rate) มีตัวเลข
- Event volume table แสดงทุก event_name ที่เคย emit
- Auto-refresh toggle ทำงานทุก 30s
- ไม่มี console error
**Fail:** KPI เป็น 0 ทั้งหมดทั้งที่มีข้อมูล · table empty · refresh ไม่ทำงาน

---

### G3. เปิดหน้าเดิมในฐานะ `field` หรือ `user`
**Pass:** ถูก redirect ไปหน้าที่เข้าได้ (per `webapp_page_config`) · ไม่เห็น UI ของ ops/perf
**Fail:** เห็นข้อมูลทั้งหน้า · privilege escalation

---

## Section H · Performance Regression Sanity (2 cases)

### H1. Lighthouse audit `/portal/`
**Steps:**
1. Chrome DevTools → Lighthouse → Mobile preset → Performance
2. รัน audit

**Pass:** Performance score ≥ 70 · ไม่มี render-blocking critical
**Fail:** Performance < 50 · LCP > 6s · TBT > 800ms

---

### H2. Bundle inspection
**Steps:**
1. เปิด `/portal/` (ไม่ไป checkin) → DevTools Network → Filter "JS"
2. ค้นหา `mediapipe` หรือ `liveness` ในรายชื่อไฟล์

**Pass:** ไม่พบ MediaPipe ใน initial chunk · พบเฉพาะตอนเข้า `/attendance` หรือ `/portal/checkin`
**Fail:** MediaPipe โหลดทันทีตอนเปิด `/portal/`

---

## Section I · Sign-off

| Field | Value |
|---|---|
| Tester name | _________________ |
| Date / Time | _________________ |
| Devices used | Android: ____ · iOS: ____ · Desktop: ____ |
| Total cases | 25 |
| ✅ PASS count | ____ |
| ⚠️ PARTIAL count | ____ |
| ❌ FAIL count | ____ |
| Evidence link | `/attendance/portal-performance` snapshot at sign-off |

### Verdict
- [ ] ✅ **READY FOR PILOT** — ทุก case PASS หรือ PARTIAL ที่ไม่ใช่ blocker
- [ ] ❌ **NEEDS FIX** — มี FAIL ใน Section C (expired link), F (reliability), G (admin block) → ต้องแก้ก่อน

### Blocker list (ถ้ามี)
1. _____________________________________________
2. _____________________________________________
3. _____________________________________________

---

**ผู้อนุมัติ / Approver:** _________________   **วันที่:** _________
