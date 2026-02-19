

## Bag & Reward System - UX Polish Plan

### Current Status: Production-Ready
ระบบ Bag & Reward ทำงานครบถ้วนแล้ว:
- Data: use_mode ตั้งค่าถูกต้องทุกรายการ (verified in DB)
- Edge Functions: redemption, bag item, shield logic ทำงานถูกต้อง
- Portal: RewardShop, MyBag, usage rules dialog ครบ
- Admin: Rewards table, BagManagement, EmployeeDetail bag section ครบ
- Routing + Menu: ครบทุก path

### UX Polish Items (ปรับให้ดีขึ้น)

#### 1. MyBag - แสดงวันหมดอายุ + วันที่ใช้
- **ไฟล์**: `src/pages/portal/MyBag.tsx`
- Active items: แสดง "หมดอายุ: วัน/เดือน/ปี" ถ้ามี `expires_at`
- Used items: แสดง "ใช้เมื่อ: วัน/เดือน/ปี" จาก `used_at`
- ช่วยให้พนักงานวางแผนใช้ item ก่อนหมดอายุ

#### 2. BagManagement - เพิ่มคอลัมน์วันที่
- **ไฟล์**: `src/pages/attendance/BagManagement.tsx`
- เพิ่มคอลัมน์ "Granted" (created_at) และ "Expires" (expires_at)
- Admin เห็นภาพรวมชัดขึ้นว่า item ไหนใกล้หมดอายุ

#### 3. RewardShop - Bag count badge บน Backpack icon
- **ไฟล์**: `src/pages/portal/RewardShop.tsx`
- แสดงจำนวน active items เป็น badge เล็กๆ บนปุ่ม Backpack
- ให้พนักงานรู้ว่ามี item ในกระเป๋ากี่ชิ้น

### Files to modify
```
src/pages/portal/MyBag.tsx              - เพิ่มแสดงวันหมดอายุ/วันที่ใช้
src/pages/attendance/BagManagement.tsx   - เพิ่มคอลัมน์วันที่
src/pages/portal/RewardShop.tsx         - เพิ่ม bag count badge
```

### Risk Assessment
- ความเสี่ยง: ต่ำมาก - เป็นการเพิ่ม display เท่านั้น ไม่แก้ logic
- ไม่กระทบ flow การซื้อ/ใช้/shield ที่มีอยู่
- ข้อมูลที่แสดงมาจาก field ที่มีอยู่แล้วใน DB

