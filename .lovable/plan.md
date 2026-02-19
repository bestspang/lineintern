

## วิเคราะห์สถานะปัจจุบัน + แผนพัฒนาต่อ

### สิ่งที่ implement แล้ว
- Database: ตาราง `employee_bag_items` + column `use_mode` ใน `point_rewards` (migration done)
- Portal: หน้า MyBag.tsx (แสดง/ใช้ item) + ปุ่ม Backpack ใน RewardShop header
- Portal: RewardShop.tsx ปรับ flow ซื้อ (choose/bag_only/use_now)
- Admin: BagManagement.tsx (ดู/grant/revoke items)
- Admin: Rewards.tsx เพิ่ม use_mode dropdown
- Edge Function: point-redemption เพิ่ม action `redeem_to_bag` + `use_bag_item`
- Edge Function: portal-data เพิ่ม endpoint `my-bag-items` + `employee-bag-items`
- Routing: App.tsx มี route `/portal/my-bag` + `/attendance/bag-management`

### ปัญหาที่พบ (Critical Bugs)

#### 1. Duplicate destructuring ใน point-redemption (CRITICAL - edge function จะ crash)
บรรทัด 32-34 มี `const { action, ... } = await req.json();` **สองครั้ง** ซึ่งจะทำให้เกิด syntax error ตอน runtime:
```
line 32: const { action, employee_id, reward_id, ... } = await req.json();
line 34: const { action, employee_id, reward_id, ..., bag_item_id } = await req.json();
```
ต้องลบบรรทัด 32 ออก เหลือแค่บรรทัด 34 ที่มี `bag_item_id`

#### 2. Streak Shield logic ยังใช้ `happy_points.streak_shields` (ไม่ได้ migrate ใช้ bag)
ตาม plan ควรปรับ `point-attendance-calculator` ให้เช็คจาก `employee_bag_items` แทน `happy_points.streak_shields` แต่ยังไม่ได้ทำ โค้ดยังอ้างอิง `happyPoints.streak_shields` ทั้ง 2 จุด (missed day + late check-in)

#### 3. EmployeeDetail.tsx ยังไม่มี bag section
ตาม plan ควรเพิ่ม tab/section แสดง bag items ของพนักงานในหน้า Employee Detail แต่ยังไม่ได้ทำ

### แผนพัฒนาต่อ (เรียงตามความสำคัญ)

#### Task 1: แก้ Bug Critical - Duplicate destructuring (point-redemption)
- **ไฟล์**: `supabase/functions/point-redemption/index.ts`
- **แก้**: ลบบรรทัด 32 (duplicate `const`) เหลือแค่บรรทัด 34 ที่รวม `bag_item_id`
- **ความเสี่ยง**: ต่ำ (ลบบรรทัดซ้ำออก)

#### Task 2: ปรับ Streak Shield ให้ใช้ bag system
- **ไฟล์**: `supabase/functions/point-attendance-calculator/index.ts`
- **แก้ 2 จุด** (missed work day + late check-in):
  1. แทนที่การเช็ค `happyPoints.streak_shields` ด้วยการ query `employee_bag_items` หา item ที่ `status = 'active'` AND `item_type = 'shield'`
  2. เมื่อ shield ถูกใช้: update bag item เป็น `status = 'used'` + `used_at = now()` แทนการลด `streak_shields` counter
  3. ยัง update `happy_points.streak_shields` ด้วยเพื่อ backward compatibility
  4. ข้อความแจ้ง LINE เดิมยังใช้ได้ไม่ต้องเปลี่ยน

#### Task 3: เพิ่ม Bag section ใน EmployeeDetail
- **ไฟล์**: `src/pages/attendance/EmployeeDetail.tsx`
- **แก้**: เพิ่ม tab หรือ card section แสดง bag items ของพนักงานคนนั้น
- Query จาก `employee_bag_items` where `employee_id` = params.id
- แสดง icon, ชื่อ, status, granted_by, วันที่ได้/ใช้

### ไฟล์ที่จะแก้ไข (รวม 3 ไฟล์)

```text
supabase/functions/point-redemption/index.ts        - ลบ duplicate destructuring
supabase/functions/point-attendance-calculator/index.ts - ปรับ shield logic ใช้ bag
src/pages/attendance/EmployeeDetail.tsx              - เพิ่ม bag items section
```

### Smoke Test หลัง implement
1. เรียก point-redemption edge function ได้โดยไม่ crash (ไม่มี syntax error)
2. ซื้อ Streak Shield -> item ปรากฏใน bag
3. เมื่อมาสาย -> shield จาก bag ถูกใช้ (status = used) + LINE แจ้งเตือน
4. Admin ดูหน้า Employee Detail -> เห็น bag items ของพนักงาน
5. ซื้อรางวัลปกติ (use_now) -> ยังทำงานเหมือนเดิม

