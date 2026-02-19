

## เพิ่มแสดงเงื่อนไขการใช้และ Effect ของแต่ละรางวัล

### สถานะปัจจุบัน
ตาราง Rewards แสดงแค่ชื่อ, ราคา, stock, mode, status, approval แต่ไม่แสดง **description (effect)** และ **เงื่อนไขการใช้** (cooldown, valid period, etc.) ทำให้ admin ต้องกดเข้า Edit ถึงจะเห็นรายละเอียด

### ข้อมูลที่มีอยู่แล้วใน DB (ไม่ต้องเพิ่ม column)
- `description` / `description_th` = Effect ของรางวัล
- `cooldown_days` = ระยะห่างขั้นต่ำก่อนแลกซ้ำ
- `requires_approval` = ต้องขออนุมัติก่อนใช้
- `use_mode` = วิธีใช้ (ทันที / เก็บกระเป๋า / เลือก)
- `valid_from` / `valid_until` = ช่วงเวลาที่แลกได้
- `stock_limit` / `stock_used` = จำนวนจำกัด

### การแก้ไข
เพิ่ม **expandable row** ใต้แต่ละรางวัล แสดง 2 ส่วน:

**1. Effect (ผลของรางวัล)**
- แสดง description (EN) และ description_th (TH) 

**2. เงื่อนไขการใช้**
- Cooldown: "ต้องรอ X วันก่อนแลกซ้ำ" (ถ้า > 0)
- Valid Period: "แลกได้ตั้งแต่ ... ถึง ..." (ถ้ามี)
- Approval: "ต้องขออนุมัติ" (ถ้า requires_approval)
- Stock: "เหลือ X/Y ชิ้น" (ถ้ามี stock_limit)

### ไฟล์ที่แก้
- `src/pages/attendance/Rewards.tsx` (1 ไฟล์)
  - เพิ่ม state `expandedId` สำหรับ toggle แสดง/ซ่อนรายละเอียด
  - เพิ่ม Reward interface fields: `valid_from`, `valid_until`  
  - เพิ่มปุ่ม expand (ChevronDown icon) ในคอลัมน์ Reward
  - เพิ่ม collapsible TableRow ใต้แต่ละ reward แสดง Effect + Conditions
  - ใช้ icon tags สำหรับแต่ละเงื่อนไขให้อ่านง่าย

### ความเสี่ยง
- ต่ำมาก: เป็นการแสดงผลข้อมูลที่มีอยู่แล้ว ไม่แก้ logic ใดๆ
- ไม่กระทบ create/edit/delete flow

