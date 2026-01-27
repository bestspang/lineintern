

## แผนแก้ไข Auto-Checkout และเพิ่ม Analytics Dashboard

### สรุปปัญหาที่พบจากการตรวจสอบ

#### ❌ ปัญหาหลัก: Auto-Checkout Midnight ไม่ทำงาน

จากการ test และดู logs พบว่า function `auto-checkout-midnight` มี error:
```
PGRST201: Could not embed because more than one relationship 
was found for 'employees' and 'branches'
```

**สาเหตุ:** ตาราง `employees` มี 2 FK ไปยัง `branches`:
- `branch_id` → `branches` (สาขาหลัก)
- `primary_branch_id` → `branches` (สาขาเริ่มต้น)

Supabase ไม่รู้จะใช้อันไหน จึง error

**ผลกระทบ:** พนักงาน ntp.冬至 และ Noey ไม่ได้รับ auto-checkout วันที่ 27 ม.ค.

---

### ✅ สิ่งที่ implement ไปแล้วถูกต้อง (ไม่ต้องแก้)

| Feature | สถานะ |
|---------|-------|
| Early Leave Check สำหรับ time_based | ✅ ทำงานถูกต้อง |
| Remote Checkout Request/Approval | ✅ ทำงานถูกต้อง |
| Geofence → Request Approval Flow | ✅ ทำงานถูกต้อง |
| Portal Approvals UI (Remote Checkout) | ✅ ทำงานถูกต้อง |
| ตาราง remote_checkout_requests | ✅ สร้างแล้ว |

---

### การแก้ไขที่ต้องทำ

#### Step 1: แก้ไข auto-checkout-midnight (เร่งด่วน)

**ไฟล์:** `supabase/functions/auto-checkout-midnight/index.ts`

**ตำแหน่ง:** Line 95

**การเปลี่ยนแปลง:**
```text
BEFORE (ผิด):
employees (
  ...
  branches (         ← Ambiguous!
    id, name, line_group_id
  )
)

AFTER (ถูก):
employees (
  ...
  branches:branches!employees_branch_id_fkey (   ← Explicit FK
    id, name, line_group_id
  )
)
```

---

#### Step 2: เพิ่ม Analytics Dashboard สำหรับ Request Statistics

**ไฟล์:** `src/pages/attendance/Analytics.tsx`

**เพิ่ม Section ใหม่:**

```text
┌─────────────────────────────────────────────────────────────────┐
│ 📊 สรุปคำขอพิเศษ (Requests Summary)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│ │ Early Leave  │ │ Remote       │ │ OT Requests  │              │
│ │ Requests     │ │ Checkout     │ │              │              │
│ ├──────────────┤ ├──────────────┤ ├──────────────┤              │
│ │ Total: 15    │ │ Total: 8     │ │ Total: 22    │              │
│ │ ✅ 12 อนุมัติ │ │ ✅ 6 อนุมัติ  │ │ ✅ 18 อนุมัติ │              │
│ │ ❌ 3 ปฏิเสธ   │ │ ❌ 2 ปฏิเสธ  │ │ ❌ 4 ปฏิเสธ   │              │
│ └──────────────┘ └──────────────┘ └──────────────┘              │
│                                                                 │
│ [Chart: Daily Request Trend]                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### รายละเอียดทางเทคนิค

#### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง | ความเสี่ยง |
|------|--------------|-----------|
| `auto-checkout-midnight/index.ts` | เปลี่ยน FK reference (1 บรรทัด) | ต่ำมาก |
| `src/pages/attendance/Analytics.tsx` | เพิ่ม queries และ cards สำหรับ requests | ต่ำ |

#### ไม่ต้องแก้ไข

- `attendance-submit/index.ts` - Early leave check ถูกต้องแล้ว
- `remote-checkout-request/index.ts` - ถูกต้องแล้ว
- `remote-checkout-approval/index.ts` - ถูกต้องแล้ว
- `portal-data/index.ts` - ถูกต้องแล้ว
- `ApproveRemoteCheckout.tsx` - ถูกต้องแล้ว
- `Approvals.tsx` - ถูกต้องแล้ว

---

### ลำดับการดำเนินการ

1. **แก้ไข `auto-checkout-midnight/index.ts`** - Line 95 เปลี่ยน FK reference
2. **Deploy function** - ให้ทำงานได้
3. **Test** - เรียก function ด้วย curl เพื่อยืนยัน
4. **เพิ่ม Analytics Dashboard** - Query early_leave_requests, remote_checkout_requests, overtime_requests และแสดง cards

---

### การแก้ไขข้อมูลสำหรับ ntp.冬至 และ Noey

หลังแก้ bug แล้ว สามารถ:
- รอ cron รันคืนนี้ (28 ม.ค. 00:00) → จะ auto-checkout ให้วันที่ 27 ม.ค.
- หรือ Manual checkout ผ่าน admin-checkout function

---

### ความเสี่ยง

| ความเสี่ยง | ระดับ | การลดความเสี่ยง |
|-----------|-------|----------------|
| แก้ FK reference ผิด | ต่ำมาก | เปลี่ยนแค่ 1 บรรทัด, ชัดเจน |
| Analytics query ช้า | ต่ำ | ใช้ index ที่มีอยู่แล้ว |
| กระทบ logic อื่น | ไม่มี | ไม่แตะ code ส่วนอื่น |

