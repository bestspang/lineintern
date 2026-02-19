

## Bag & Reward System - Cross-Feature Sync Update

### สถานะปัจจุบัน (ตรวจสอบแล้ว)
ระบบ Bag & Reward ทำงานถูกต้อง (logic, edge functions, DB) แต่พบ **5 จุดที่ไม่ sync กัน** ระหว่างส่วนต่างๆ ของระบบ

---

### ปัญหาที่พบ (ทุกข้อตรวจสอบยืนยันแล้ว)

#### 1. Help.tsx - ขาด Quick Action "กระเป๋าของฉัน"
- **หลักฐาน**: PortalHome.tsx มี link ไป `/portal/my-bag` แต่ Help.tsx quickActions (20 รายการ) ไม่มี entry สำหรับ My Bag เลย
- **ผลกระทบ**: พนักงานหา feature กระเป๋าจากหน้า Help ไม่เจอ
- **แก้ไข**: เพิ่ม Quick Action entry (icon: Backpack, path: /portal/my-bag)

#### 2. Static FAQs - ไม่มี FAQ เรื่อง Bag
- **หลักฐาน**: STATIC_FAQS_TH/EN มี 11 ข้อ ไม่มีข้อใดอธิบาย Bag เลย
- **DB FAQs**: มี FAQ เรื่องรางวัลแค่ 2 ข้อ แต่คำตอบเป็นข้อมูลเก่า ไม่กล่าวถึง bag, use_mode, expiration
- **แก้ไข**: เพิ่ม static FAQ ใหม่ 2 ข้อ (TH+EN) อธิบาย Bag system + update DB FAQ

#### 3. DB portal_faqs - คำตอบเรื่องรางวัลล้าสมัย
- **หลักฐาน**: ตอบแค่ "กด แลก รอการอนุมัติจาก HR" แต่ระบบจริงมี:
  - use_mode 3 แบบ (use_now, bag_only, choose)
  - cooldown_days
  - stock_limit
  - auto-activate items
- **แก้ไข**: อัพเดท FAQ ใน DB ผ่าน migration + อัพเดท static fallback

#### 4. MyBag - ใช้ item แล้ว badge ไม่อัพเดท
- **หลักฐาน**: `useMutation_.onSuccess` invalidate แค่ `my-bag-items` แต่ไม่ invalidate `my-bag-count` (ที่ RewardShop ใช้แสดง badge)
- **ผลกระทบ**: กลับไป RewardShop หลังใช้ item จะเห็น badge จำนวนเก่า
- **แก้ไข**: เพิ่ม `queryClient.invalidateQueries({ queryKey: ['my-bag-count'] })`

#### 5. RewardShop - แลกรางวัลแล้ว badge ไม่อัพเดท  
- **หลักฐาน**: `redeemMutation.onSuccess` invalidate `my-bag-items` แต่ไม่ invalidate `my-bag-count`
- **ผลกระทบ**: แลกรางวัลใส่ bag แล้ว badge ยังแสดงจำนวนเก่า
- **แก้ไข**: เพิ่ม `queryClient.invalidateQueries({ queryKey: ['my-bag-count'] })`

---

### สิ่งที่ตรวจแล้วว่าไม่มีปัญหา (ไม่แก้)
- RewardShop: use_mode logic (use_now/bag_only/choose) ถูกต้อง
- MyBag: lazy expiration ทำงานใน portal-data
- MyPoints: แสดง Streak Shield info ถูกต้อง
- MyRedemptions: แสดงประวัติแลกรางวัลครบ
- PortalHome: มี link ไป rewards + my-bag ครบ
- Bot commands: ไม่มี bag/reward command ใน bot (ปกติ - features นี้เป็น portal-only)

---

### ไฟล์ที่แก้ไข

| ไฟล์ | การแก้ไข | ความเสี่ยง |
|------|----------|-----------|
| `src/pages/portal/Help.tsx` | เพิ่ม Quick Action + static FAQ | ต่ำมาก (เพิ่ม display) |
| `src/pages/portal/MyBag.tsx` | เพิ่ม invalidate `my-bag-count` | ต่ำมาก (เพิ่ม cache invalidation) |
| `src/pages/portal/RewardShop.tsx` | เพิ่ม invalidate `my-bag-count` | ต่ำมาก (เพิ่ม cache invalidation) |
| DB Migration | อัพเดท portal_faqs content | ต่ำมาก (update text เท่านั้น) |

---

### รายละเอียดทางเทคนิค

**Help.tsx Changes:**
1. เพิ่ม `Backpack` ใน import จาก lucide-react
2. เพิ่ม Quick Action:
```
{ icon: Backpack, title: 'กระเป๋าของฉัน' / 'My Bag', 
  description: 'ดูไอเทมที่เก็บไว้' / 'View stored items', 
  path: '/portal/my-bag' }
```
3. เพิ่ม static FAQ (TH): "กระเป๋าของฉัน (My Bag) คืออะไร?" -> อธิบาย bag system, expiration, auto-activate
4. เพิ่ม static FAQ (EN): "What is My Bag?" -> same in English

**Cache Fix (MyBag.tsx + RewardShop.tsx):**
```typescript
// เพิ่มบรรทัดนี้ใน onSuccess ของทั้ง 2 ไฟล์
queryClient.invalidateQueries({ queryKey: ['my-bag-count'] });
```

**DB Migration:**
- UPDATE `portal_faqs` ที่ question_th = 'ฉันจะแลกของรางวัลอย่างไร?' ให้คำตอบครอบคลุม use_mode + bag
- INSERT FAQ ใหม่เรื่อง "กระเป๋าของฉัน" (category: points)

### การป้องกัน Regression
- ไม่แตะ logic ใดๆ ของ reward/bag/redemption
- ไม่แก้ routing, PortalHome, MyPoints, MyRedemptions
- เพิ่มเฉพาะ display content + cache invalidation
- Static FAQ เป็น fallback เท่านั้น ไม่กระทบ DB FAQ ที่มีอยู่

