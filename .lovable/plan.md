

## Feature Improvement Plan — สิ่งที่ควร Implement ต่อไป (เรียงตามความเสี่ยงต่ำสุด)

### สรุปสถานะปัจจุบัน — สิ่งที่ทำเสร็จแล้ว

| Feature | สถานะ |
|---------|--------|
| Manager Dashboard + Pending Approvals | ✅ เสร็จแล้ว |
| Notification Center (bell icon, realtime, read/unread) | ✅ เสร็จแล้ว |
| Auto-Notification on Approve/Reject | ✅ เสร็จแล้ว |
| Auto-Notification on New Request → Manager | ✅ เสร็จแล้ว |
| Notification Preferences (toggle per type) | ✅ เสร็จแล้ว |
| Broadcast with Recipient Groups | ✅ มีอยู่แล้ว (groups, employees, recipient_groups) |

---

### ลำดับ Feature ที่แนะนำ (เรียงตาม **ความเสี่ยงต่ำสุด → สูงสุด**)

#### 1. Broadcast Audience Targeting — เพิ่ม Branch/Role Filter (เสี่ยงต่ำมาก, Effort ต่ำ)

**ทำไมเสี่ยงน้อย**: Broadcast.tsx มี recipient_groups อยู่แล้ว แค่เพิ่ม UI filter ให้เลือก "ส่งเฉพาะสาขา X" หรือ "ส่งเฉพาะ role Y" แล้วกรอง employees ที่แสดงในรายชื่อ ไม่ต้องแก้ edge function หรือ DB schema

**สิ่งที่ทำ**:
- เพิ่ม branch filter dropdown + role filter ใน Broadcast.tsx (ส่วน recipient selection)
- กรอง employees list ตาม branch_id / role_id ก่อนแสดง
- ไม่แก้ `broadcast-send` edge function, ไม่แก้ DB

| File | Change |
|------|--------|
| `src/pages/Broadcast.tsx` | เพิ่ม branch/role filter UI (~30 lines) |

---

#### 2. Receipt Smart Categorization — Auto-Category + Budget Tracking Widget (เสี่ยงต่ำ, Effort ต่ำ)

**ทำไมเสี่ยงน้อย**: receipts table มี `category` field อยู่แล้ว แค่เพิ่ม logic ใน receipt-submit edge function ให้ AI ใส่ category อัตโนมัติจาก vendor/description + เพิ่ม budget usage widget ใน ReceiptAnalytics page

**สิ่งที่ทำ**:
- เพิ่ม auto-category logic ใน `receipt-submit/index.ts` (ถ้า AI extract อยู่แล้ว เพิ่ม field ใน prompt)
- เพิ่ม budget usage card ใน `ReceiptAnalytics.tsx` (query receipts sum vs quota)
- ไม่แก้ DB schema (ใช้ fields ที่มีอยู่)

| File | Change |
|------|--------|
| `supabase/functions/receipt-submit/index.ts` | เพิ่ม category ใน AI extraction prompt |
| `src/pages/receipts/ReceiptAnalytics.tsx` | เพิ่ม budget usage widget |

---

#### 3. Dashboard Overview — เพิ่ม "Action Items Today" Widget (เสี่ยงต่ำ, Effort ต่ำ)

**ทำไมเสี่ยงน้อย**: เพิ่ม card ใหม่ใน Overview.tsx ที่ query pending approvals + tasks due today แล้วแสดงเป็น checklist สั้นๆ ไม่แก้ code เดิม แค่เพิ่ม card

**สิ่งที่ทำ**:
- เพิ่ม "Today's Action Items" card ใน `Overview.tsx`
- Query: pending OT requests, pending early leave, pending receipts, overdue tasks
- แสดงเป็น clickable list ที่ navigate ไปหน้า approve

| File | Change |
|------|--------|
| `src/pages/Overview.tsx` | เพิ่ม action items card (~60 lines) |

---

#### 4. Gacha Daily Missions / Challenges (เสี่ยงต่ำ-กลาง, Effort กลาง)

**ทำไมเสี่ยงน้อย-กลาง**: ต้องสร้าง table ใหม่ (`daily_missions`, `mission_completions`) แต่เป็น additive — ไม่แก้ logic เดิมของ points/gacha เลย

**สิ่งที่ทำ**:
- Migration: สร้าง `daily_missions` + `mission_completions` tables
- เพิ่ม "Daily Missions" card ใน portal MyPoints page
- เพิ่ม mission check logic ใน point-attendance-calculator (เช็ค "มาตรงเวลา 5 วันติด" แล้วให้ bonus)

| File | Change |
|------|--------|
| `supabase/migrations/...` | สร้าง 2 tables + RLS |
| `src/pages/portal/MyPoints.tsx` | เพิ่ม Daily Missions section |
| `supabase/functions/point-attendance-calculator/index.ts` | เพิ่ม mission completion check |

---

#### 5. Attendance Predictive Insights (เสี่ยงกลาง, Effort กลาง)

**ทำไมเสี่ยงกลาง**: ต้อง query attendance_logs ย้อนหลังหลายเดือน + คำนวณ patterns — อาจ heavy query แต่ไม่แก้ flow เดิม

**สิ่งที่ทำ**:
- เพิ่ม "Pattern Insights" tab ใน Attendance Analytics page
- คำนวณ: พนักงานที่มาสายบ่อย (top 5), วันที่ขาดงานบ่อย (day of week), attendance score trend
- อาจเพิ่ม cron job สำหรับ pre-calculate weekly patterns

| File | Change |
|------|--------|
| `src/pages/attendance/Analytics.tsx` | เพิ่ม Predictive Insights tab |
| `supabase/migrations/...` | อาจสร้าง `attendance_patterns` table สำหรับ cache |

---

#### 6-10. ที่เหลือ (เสี่ยงสูงขึ้น หรือ effort สูง)

| # | Feature | เหตุผลที่เสี่ยงกว่า |
|---|---------|---------------------|
| 6 | Advanced Reporting & PDF Export | ต้องเพิ่ม dependency (pdf lib), edge function ใหม่, ซับซ้อน |
| 7 | Employee Self-Service (Document Request, Swap Shift) | ต้องสร้าง approval flow ใหม่ทั้ง set, DB tables หลายตัว |
| 8 | LINE Bot Smarter Context | แก้ line-webhook ซึ่งเป็น core critical path |
| 9 | Dashboard Customizable Widgets | ต้อง drag-and-drop lib + widget config persistence |

---

### คำแนะนำ

เริ่มจาก **#1 Broadcast Branch/Role Filter** เพราะ:
- แก้ไฟล์เดียว (Broadcast.tsx)
- ไม่แก้ edge function หรือ DB
- ใช้ data ที่มีอยู่แล้ว (employees มี branch_id + role_id)
- ทำเสร็จได้เร็ว ไม่มีความเสี่ยง

จากนั้นต่อ **#3 Dashboard Action Items** (ก็แก้ไฟล์เดียว, additive เท่านั้น)

ต้องการให้เริ่ม implement feature ไหนครับ?

