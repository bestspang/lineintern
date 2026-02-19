

## Gacha Box System - Bug Fix & End-to-End Verification

### สถานะปัจจุบัน
- Backend: `gacha_pull` action ทำงานถูกต้อง (ทดสอบแล้ว - return error "No prizes configured" เพราะยังไม่มี prizes)
- Portal: GachaBox.tsx, RewardShop.tsx redirect logic ถูกต้อง
- Admin: GachaBoxSettings.tsx **มี bug ทำให้ crash เมื่อกดเพิ่ม prize**

---

### Bug ที่พบ (ยืนยันจากการทดสอบจริง)

#### GachaBoxSettings.tsx - Radix SelectItem value="" crash
- **อาการ**: กดปุ่ม "Add Prize" แล้ว app crash ทันที
- **Error**: `A <Select.Item /> must have a value prop that is not an empty string`
- **Root cause**: บรรทัด 272: `<SelectItem value="">None</SelectItem>` — Radix UI ไม่ยอมรับ value เป็น string ว่าง
- **แก้ไข**: เปลี่ยนเป็น `<SelectItem value="none">None</SelectItem>` แล้วแปลงกลับเป็น null ตอน submit

---

### ไฟล์ที่แก้ไข

| ไฟล์ | การแก้ไข | ความเสี่ยง |
|------|----------|-----------|
| `src/pages/attendance/GachaBoxSettings.tsx` | Fix SelectItem value + แปลง "none" -> null ตอน submit | ต่ำมาก |

---

### รายละเอียดทางเทคนิค

**แก้ไข 1: SelectItem value (บรรทัด 269-272)**
```tsx
// BEFORE (crashes)
<Select name="prize_reward_id" defaultValue={editingItem?.prize_reward_id || ''}>
  ...
  <SelectItem value="">None</SelectItem>

// AFTER (fixed)
<Select name="prize_reward_id" defaultValue={editingItem?.prize_reward_id || 'none'}>
  ...
  <SelectItem value="none">None</SelectItem>
```

**แก้ไข 2: handleSubmit conversion (บรรทัด 126)**
```tsx
// BEFORE
prize_reward_id: (fd.get('prize_reward_id') as string) || null,

// AFTER
prize_reward_id: ((fd.get('prize_reward_id') as string) === 'none' ? null : (fd.get('prize_reward_id') as string)) || null,
```

---

### การป้องกัน Regression
- ไม่แตะ gacha.ts, point-redemption/index.ts, GachaBox.tsx, RewardShop.tsx, portal-data
- แก้เฉพาะ Admin UI form ที่ crash
- Logic การ save/load ไม่เปลี่ยน (null ยังเก็บเป็น null ใน DB)

### Smoke Test หลังแก้
1. Admin: กดปุ่ม Manage Gacha -> กด Add Prize -> ไม่ crash
2. Admin: เพิ่ม prize type "nothing" (weight 50) -> save สำเร็จ
3. Admin: เพิ่ม prize type "points" value 20 (weight 30) -> save สำเร็จ
4. Admin: เพิ่ม prize type "reward" เลือก reward (weight 20) -> save สำเร็จ
5. Portal: ไป Reward Shop > กด Gacha Box > redirect ไป /portal/gacha
6. Portal: กดสุ่ม > เห็น animation > เห็นผลลัพธ์
7. Portal: ถ้าได้ reward item > ไปเช็คใน My Bag ว่ามี
8. Portal: rewards อื่นๆยังแลกได้ปกติ
