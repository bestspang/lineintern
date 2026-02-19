

## 3 Tasks: E2E Verification + Daily Pull Limit + Gacha History

---

### Task 1: E2E Verification - MyBag Gacha Labeling

จากข้อมูลใน DB มี gacha transaction 1 รายการ (employee f22c919b) ที่สุ่มไป 50 pts
- MyBag.tsx (line 97-101): มี logic `granted_by === 'gacha'` แล้ว จะแสดง "สุ่มได้จาก Gacha" -- VERIFIED CORRECT
- ไม่ต้องแก้ไขเพิ่มเติม

---

### Task 2: Daily Pull Limit สำหรับ Gacha Box

**สิ่งที่ต้องทำ:**

1. **Migration**: เพิ่ม column `daily_pull_limit` (integer, default NULL = unlimited) ใน `point_rewards` table
   ```sql
   ALTER TABLE point_rewards ADD COLUMN daily_pull_limit integer DEFAULT NULL;
   ```

2. **Backend** (`supabase/functions/point-redemption/gacha.ts`): เพิ่ม daily limit check หลัง cooldown check (step 4.5)
   - Query `point_transactions` นับจำนวน gacha pulls วันนี้ (Bangkok timezone)
   - ถ้าเกิน limit -> return error พร้อมข้อความ
   ```typescript
   // 4.5 Check daily pull limit
   if (reward.daily_pull_limit && reward.daily_pull_limit > 0) {
     const bangkokToday = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
     const todayStart = new Date(bangkokToday);
     todayStart.setHours(0, 0, 0, 0);
     // Convert back to UTC for DB query
     const todayStartUTC = new Date(todayStart.getTime() - 7 * 60 * 60 * 1000);
     
     const { count } = await supabase
       .from('point_transactions')
       .select('id', { count: 'exact', head: true })
       .eq('employee_id', employee_id)
       .eq('category', 'gacha')
       .eq('transaction_type', 'spend')
       .gte('created_at', todayStartUTC.toISOString());
     
     if ((count || 0) >= reward.daily_pull_limit) {
       return jsonResponse({
         success: false,
         error: `Daily limit reached (${reward.daily_pull_limit} pulls/day)`,
         daily_limit: reward.daily_pull_limit,
         pulls_today: count,
       }, 400);
     }
   }
   ```

3. **Frontend** (`src/pages/portal/GachaBox.tsx`): แสดง daily pull count + limit
   - เพิ่ม query นับจำนวนครั้งที่สุ่มวันนี้ (ผ่าน portal-data endpoint ใหม่)
   - แสดงข้อความ "สุ่มแล้ว X/Y ครั้งวันนี้" ใต้ปุ่มสุ่ม
   - Disable ปุ่มเมื่อถึง limit

4. **Backend** (`supabase/functions/portal-data/index.ts`): เพิ่ม endpoint `gacha-daily-count`
   - Return จำนวนครั้งที่สุ่มวันนี้ + daily_limit

5. **Admin** (`src/pages/attendance/GachaBoxSettings.tsx`): เพิ่ม input field สำหรับตั้ง daily_pull_limit
   - Input number, placeholder "ไม่จำกัด", save ลง point_rewards

---

### Task 3: Gacha History Page

**สิ่งที่ต้องทำ:**

1. **Backend** (`supabase/functions/portal-data/index.ts`): เพิ่ม endpoint `gacha-history`
   ```typescript
   case 'gacha-history': {
     const result = await supabase
       .from('point_transactions')
       .select('id, amount, description, balance_after, metadata, created_at')
       .eq('employee_id', employee_id)
       .eq('category', 'gacha')
       .eq('transaction_type', 'spend')
       .order('created_at', { ascending: false })
       .limit(50);
     data = result.data;
     error = result.error;
     break;
   }
   ```

2. **Frontend**: สร้างไฟล์ `src/pages/portal/GachaHistory.tsx`
   - แสดง list ของ gacha pulls ย้อนหลัง
   - แต่ละรายการแสดง: icon, ชื่อรางวัล (จาก metadata), rarity, วันที่สุ่ม, แต้มที่ใช้
   - กรอง metadata เพื่อดึง `prize_name`, `rarity` จาก transaction metadata
   - ใช้ Bangkok timezone สำหรับ display
   - Empty state เมื่อยังไม่เคยสุ่ม

3. **Routing**: เพิ่ม route `/portal/gacha-history` ใน `App.tsx`

4. **Export**: เพิ่มใน `src/pages/portal/index.tsx`

5. **Navigation**: เพิ่มลิงก์ "ประวัติการสุ่ม" ใน GachaBox.tsx (ในส่วน idle phase)

---

### Files to modify

| File | Change | Risk |
|------|--------|------|
| `supabase/functions/point-redemption/gacha.ts` | เพิ่ม daily limit check | ต่ำ (additive logic) |
| `supabase/functions/portal-data/index.ts` | เพิ่ม 2 endpoints ใหม่ | ต่ำ (new cases only) |
| `src/pages/portal/GachaBox.tsx` | แสดง daily count + link to history | ต่ำ |
| `src/pages/portal/GachaHistory.tsx` | ไฟล์ใหม่ | ไม่มี (new file) |
| `src/pages/portal/index.tsx` | เพิ่ม export | ไม่มี |
| `src/App.tsx` | เพิ่ม route | ต่ำ |
| `src/pages/attendance/GachaBoxSettings.tsx` | เพิ่ม daily_pull_limit input | ต่ำ |

### What will NOT be touched
- point-redemption/index.ts (switch case ไม่เปลี่ยน)
- MyBag.tsx, BagManagement.tsx, EmployeeDetail.tsx (แก้ไปแล้ว)
- RewardShop.tsx, MyRedemptions.tsx
- Auth, routing อื่น, cron jobs

### DB Migration
```sql
ALTER TABLE point_rewards ADD COLUMN daily_pull_limit integer DEFAULT NULL;
COMMENT ON COLUMN point_rewards.daily_pull_limit IS 'Max gacha pulls per day per employee. NULL = unlimited.';
```

### Regression Checklist
1. Gacha pull ปกติยังทำงานได้ (ไม่มี daily_pull_limit = unlimited)
2. RewardShop ยังแสดงรางวัลปกติ
3. MyBag ยังแสดง label ถูกต้อง
4. Cooldown check ยังทำงาน (ไม่กระทบ daily limit)
5. Admin GachaBoxSettings ยังตั้งค่าได้
6. Portal routing ไม่มี conflict

