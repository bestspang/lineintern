
## รายงานการตรวจสอบความสอดคล้องของระบบ LINE Intern

### ✅ สิ่งที่ทำงานถูกต้องและ up-to-date แล้ว

| Component | สถานะ | รายละเอียด |
|-----------|-------|----------|
| **MyWorkHistory.tsx** | ✅ | มี Pending OT/Day-Off/Leave requests + Cancel button + Remote Checkout History |
| **PortalHome.tsx** | ✅ | มี pending count badge บน Work History card (line 469-472) รวม OT, DayOff, Leave |
| **PointLeaderboard.tsx** | ✅ | มี Toggle Branch/All viewMode (lines 39, 127-147) ทำงานถูกต้อง |
| **portal-data/index.ts** | ✅ | มี endpoints ครบ: `my-pending-ot-requests`, `my-pending-dayoff-requests`, `my-leave-requests`, `my-remote-checkout-requests`, `cancel-my-request`, `cancel-leave-request` |
| **Help.tsx** | ✅ | มี 19 Quick Actions รวม Remote Checkout Approval, Static FAQs 6 ข้อ |
| **command-parser.ts** | ✅ | มี `/cancel-ot`, `/cancel-dayoff`, `/dayoff` และ aliases ครบ |
| **overtime-approval** | ✅ | มี LINE Push Notification ทั้ง approve และ reject (lines 186-216) |
| **flexible-day-off-approval** | ✅ | มี LINE Push Notification ทั้ง approve และ reject (lines 159-200) |
| **remote-checkout-approval** | ✅ | มี LINE Push Notification (ยืนยันจากการตรวจสอบก่อนหน้า) |

---

### 🔍 ปัญหาที่พบ (ต้องอัปเดต)

#### ปัญหาที่ 1: FAQs ไม่ครบเกี่ยวกับการยกเลิก Leave Request จาก Portal

**Root Cause:** 
- FAQs ใน database บอกว่ายกเลิก OT/Day-Off ได้เฉพาะ "พิมพ์ /cancel-ot ใน LINE Chat" 
- แต่จริงๆตอนนี้สามารถยกเลิกได้จาก Portal > Work History แล้ว
- ไม่มี FAQ เกี่ยวกับการยกเลิก Leave Request

**ไฟล์/ตารางที่ต้องแก้ไข:**
1. `portal_faqs` table - อัปเดต answer ของ Cancel OT/Day-Off FAQs
2. `portal_faqs` table - เพิ่ม FAQ สำหรับ Cancel Leave Request
3. `Help.tsx` static FAQs - อัปเดตให้ตรงกับ database

**SQL Migration:**
```sql
-- อัปเดต Cancel OT FAQ
UPDATE portal_faqs 
SET 
  answer_th = 'ไปที่ Portal > ประวัติการทำงาน จะเห็นคำขอ OT ที่รออนุมัติ กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-ot ใน LINE Chat กับบอท',
  answer_en = 'Go to Portal > Work History, you will see pending OT requests. Click "Cancel" button, or type /cancel-ot in LINE Chat with the bot.'
WHERE question_th = 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?';

-- อัปเดต Cancel Day-Off FAQ
UPDATE portal_faqs 
SET 
  answer_th = 'ไปที่ Portal > ประวัติการทำงาน จะเห็นคำขอวันหยุดที่รออนุมัติ กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-dayoff ใน LINE Chat กับบอท',
  answer_en = 'Go to Portal > Work History, you will see pending day-off requests. Click "Cancel" button, or type /cancel-dayoff in LINE Chat with the bot.'
WHERE question_th = 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?';

-- เพิ่ม Cancel Leave FAQ ใหม่
INSERT INTO portal_faqs (question_th, question_en, answer_th, answer_en, category, sort_order, is_active) VALUES
('ฉันจะยกเลิกคำขอลางานได้อย่างไร?',
 'How can I cancel a leave request?',
 'ไปที่ Portal > ประวัติการทำงาน จะเห็นคำขอลาที่รออนุมัติ กดปุ่ม "ยกเลิก" ได้เลย ไม่สามารถยกเลิกคำขอที่อนุมัติแล้วได้',
 'Go to Portal > Work History, you will see pending leave requests. Click the "Cancel" button. You cannot cancel already approved requests.',
 'leave-ot', 9.7, true);
```

**แก้ไข Help.tsx Static FAQs:**
```typescript
// อัปเดต line 21-22
{ question: 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?', answer: 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-ot ใน LINE Chat กับบอท' },
{ question: 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?', answer: 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" หรือพิมพ์ /cancel-dayoff ใน LINE Chat กับบอท' },
// เพิ่มใหม่
{ question: 'ฉันจะยกเลิกคำขอลางานได้อย่างไร?', answer: 'ไปที่ Portal > ประวัติการทำงาน กดปุ่ม "ยกเลิก" ได้เลย ไม่สามารถยกเลิกคำขอที่อนุมัติแล้วได้' },

// English static FAQs
{ question: 'How can I cancel an OT request?', answer: 'Go to Portal > Work History, click "Cancel" button, or type /cancel-ot in LINE Chat.' },
{ question: 'How can I cancel a day-off request?', answer: 'Go to Portal > Work History, click "Cancel" button, or type /cancel-dayoff in LINE Chat.' },
// เพิ่มใหม่
{ question: 'How can I cancel a leave request?', answer: 'Go to Portal > Work History and click the "Cancel" button. Already approved requests cannot be cancelled.' },
```

---

#### ปัญหาที่ 2: FAQ sort_order มี duplicate (Low Priority)

**สถานะ:** sort_order = 5, 10 มีหลาย records ซ้ำกัน
**ผลกระทบ:** ไม่มีผลต่อ functionality เพราะ query ใช้ `ORDER BY sort_order ASC` และไม่มี unique constraint

**แนะนำ (Optional):**
```sql
-- ปรับ sort_order ให้ไม่ซ้ำกัน (optional cleanup)
UPDATE portal_faqs SET sort_order = 4.5 WHERE question_th = 'ฉันจะ checkout นอกสถานที่ได้อย่างไร?';
UPDATE portal_faqs SET sort_order = 9.5 WHERE question_th = 'ฉันจะยกเลิกคำขอ OT ได้อย่างไร?';
UPDATE portal_faqs SET sort_order = 9.6 WHERE question_th = 'ฉันจะยกเลิกคำขอวันหยุดได้อย่างไร?';
```

---

### 💡 Feature Suggestions (วิเคราะห์แล้วว่าปลอดภัย)

#### Suggestion 1: เพิ่ม Quick Action ใน Help.tsx สำหรับ "ยกเลิกคำขอ"

**สถานะปัจจุบัน:** ไม่มี quick action ที่ navigate ตรงไปยังหน้าที่มี pending requests
**ข้อเสนอ:** เพิ่ม Quick Action "ยกเลิกคำขอ" ที่ลิงก์ไปยัง `/portal/my-history`
**ความเสี่ยง:** ต่ำมาก - เพิ่ม UI link ใหม่เท่านั้น

```typescript
// เพิ่มใน quickActions array ประมาณ line 135
{
  icon: XCircle,  // ต้อง import XCircle
  title: locale === 'th' ? 'ยกเลิกคำขอ' : 'Cancel Requests',
  description: locale === 'th' ? 'ยกเลิก OT/วันหยุด/ลางาน ที่รอ' : 'Cancel pending OT/leave requests',
  path: '/portal/my-history'
}
```

---

#### Suggestion 2: LINE Push Notification เมื่อยกเลิกคำขอสำเร็จ

**สถานะปัจจุบัน:** เมื่อพนักงานยกเลิกคำขอจาก Portal ไม่มี LINE notification ยืนยัน (แต่มี toast ใน UI)
**ข้อเสนอ:** ส่ง LINE push notification ยืนยันเมื่อยกเลิกสำเร็จ
**ไฟล์ที่ต้องแก้ไข:** `supabase/functions/portal-data/index.ts` ใน case `cancel-my-request` และ `cancel-leave-request`
**ความเสี่ยง:** ต่ำ - เพิ่ม notification หลัง cancel logic เสร็จ

---

#### Suggestion 3: แสดง Pending Leave Count แยกใน Pending Badge

**สถานะปัจจุบัน:** PortalHome แสดง totalPending = OT + DayOff + Leave รวมกัน
**ข้อเสนอ:** เพิ่ม tooltip หรือ breakdown แสดงว่ามีกี่ OT, กี่ Day-Off, กี่ Leave
**ความเสี่ยง:** ต่ำมาก - เปลี่ยน UI display เท่านั้น

---

### ✅ สิ่งที่ไม่ต้องแก้ไข (ยืนยันว่าทำงานถูกต้อง)

| Feature | เหตุผล |
|---------|--------|
| LINE Notification OT/Day-Off Approval | ✅ มีแล้วใน overtime-approval และ flexible-day-off-approval |
| LINE Notification Remote Checkout | ✅ มีแล้วใน remote-checkout-approval |
| Leaderboard Branch/All Toggle | ✅ มีแล้วใน PointLeaderboard.tsx |
| Cancel OT/Day-Off จาก Portal | ✅ มีแล้วใน MyWorkHistory.tsx |
| Cancel Leave จาก Portal | ✅ มีแล้วใน MyWorkHistory.tsx |
| Remote Checkout History | ✅ มีแล้วใน MyWorkHistory.tsx |
| Pending Count Badge | ✅ มีแล้วใน PortalHome.tsx |

---

### 📋 สรุปสิ่งที่ต้องทำ

| ลำดับ | Task | ไฟล์/ตาราง | ความเสี่ยง | Priority |
|-------|------|-----------|-----------|----------|
| 1 | อัปเดต FAQs เกี่ยวกับการยกเลิกคำขอ (บอกว่าทำได้จาก Portal) | `portal_faqs` table | ต่ำมาก | **สูง** |
| 2 | เพิ่ม FAQ ใหม่สำหรับยกเลิก Leave Request | `portal_faqs` table | ต่ำมาก | **สูง** |
| 3 | อัปเดต Static FAQs ใน Help.tsx | `Help.tsx` | ต่ำ | สูง |
| 4 | (Optional) เพิ่ม Quick Action "ยกเลิกคำขอ" | `Help.tsx` | ต่ำมาก | ปานกลาง |
| 5 | (Optional) ปรับ sort_order ไม่ให้ซ้ำกัน | `portal_faqs` table | ต่ำมาก | ต่ำ |

---

### Regression Prevention Checklist

- [ ] ไม่แก้ไข existing endpoints ใน portal-data - เพิ่ม/อัปเดตข้อความเท่านั้น
- [ ] ไม่แก้ไข existing cancel logic
- [ ] ไม่แก้ไข existing LINE notification logic
- [ ] ไม่แก้ไข existing Quick Actions paths
- [ ] ทดสอบว่า Help page ยังแสดงผลปกติ
- [ ] ทดสอบว่า portal_faqs query ยังทำงานปกติ
