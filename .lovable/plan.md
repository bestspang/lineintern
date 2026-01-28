

## แผนการแก้ไขและเพิ่มฟีเจอร์ LINE Intern Portal

### ภาพรวม

แผนนี้ครอบคลุม 3 งานหลัก:
1. ปรับ FAQ sort_order ที่ซ้ำกัน
2. เพิ่ม LINE Push Notification เมื่อยกเลิกคำขอจาก Portal
3. แสดง Pending Count แยกตามประเภทบน Badge

---

### Task 1: FAQ sort_order Cleanup

**ปัญหา:** มี sort_order ซ้ำกัน (5, 10) ทำให้ลำดับการแสดงผลไม่ชัดเจน

**Solution:** รัน SQL Migration เพื่อปรับ sort_order ให้ไม่ซ้ำ

```sql
-- ปรับ sort_order ให้ไม่ซ้ำกัน
UPDATE portal_faqs SET sort_order = 4.5 
WHERE question_th = 'ฉันจะ checkout นอกสถานที่ได้อย่างไร?';

UPDATE portal_faqs SET sort_order = 10.1 
WHERE question_th = 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?';

UPDATE portal_faqs SET sort_order = 10.2 
WHERE question_th = 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?';

UPDATE portal_faqs SET sort_order = 10.3 
WHERE question_th = 'ฉันจะยกเลิกคำขอลางานได้อย่างไร?';
```

**ความเสี่ยง:** ต่ำมาก - ปรับ display order เท่านั้น

---

### Task 2: LINE Push Notification เมื่อยกเลิกคำขอ

**ปัญหา:** เมื่อพนักงานยกเลิกคำขอจาก Portal ไม่มี LINE notification ยืนยัน

**Solution:** เพิ่มการส่ง LINE Push ใน `portal-data/index.ts` สำหรับ:
- `cancel-my-request` (OT / Day-Off)
- `cancel-leave-request` (Leave)

**การ Implementation:**

1. **ดึง employee info ก่อน update:**
   ```typescript
   // ดึง line_user_id และชื่อ
   const { data: employee } = await supabase
     .from('employees')
     .select('line_user_id, full_name')
     .eq('id', employee_id)
     .maybeSingle();
   ```

2. **ส่ง LINE Push หลัง cancel สำเร็จ:**
   ```typescript
   // ส่ง LINE notification ยืนยันการยกเลิก
   const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
   if (LINE_ACCESS_TOKEN && employee?.line_user_id) {
     const message = requestType === 'ot'
       ? `🚫 คำขอ OT ของคุณถูกยกเลิกแล้ว\n\nหากต้องการขอใหม่ สามารถทำได้ที่ Portal`
       : `🚫 คำขอวันหยุดของคุณถูกยกเลิกแล้ว\n\nหากต้องการขอใหม่ สามารถทำได้ที่ Portal`;
     
     await fetch('https://api.line.me/v2/bot/message/push', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         to: employee.line_user_id,
         messages: [{ type: 'text', text: message }]
       })
     }).catch(e => console.error('[portal-data] LINE push error:', e));
   }
   ```

**ไฟล์ที่แก้ไข:** `supabase/functions/portal-data/index.ts`
- Lines 1320-1365 (cancel-my-request) - เพิ่ม LINE push
- Lines 1406-1443 (cancel-leave-request) - เพิ่ม LINE push

**ความเสี่ยง:** ต่ำ - เพิ่ม notification หลัง cancel logic เสร็จ, ไม่กระทบ existing logic

---

### Task 3: Pending Count Breakdown Badge

**ปัญหา:** Badge แสดง totalPending รวมกัน ไม่ทราบว่ามีกี่ OT, Day-Off, Leave

**Solution:** เพิ่ม Tooltip ที่แสดง breakdown เมื่อ hover/tap บน badge

**การ Implementation ใน PortalHome.tsx:**

```typescript
// เพิ่ม Tooltip component
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ในส่วน Pending Badge (lines 469-473)
{showPendingBadge && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="absolute top-2 right-8 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 z-10 cursor-help">
          {totalPending}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        <div className="space-y-1">
          {pendingCounts?.ot > 0 && (
            <p>🕐 OT: {pendingCounts.ot}</p>
          )}
          {pendingCounts?.dayoff > 0 && (
            <p>📅 Day-Off: {pendingCounts.dayoff}</p>
          )}
          {pendingCounts?.leave > 0 && (
            <p>🏖️ Leave: {pendingCounts.leave}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

**ความเสี่ยง:** ต่ำมาก - เปลี่ยน UI display เท่านั้น

---

### สรุปไฟล์ที่จะแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| Database (SQL) | ปรับ sort_order ใน portal_faqs |
| `supabase/functions/portal-data/index.ts` | เพิ่ม LINE push notification ใน cancel endpoints |
| `src/pages/portal/PortalHome.tsx` | เพิ่ม Tooltip แสดง pending breakdown |

---

### ลำดับการ Implementation

```text
1. Database Migration (FAQ sort_order)
   └── ปรับ sort_order ให้ไม่ซ้ำ

2. portal-data/index.ts
   ├── เพิ่ม LINE push ใน cancel-my-request
   └── เพิ่ม LINE push ใน cancel-leave-request

3. PortalHome.tsx
   ├── Import Tooltip components
   └── เพิ่ม Tooltip wrapper รอบ Badge
```

---

### Regression Prevention

- **Task 1:** ไม่แตะ content หรือ category ของ FAQ
- **Task 2:** เพิ่ม notification หลัง existing cancel logic (ไม่แก้ไข logic เดิม)
- **Task 3:** ห่อ Badge ด้วย Tooltip เท่านั้น (ไม่แตะ logic อื่น)

---

### Technical Details

**LINE Push API Pattern (จาก overtime-approval/index.ts):**
```typescript
if (LINE_ACCESS_TOKEN && employee.line_user_id) {
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: employee.line_user_id,
        messages: [{ type: 'text', text: message }]
      })
    });
  } catch (e) {
    console.error('Failed to notify employee', e);
  }
}
```

**Tooltip Pattern (จาก existing UI components):**
- ใช้ `@/components/ui/tooltip` ที่มีอยู่แล้ว
- รองรับทั้ง mobile (tap) และ desktop (hover)

