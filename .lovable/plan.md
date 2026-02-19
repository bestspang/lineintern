

## Reward & Bag Portal System - Cross-Feature Sync Update

### ตรวจสอบแล้ว: สิ่งที่ทำงานถูกต้อง (ไม่แก้)
- RewardShop.tsx: use_mode logic, cache invalidation (my-bag-count) ครบ
- MyBag.tsx: lazy expiration, cache invalidation ครบ
- Help.tsx: Quick Actions มี My Bag, static FAQs มีเรื่อง Bag + Reward types ครบ
- PortalHome.tsx: มี link ไป rewards + my-bag ครบ
- portal-data: endpoints ครบ (rewards-list, my-bag-items, my-redemptions-list)
- point-redemption edge function: logic ถูกต้องทั้ง redeem/bag/approve/reject/use

---

### ปัญหาที่พบ (ยืนยันแล้วจาก code)

#### 1. MyRedemptions.tsx - "rejected" status หายไปจาก UI
- **หลักฐาน**: บรรทัด 50 filter `otherRedemptions` ใช้แค่ `['cancelled', 'expired']` แต่ edge function `rejectRedemption()` set status เป็น `'rejected'`
- **ผลกระทบ**: รายการที่ถูก reject จะไม่แสดงใน tab ไหนเลย (ตกจากทุก filter)
- **Root cause**: ตอน implement MyRedemptions ยังไม่มี reject flow หรือลืมเพิ่ม
- **แก้ไข**: 
  1. เพิ่ม `'rejected'` ใน `otherRedemptions` filter
  2. เพิ่ม case 'rejected' ใน `getStatusBadge()` แสดง badge สีแดงพร้อม rejection icon

#### 2. MyPoints.tsx - ไม่มี link ไป My Bag
- **หลักฐาน**: Quick Actions grid (บรรทัด 414-431) มีแค่ 2 ปุ่ม: "แลกรางวัล" + "ประวัติแลก" แต่ไม่มี "กระเป๋าของฉัน"
- **ผลกระทบ**: พนักงานที่ดู My Points ไม่มี shortcut ไป My Bag ต้องกลับ Home ก่อน
- **แก้ไข**: เพิ่มปุ่ม "กระเป๋าของฉัน" ในส่วน Quick Actions (เปลี่ยนจาก grid-cols-2 เป็น grid-cols-3)

---

### ไฟล์ที่แก้ไข

| ไฟล์ | การแก้ไข | ความเสี่ยง |
|------|----------|-----------|
| `src/pages/portal/MyRedemptions.tsx` | เพิ่ม 'rejected' ใน filter + badge | ต่ำมาก (เพิ่ม display) |
| `src/pages/portal/MyPoints.tsx` | เพิ่ม link ไป My Bag | ต่ำมาก (เพิ่ม UI link) |

---

### รายละเอียดทางเทคนิค

**MyRedemptions.tsx:**
1. บรรทัด 50: เปลี่ยน filter เป็น `['cancelled', 'expired', 'rejected']`
2. เพิ่ม case ใน getStatusBadge:
```tsx
case 'rejected':
  return <Badge variant="destructive" className="gap-1">
    <XCircle className="h-3 w-3" />
    {locale === 'th' ? 'ปฏิเสธ' : 'Rejected'}
  </Badge>;
```

**MyPoints.tsx:**
1. เพิ่ม import `Backpack` จาก lucide-react
2. เปลี่ยน Quick Actions grid จาก `grid-cols-2` เป็น `grid-cols-3`
3. เพิ่มปุ่มที่สาม:
```tsx
<Button asChild variant="outline" className="h-auto py-4">
  <Link to="/portal/my-bag">
    <div className="text-center">
      <Backpack className="h-6 w-6 mx-auto mb-1 text-purple-500" />
      <span className="text-sm">{locale === 'th' ? 'กระเป๋า' : 'My Bag'}</span>
    </div>
  </Link>
</Button>
```

---

### การป้องกัน Regression
- ไม่แตะ logic ใดๆ ของ reward/bag/redemption/point calculation
- ไม่แก้ portal-data, point-redemption, RewardShop, MyBag, Help, PortalHome
- เพิ่มเฉพาะ display content + navigation link
- ไม่เปลี่ยน query keys หรือ data flow

---

### Feature Suggestions (วิเคราะห์แล้วว่าปลอดภัย)

1. **Redemption Rejection Reason**: MyRedemptions สามารถแสดง `rejection_reason` ที่ admin กรอกตอน reject ได้ (field มีอยู่ใน DB แล้ว, แค่ UI ยังไม่แสดง) - เพิ่ม display text ใต้ rejected items เท่านั้น ไม่แตะ logic
2. **Bag Item Count Badge บน MyPoints**: แสดง badge จำนวน active bag items ข้างปุ่ม "กระเป๋า" เหมือนที่ RewardShop ทำ - ใช้ query key เดิม `my-bag-count`

