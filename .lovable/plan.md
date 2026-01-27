
## แผนแก้ไข: แสดง Active Employees ทุกคนในหน้า Receipt Quota

### ปัญหาปัจจุบัน
- ระบบปัจจุบัน: ดึงข้อมูลจาก `receipt_usage` → map กับ `users` → แสดงเฉพาะคนที่มี usage record (6 คน)
- ปัญหา: พนักงาน active มี 8 คน แต่แสดงแค่ 6 คนที่เคยใช้ AI receipt

### การแก้ไข

**ไฟล์:** `src/pages/receipts/ReceiptQuota.tsx`

#### 1. เพิ่ม Query ดึง Active Employees

เพิ่ม query ใหม่เพื่อดึง employees ที่ active จาก `employees` table:

```typescript
// Fetch active employees 
const { data: employees = [], isLoading: employeesLoading } = useQuery({
  queryKey: ['active-employees-for-quota'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, line_user_id')
      .eq('status', 'active')
      .not('line_user_id', 'is', null);
    if (error) throw error;
    return data;
  },
});
```

#### 2. เปลี่ยน Logic การสร้าง `userQuotaData`

เปลี่ยนจาก `usageRecords.map()` → `employees.map()`:

```typescript
// Build user quota display data - NOW BASED ON EMPLOYEES
const userQuotaData: UserQuotaDisplay[] = employees.map(emp => {
  // หา usage record (ถ้ามี)
  const usage = usageRecords.find(u => u.line_user_id === emp.line_user_id);
  
  // หา subscription (ถ้ามี) 
  const subscription = subscriptions.find(s => s.line_user_id === emp.line_user_id);
  
  // หา plan หรือใช้ default plan
  const defaultPlanId = (defaultPlanSetting?.setting_value as { plan_id?: string })?.plan_id || 'free';
  const plan = plans.find(p => p.id === (subscription?.plan_id || defaultPlanId)) || 
    plans.find(p => p.id === 'free') || 
    { id: 'free', name: 'Free', ai_receipts_limit: 8, price_thb: 0 };
  
  // Used = 0 ถ้ายังไม่มี usage record
  const used = usage?.ai_receipts_used || 0;
  const limit = plan.ai_receipts_limit;
  const isUnlimited = limit === -1;
  const percentUsed = isUnlimited ? 0 : (limit > 0 ? (used / limit) * 100 : 0);
  
  let status: 'ok' | 'warning' | 'exceeded' = 'ok';
  if (!isUnlimited) {
    if (percentUsed >= 100) status = 'exceeded';
    else if (percentUsed >= 80) status = 'warning';
  }
  
  return {
    lineUserId: emp.line_user_id!,
    displayName: emp.full_name || 'Unknown',
    planId: plan.id,
    planName: plan.name,
    used,
    limit,
    period: currentPeriod,
    status,
    percentUsed,
  };
});
```

#### 3. อัปเดต Loading State

```typescript
const isLoading = plansLoading || usageLoading || subsLoading || employeesLoading || defaultPlanLoading;
```

---

### ผลลัพธ์ที่คาดหวัง

| User | Plan | Usage | Status |
|------|------|-------|--------|
| Baifern | Infinite | 8 / ∞ | OK |
| Ing | Infinite | 7 / ∞ | OK |
| Best | Infinite | 7 / ∞ | OK |
| Wariss | Infinite | 2 / ∞ | OK |
| D! | Infinite | 0 / ∞ | OK |
| -🧸 | Infinite | 0 / ∞ | OK |
| **Nu** | **Free** | **0 / 8** | **OK** |
| **โม** | **Free** | **0 / 8** | **OK** |

---

### รายละเอียดทางเทคนิค

| การเปลี่ยนแปลง | รายละเอียด |
|--------------|-----------|
| เพิ่ม Query | `employees` table (status = 'active', line_user_id not null) |
| เปลี่ยน Logic | Base loop จาก `usageRecords` → `employees` |
| อัปเดต Loading | รวม `employeesLoading` |
| ลบ Query เดิม | `users-for-quota` (ไม่จำเป็นแล้ว) |

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|--------------|
| `src/pages/receipts/ReceiptQuota.tsx` | เปลี่ยน data source จาก users → employees |

### ความเสี่ยง
- **ต่ำมาก** - ไม่กระทบ logic การ reset quota หรือ change plan (ใช้ line_user_id เหมือนเดิม)
- ชื่อที่แสดงจะเปลี่ยนจาก `display_name` (users table) → `full_name` (employees table)
