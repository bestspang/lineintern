

## เพิ่มปุ่มไปหน้า "แต้มของฉัน" ในหน้าร้านค้ารางวัล

### ปัญหา
ตอนนี้หน้า RewardShop มีแค่ปุ่ม ArrowLeft (ลูกศรย้อนกลับ) ที่ไปหน้า MyPoints ซึ่งดูแปลกเพราะเหมือนเป็นการ "ย้อนกลับ" แต่จริง ๆ คือคนละหน้ากัน

### สิ่งที่จะทำ

**แก้ไฟล์เดียว**: `src/pages/portal/RewardShop.tsx`

1. **เปลี่ยน header layout**: ย้ายปุ่ม ArrowLeft ออก แล้วเพิ่มปุ่ม icon (Coins) ที่มุมขวาบนของ header เพื่อไปหน้า MyPoints
2. Header จะเป็น:
   - ซ้าย: ไอคอน Gift + ชื่อ "ร้านค้ารางวัล"
   - ขวา: ปุ่ม Coins icon ไปหน้า `/portal/my-points`

### รายละเอียดทางเทคนิค

```text
Before:
  [<-] Gift ร้านค้ารางวัล

After:
  Gift ร้านค้ารางวัล              [Coins icon]
```

- ปุ่มขวาบนใช้ icon `Coins` (เหรียญ) เพื่อสื่อว่าไปหน้าแต้ม
- ใช้ `variant="ghost" size="icon"` ให้กลมกลืนกับ design
- ไม่กระทบ feature อื่นใด เป็นการเปลี่ยน layout ของ header เท่านั้น

