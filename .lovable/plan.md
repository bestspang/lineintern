

## Feature: Employee Bag (Digital Inventory System)

### Concept

สร้างระบบ "กระเป๋า" (Bag/Inventory) สำหรับพนักงาน คล้ายกระเป๋าในเกม ใช้เก็บ digital items เช่น รางวัลที่ซื้อ, Streak Shield, บัตรพิเศษ และ item ที่ admin มอบให้

### สิ่งที่จะทำ (Phase 1)

#### 1. Database: สร้างตาราง `employee_bag_items`

```text
employee_bag_items:
  id             UUID PK
  employee_id    UUID FK -> employees
  reward_id      UUID FK -> point_rewards (nullable, สำหรับ item จากร้านค้า)
  redemption_id  UUID FK -> point_redemptions (nullable)
  item_name      TEXT       (ชื่อ item)
  item_name_th   TEXT
  item_icon      TEXT       (emoji)
  item_type      TEXT       ('reward', 'shield', 'badge', 'special')
  status         TEXT       ('active', 'used', 'expired')  default 'active'
  usage_rules    TEXT       (เงื่อนไขการใช้)
  usage_rules_th TEXT
  auto_activate  BOOLEAN    default false (เช่น Streak Shield ใช้อัตโนมัติ)
  used_at        TIMESTAMPTZ
  expires_at     TIMESTAMPTZ
  granted_by     TEXT       ('purchase', 'admin_grant', 'system')
  granted_by_admin_id UUID  (nullable)
  metadata       JSONB      default '{}'
  created_at     TIMESTAMPTZ default now()
  updated_at     TIMESTAMPTZ default now()
```

- RLS: พนักงานเห็นเฉพาะ item ของตัวเอง, Admin/HR เห็นทั้งหมด

#### 2. Reward Setting: เพิ่ม field `use_mode` ใน `point_rewards`

เพิ่ม column ใน `point_rewards`:
- `use_mode` TEXT default `'use_now'` - ค่าที่เป็นไปได้:
  - `'use_now'` = ใช้ทันทีเมื่อซื้อ (behavior เดิม)
  - `'bag_only'` = เก็บเข้ากระเป๋าเท่านั้น ไม่สามารถใช้เลยได้ (เช่น Streak Shield)
  - `'choose'` = ให้ user เลือกว่าจะใช้เลยหรือเก็บ (เช่น Gacha Box)

#### 3. Portal: หน้า "My Bag" (`/portal/my-bag`)

- แสดง item ทั้งหมดในกระเป๋าของพนักงาน
- แยก tab: Active / Used / Expired
- แต่ละ item แสดง:
  - Icon + ชื่อ + สถานะ
  - ปุ่ม "ใช้" (ถ้าใช้ได้)
  - ปุ่ม "ดูเงื่อนไข" (Dialog แสดง usage_rules)
  - Label "auto-activate" สำหรับ item เช่น Streak Shield
- เข้าจาก:
  - ปุ่มกระเป๋า (Backpack icon) ที่มุมขวาบนของ Reward Shop header
  - หน้า PortalHome (quick action)

#### 4. Reward Shop: ปรับ flow การซื้อ

- เมื่อ user กดซื้อรางวัลที่มี `use_mode = 'choose'`:
  - Dialog จะแสดงตัวเลือก "ใช้เลย" / "เก็บในกระเป๋า"
- เมื่อ `use_mode = 'bag_only'`:
  - ซื้อแล้วเข้ากระเป๋าอัตโนมัติ (แสดงข้อความแจ้ง)
- เมื่อ `use_mode = 'use_now'`:
  - ทำงานเหมือนเดิม

#### 5. Edge Function: ปรับ `point-redemption`

- เพิ่ม action `'redeem_to_bag'`:
  - สร้าง record ใน `employee_bag_items` แทนการ mark เป็น used ทันที
- เพิ่ม action `'use_bag_item'`:
  - เปลี่ยน status จาก active -> used
  - ส่ง LINE notification ไปหา user + กลุ่ม admin (ถ้าจำเป็น)

#### 6. Streak Shield: ปรับ behavior

- เมื่อซื้อ Streak Shield -> สร้าง item ใน bag โดย auto_activate = true
- Logic เดิมใน `point-attendance-calculator` ที่เช็ค `happy_points.streak_shields` จะปรับมาเช็คจาก `employee_bag_items` ที่ status = 'active' AND item_type = 'shield' แทน
- เมื่อ shield ถูกใช้ -> update bag item เป็น used + ส่ง LINE แจ้ง user + group

#### 7. Admin Webapp: หน้า Bag Management

- **Employee Detail**: เพิ่ม tab/section แสดง bag items ของพนักงานคนนั้น
- **Bag Management page** (เมนูแยก ใน attendance section):
  - ดู bag items ทุกพนักงาน (filter by employee, item type, status)
  - Admin สามารถ "Grant Item" ให้พนักงาน (เช่น มอบ badge พิเศษ)
  - Admin สามารถ revoke/expire item ได้

#### 8. Admin Reward Form: เพิ่ม use_mode setting

- หน้า Rewards Management (admin) เพิ่ม dropdown เลือก use_mode ให้แต่ละ reward

### ไฟล์ที่จะแก้ไข/สร้าง

```text
NEW FILES:
  src/pages/portal/MyBag.tsx           - Portal bag page
  src/pages/attendance/BagManagement.tsx - Admin bag management

MODIFIED FILES:
  supabase/functions/portal-data/index.ts  - เพิ่ม endpoint 'my-bag-items', 'employee-bag-items'
  supabase/functions/point-redemption/index.ts - เพิ่ม action redeem_to_bag, use_bag_item
  supabase/functions/point-attendance-calculator/index.ts - ปรับ shield logic ใช้ bag
  src/pages/portal/RewardShop.tsx      - ปรับ confirm dialog (use_now/bag choice)
  src/pages/attendance/Rewards.tsx      - เพิ่ม use_mode field ใน form
  src/pages/attendance/EmployeeDetail.tsx - เพิ่ม bag section
  src/App.tsx                          - เพิ่ม routes
  src/pages/portal/index.tsx           - export MyBag
```

### Migration SQL

```text
1. ALTER TABLE point_rewards ADD COLUMN use_mode TEXT DEFAULT 'use_now';
2. UPDATE point_rewards SET use_mode = 'bag_only' WHERE name = 'Streak Shield';
3. UPDATE point_rewards SET use_mode = 'choose' WHERE name = 'Gacha Box';
4. CREATE TABLE employee_bag_items (...);
5. RLS policies for employee_bag_items
6. Migrate existing streak_shields count -> employee_bag_items records
```

### ไม่กระทบ feature เดิม

- Streak Shield logic เดิมจะถูก migrate ให้ใช้ bag แทน happy_points.streak_shields
- Point balance, transactions, leaderboard ไม่เปลี่ยน
- Redemption flow เดิม (use_mode = 'use_now') ยังทำงานเหมือนเดิม 100%

### Smoke Test

1. ซื้อรางวัล use_mode = 'choose' -> เลือกเก็บในกระเป๋า -> เห็นใน My Bag
2. ซื้อ Streak Shield -> อยู่ใน bag อัตโนมัติ (auto_activate label)
3. กดใช้ item จาก bag -> status เปลี่ยนเป็น used + LINE notification
4. Admin ดู bag ของพนักงาน -> เห็น item ทั้งหมด
5. Admin grant item ให้พนักงาน -> พนักงานเห็นใน bag
6. Streak Shield auto-activate เมื่อมาสาย -> item เปลี่ยนเป็น used + แจ้งเตือน
7. ซื้อรางวัล use_mode = 'use_now' -> ทำงานเหมือนเดิม (ไม่พัง)
8. ดูเงื่อนไขการใช้ item -> Dialog แสดงข้อมูลถูกต้อง

