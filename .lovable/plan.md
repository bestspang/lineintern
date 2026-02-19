
## Gacha Box System - ระบบสุ่มกล่องสุ่มรางวัล

### Overview
เพิ่มระบบ Gacha Box ที่ admin สามารถกำหนด % การสุ่มของแต่ละรางวัลได้ และ Portal ฝั่ง user จะมี animation gamify ให้ลุ้นว่าจะได้อะไร

### สถานะปัจจุบัน
- มี reward "Gacha Box" อยู่แล้วใน `point_rewards` (50 pts, micro category, icon: 🎲)
- แต่ยังไม่มี logic สุ่มจริง - แค่เป็น reward ธรรมดา
- ระบบ reward/bag/redemption ทำงานสมบูรณ์อยู่แล้ว

### Architecture

```text
+--------------------+       +---------------------+      +------------------+
| Admin: Rewards.tsx | ----> | DB: gacha_box_items | <--- | Edge Function:   |
| (Config % prizes)  |       | (reward_id, %, etc) |      | point-redemption |
+--------------------+       +---------------------+      | (gacha_pull)     |
                                                           +--------+---------+
                                                                    |
                                                           +--------v---------+
                                                           | Portal: GachaBox |
                                                           | (Spin animation) |
                                                           +------------------+
```

---

### DB Changes (1 new table)

**`gacha_box_items`** - กำหนดรายการรางวัลในกล่องสุ่ม

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| reward_id | uuid FK -> point_rewards | Gacha Box reward ตัวไหน |
| prize_name | text | ชื่อรางวัล (EN) |
| prize_name_th | text | ชื่อรางวัล (TH) |
| prize_icon | text | emoji |
| prize_type | text | 'reward' (ให้ bag item), 'points' (คืนแต้ม), 'nothing' (ปลอบใจ) |
| prize_value | int | จำนวนแต้มที่ได้ (กรณี points), หรือ reward_id ที่จะ grant |
| prize_reward_id | uuid FK -> point_rewards (nullable) | ถ้า type=reward ให้ reward ตัวนี้เป็น bag item |
| weight | int | น้ำหนักการสุ่ม (เช่น 50 = 50%) |
| rarity | text | 'common', 'rare', 'epic', 'legendary' |
| is_active | boolean | เปิด/ปิด |
| created_at | timestamptz | |

---

### ไฟล์ที่สร้าง/แก้ไข

| ไฟล์ | ประเภท | รายละเอียด |
|------|--------|-----------|
| DB Migration | สร้างใหม่ | `gacha_box_items` table + RLS |
| `src/pages/attendance/Rewards.tsx` | แก้ไข | เพิ่มปุ่ม "Manage Gacha" สำหรับ reward ที่ชื่อ Gacha Box |
| `src/pages/attendance/GachaBoxSettings.tsx` | สร้างใหม่ | Admin UI จัดการ % รางวัลในกล่อง |
| `src/pages/portal/GachaBox.tsx` | สร้างใหม่ | Portal หน้าสุ่มพร้อม animation |
| `supabase/functions/point-redemption/index.ts` | แก้ไข | เพิ่ม action 'gacha_pull' |
| `supabase/functions/portal-data/index.ts` | แก้ไข | เพิ่ม endpoint 'gacha-items' |
| `src/App.tsx` | แก้ไข | เพิ่ม route `/portal/gacha` |
| `src/pages/portal/index.tsx` | แก้ไข | export GachaBox |

---

### รายละเอียดทางเทคนิค

#### 1. DB: `gacha_box_items` Table
- weight-based probability: ไม่ใช่ % ตรงๆ แต่เป็น "น้ำหนัก" เช่น weight=50 จาก total weight=100 = 50%
- Admin UI จะแสดงเป็น % โดยคำนวณจาก weight/totalWeight*100
- RLS: service_role เท่านั้นที่ insert/update, anon สามารถ select ได้ (ใช้ผ่าน portal-data)

#### 2. Admin: GachaBoxSettings.tsx
- Dialog ที่เปิดจากปุ่ม "Manage Gacha" ใน Rewards.tsx
- แสดงรายการ prizes แต่ละตัวพร้อม weight (%) 
- เพิ่ม/แก้ไข/ลบ prizes
- แสดง total weight และ % ของแต่ละรายการแบบ real-time
- Rarity badges: common (เทา), rare (น้ำเงิน), epic (ม่วง), legendary (ทอง)
- Prize types: 
  - "points" = ได้แต้มคืน (เช่น 10-30 pts)
  - "reward" = ได้ reward item ใส่ bag (เลือกจาก point_rewards)
  - "nothing" = ได้คำปลอบใจ (0 pts)

#### 3. Edge Function: gacha_pull action
- รับ: employee_id, reward_id (ของ Gacha Box)
- ตรวจสอบ: balance, cooldown เหมือน redeem ปกติ
- สุ่ม: weighted random จาก gacha_box_items ที่ is_active=true
- ผลลัพธ์:
  - type=points: เพิ่ม points กลับ (net cost = gacha_cost - prize_value)
  - type=reward: สร้าง bag item ให้
  - type=nothing: ไม่ได้อะไร (เสีย points ไปเฉยๆ)
- Return: { success, prize: { name, icon, type, value, rarity }, animation_seed }

#### 4. Portal: GachaBox.tsx (Gamify Animation)
- **Phase 1: เตรียมสุ่ม**
  - แสดง Gacha Box 3D-ish card พร้อม sparkle effect
  - ปุ่ม "สุ่มเลย! (50 pts)" พร้อมแสดง balance
  - แสดง prize pool preview (รายการที่สุ่มได้ + rarity)

- **Phase 2: Animation สุ่ม** (หลังกดปุ่ม + API call สำเร็จ)
  - Slot machine style: รายการ prizes วิ่งผ่านเร็วๆ แล้วค่อยๆ ช้าลง
  - ใช้ CSS animation + requestAnimationFrame
  - Duration: 3 วินาที
  - Sound feedback ผ่าน vibration API (navigator.vibrate) สำหรับมือถือ

- **Phase 3: Reveal**
  - รางวัลที่ได้ปรากฏขึ้นพร้อม confetti effect (CSS-based)
  - Rarity-based styling:
    - Common: border เทา, no glow
    - Rare: border น้ำเงิน, subtle glow
    - Epic: border ม่วง, purple glow + particles
    - Legendary: border ทอง, golden glow + screen shake + confetti
  - แสดงชื่อรางวัล + icon + จำนวนแต้มที่ได้/เสีย
  - ปุ่ม "สุ่มอีกครั้ง" + "กลับ"

- **Navigation**: เข้าถึงได้จาก RewardShop (เมื่อกด Gacha Box reward card จะพาไป `/portal/gacha` แทนที่จะเปิด confirm dialog ปกติ)

---

### Integration กับระบบเดิม (ไม่แตะ logic เดิม)

1. **RewardShop.tsx**: เพิ่ม check - ถ้า reward เป็น gacha type ให้ navigate ไป `/portal/gacha` แทน confirm dialog
2. **point-redemption**: เพิ่ม case 'gacha_pull' ใน switch - ไม่กระทบ case อื่น
3. **portal-data**: เพิ่ม endpoint ใหม่ - ไม่กระทบ endpoint เดิม
4. **Rewards.tsx**: เพิ่มปุ่ม conditional - ไม่แก้ flow เดิม

### การป้องกัน Regression
- ไม่แก้ไข processRedemption, approveRedemption, rejectRedemption, useBagItem
- ไม่แก้ไข MyBag, MyPoints, MyRedemptions, PortalHome
- ไม่เปลี่ยน query keys เดิม
- Gacha เป็น feature แยกอิสระ ใช้ table ใหม่ + action ใหม่
- RewardShop แค่เพิ่ม redirect condition ไม่แก้ redeem flow

### Smoke Test
1. Admin: สร้าง Gacha Box prizes ใน Settings > Rewards > Manage Gacha
2. Admin: ตรวจสอบว่า % รวมแสดงถูกต้อง
3. Portal: เข้า Reward Shop > กด Gacha Box > ถูก redirect ไปหน้า Gacha
4. Portal: กดสุ่ม > เห็น animation > เห็นผลลัพธ์
5. Portal: ตรวจว่าแต้มหักถูกต้อง
6. Portal: ถ้าได้ reward item > ไปเช็คใน My Bag ว่ามี
7. Portal: ถ้าได้ points > ไปเช็ค My Points ว่าแต้มเพิ่ม
8. Portal: ตรวจว่า reward อื่นๆ ยังแลกได้ปกติ (regression check)
9. Admin: ตรวจว่า Reward Management ยังทำงานปกติ
