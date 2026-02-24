

## สิ่งที่ต้องทำ + Feature ที่กระทบน้อยสุด

### 0. แก้ Build Error ก่อน (บังคับ)

**ไฟล์**: `supabase/functions/ai-query-test/index.ts` line 435

```typescript
// ก่อน:
return new Response(JSON.stringify({ error: error.message || "Internal error" }), {

// หลัง:
return new Response(JSON.stringify({ error: (error as Error).message || "Internal error" }), {
```

แก้ 1 จุด, risk ศูนย์

---

### Feature ที่กระทบน้อยสุด (จัดลำดับตาม risk ต่ำ → สูง)

| ลำดับ | Feature | ทำไม risk ต่ำ | Effort |
|-------|---------|--------------|--------|
| 1 | **Feature Flags RLS → admin only** | แก้ RLS policy 1 ตาราง, ไม่แตะ code | 5 นาที |
| 2 | **Receipt Smart Categorization** | เพิ่ม logic ใน receipt-submit ที่มีอยู่, ไม่แก้ schema | ต่ำ |
| 3 | **Broadcast Audience Targeting** | Broadcast.tsx มี recipient_groups อยู่แล้ว, เพิ่ม filter UI | ต่ำ |
| 4 | **Notification Center** | สร้าง table + page ใหม่ทั้งหมด, ไม่แตะของเดิม | กลาง |
| 5 | **Manager Dashboard** | สร้าง page ใหม่ดึง data จาก table ที่มีอยู่, ไม่แก้ logic เดิม | กลาง |
| 6 | **Gacha Daily Missions** | เพิ่ม table + UI ใหม่, แตะ point system เล็กน้อย | กลาง |
| 7 | **Attendance Predictive Insights** | ต้องเพิ่ม AI processing + cron job ใหม่ | กลาง-สูง |
| 8 | **Dashboard Widgets** | แก้ Overview.tsx ที่มีอยู่, อาจกระทบ layout | สูง |
| 9 | **Broadcast refactor** | 2,144 บรรทัด แก้เยอะ, เสี่ยง regression | สูง |

---

### แนะนำเริ่มที่: Feature Flags RLS + Build Error Fix

ทั้งสองอย่างแก้เร็ว (รวม < 10 นาที), กระทบศูนย์

หลังจากนั้นเลือกได้:
- **ถ้าต้องการ value เร็ว**: Notification Center (page ใหม่ ไม่แตะของเดิม)
- **ถ้าต้องการ security**: Feature Flags RLS
- **ถ้าต้องการ UX ดีขึ้น**: Manager Dashboard (รวม pending approvals ไว้ที่เดียว)

