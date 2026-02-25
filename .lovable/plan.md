

## Plan: Achievement Badges + Attendance Predictive Insights

### สิ่งที่จะทำ 2 อย่าง

---

### Feature A: Achievement Badges ใน MyPoints Page

**แนวทาง**: Computed badges (เหมือน daily missions) — คำนวณจาก data ที่มีอยู่ ไม่ต้องสร้าง table ใหม่

**Badge Categories** (computed from existing data):

| Badge | Icon | Condition | Source |
|-------|------|-----------|--------|
| 🔥 Streak 5 | Flame | `current_punctuality_streak >= 5` | `happy_points` |
| 🔥 Streak 10 | Flame | `current_punctuality_streak >= 10` | `happy_points` |
| 🔥 Streak 20 | Flame | `current_punctuality_streak >= 20` | `happy_points` |
| 🏆 Perfect Month | Trophy | ไม่ขาด ไม่สาย ทั้งเดือน | `attendance_logs` + `work_schedules` |
| ⭐ Top Earner | Star | `total_earned >= 500` | `happy_points` |
| 💎 Diamond Earner | Gem | `total_earned >= 2000` | `happy_points` |
| 💬 Fast Responder | MessageSquare | `daily_response_score >= 5` วันนี้ | `happy_points` |
| 🛡️ Shield Master | Shield | เคยมี streak shield >= 3 | `happy_points.streak_shields` |
| 👑 Longest Streak | Crown | `longest_punctuality_streak >= 30` | `happy_points` |

**Implementation**:

1. **`portal-data/index.ts`** — เพิ่ม endpoint `achievement-badges` ที่ query `happy_points` + `attendance_logs` (เดือนปัจจุบัน) แล้วคำนวณ badges ที่ unlock แล้ว

2. **`src/pages/portal/MyPoints.tsx`** — เพิ่ม "Achievement Badges" card หลัง Daily Missions card แสดง badges เป็น grid ของ icons (unlocked = สี, locked = gray)

| File | Change | Risk |
|------|--------|------|
| `supabase/functions/portal-data/index.ts` | เพิ่ม `achievement-badges` endpoint (~50 lines) | Very Low (new endpoint) |
| `src/pages/portal/MyPoints.tsx` | เพิ่ม Badges card (~60 lines) | Very Low (additive) |

---

### Feature B: Attendance Predictive Insights Tab

**แนวทาง**: เพิ่ม tab "Pattern Insights" ใน Analytics.tsx ที่ใช้ data จาก queries ที่มีอยู่แล้ว (`logs`, `employees`, `checkInLogs`) + query เพิ่มสำหรับ 90 วันย้อนหลัง

**สิ่งที่แสดง**:

1. **Top 5 พนักงานที่มาสายบ่อย** — table แสดง ชื่อ, จำนวนวันสาย, % สาย, สาขา
2. **วันที่ขาดงานบ่อย (Day of Week)** — bar chart แสดง จันทร์-อาทิตย์ ว่าวันไหนมีคนขาดมากสุด
3. **Attendance Score Trend** — line chart แสดง % on-time per week (4 สัปดาห์ล่าสุด)
4. **Risk Alerts** — cards แสดงพนักงานที่มี pattern น่าเป็นห่วง (สาย > 30% ของ check-ins)

**Implementation**:

Data computation ทั้งหมดทำ client-side จาก `logs` ที่ query มาแล้ว (useMemo) — ไม่ต้องเพิ่ม query ใหม่ ไม่ต้องเพิ่ม edge function

| File | Change | Risk |
|------|--------|------|
| `src/pages/attendance/Analytics.tsx` | เพิ่ม tab "insights" + TabsContent (~150 lines) | Very Low (additive tab) |

---

### สรุป Files Changed

| File | Change | Risk |
|------|--------|------|
| `supabase/functions/portal-data/index.ts` | เพิ่ม `achievement-badges` endpoint | Very Low |
| `src/pages/portal/MyPoints.tsx` | เพิ่ม Achievement Badges card | Very Low |
| `src/pages/attendance/Analytics.tsx` | เพิ่ม Pattern Insights tab | Very Low |

### Files NOT Changed
- DB schema — ไม่ต้อง migration (computed badges)
- Edge functions อื่น — ไม่แตะ
- Points/Gacha logic — ไม่แตะ

### Risk: Very Low
- ทั้งหมดเป็น additive — เพิ่ม tab/card/endpoint ใหม่ ไม่แก้ code เดิม
- Badges คำนวณจาก `happy_points` ที่มีอยู่แล้ว
- Insights คำนวณ client-side จาก logs ที่ query มาแล้ว
- ไม่มี DB migration

### Verification
1. เปิด Portal > MyPoints → เห็น Achievement Badges card พร้อม badges ที่ unlock/locked
2. พนักงานที่มี streak 5+ → เห็น badge 🔥 Streak 5 สว่าง
3. เปิด Attendance > Analytics > tab "Pattern Insights" → เห็น top late employees + day-of-week chart
4. เลือก branch filter → insights filter ตาม branch ด้วย
5. เลือก date range 30 วัน → weekly trend แสดง 4 สัปดาห์

