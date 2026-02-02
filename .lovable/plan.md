

## แผนแก้ไข - เพิ่ม Toggle "อนุญาตเข้าสาย" ใน AttendanceEditDialog

### ปัญหาที่พบ
Toggle "อนุญาตเข้าสาย" ถูกเพิ่มใน `ScheduleCalendar.tsx` (หน้าจัดกะล่วงหน้า) แต่ไม่ได้เพิ่มใน `AttendanceEditDialog.tsx` (หน้าแก้ไขข้อมูลย้อนหลัง) ที่ user กำลังใช้งาน

| Component | มี Toggle? | ใช้สำหรับ |
|-----------|-----------|----------|
| ScheduleCalendar | ✅ มี | จัดกะล่วงหน้า |
| AttendanceEditDialog | ❌ ไม่มี | แก้ไขข้อมูลย้อนหลัง (screenshot) |

---

### การแก้ไข

#### 1. เพิ่ม State และ Import ใน AttendanceEditDialog.tsx

```tsx
// เพิ่ม import
import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "lucide-react";

// เพิ่ม state
const [approvedLateStart, setApprovedLateStart] = useState(false);
const [approvedLateReason, setApprovedLateReason] = useState('');
```

#### 2. เพิ่ม UI Section (หลัง Status Selection, ก่อน Time Fields)

```tsx
{/* Approved Late Start Toggle - แสดงเมื่อเลือกสถานะ "มาทำงาน" */}
{selectedStatus === 'present' && (
  <>
    <Separator />
    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <Label className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            อนุญาตเข้าสาย
          </Label>
        </div>
        <Switch
          checked={approvedLateStart}
          onCheckedChange={setApprovedLateStart}
        />
      </div>
      {approvedLateStart && (
        <div className="space-y-1.5">
          <Label className="text-xs text-emerald-600">เหตุผล</Label>
          <Textarea
            value={approvedLateReason}
            onChange={(e) => setApprovedLateReason(e.target.value)}
            placeholder="เช่น ทำงานกะพิเศษถึงเที่ยงคืน"
            className="min-h-[60px] text-sm"
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        ⚠️ พนักงานจะยังได้รับคะแนน Punctuality และ Streak ต่อเนื่อง
      </p>
    </div>
  </>
)}
```

#### 3. อัพเดท Save Logic

เพิ่ม `approved_late_start` และ `approved_late_reason` ใน adjustment data:

```tsx
const adjustmentData = {
  // ... existing fields
  override_status: approvedLateStart ? 'on_time' : (selectedStatus || null),
  approved_late_start: approvedLateStart,
  approved_late_reason: approvedLateStart ? approvedLateReason : null,
};
```

#### 4. อัพเดท useEffect - Initialize State

```tsx
useEffect(() => {
  if (existingAdjustment) {
    // ... existing code
    setApprovedLateStart(existingAdjustment.approved_late_start || false);
    setApprovedLateReason(existingAdjustment.approved_late_reason || '');
  } else {
    // ... reset
    setApprovedLateStart(false);
    setApprovedLateReason('');
  }
}, [existingAdjustment, currentData, open]);
```

---

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/components/attendance/AttendanceEditDialog.tsx` | เพิ่ม toggle, state, และ save logic |

---

### ผลลัพธ์ที่คาดหวัง

**Before:**
```
┌─────────────────────────────────────┐
│ แก้ไขข้อมูลวันที่ 30 มกราคม         │
├─────────────────────────────────────┤
│ สถานะ: [○ มาทำงาน] [○ ลา...]       │
├─────────────────────────────────────┤
│ เวลาเข้า-ออก: [____] [____]        │  ← ไม่มี toggle
├─────────────────────────────────────┤
│ เหตุผล: [________________]          │
└─────────────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────────┐
│ แก้ไขข้อมูลวันที่ 30 มกราคม         │
├─────────────────────────────────────┤
│ สถานะ: [● มาทำงาน] [○ ลา...]       │
├─────────────────────────────────────┤
│ ┌───────────────────────────────┐   │
│ │ 🛡️ อนุญาตเข้าสาย      [ON] │   │  ← Toggle ใหม่!
│ │ เหตุผล: [กะพิเศษถึงเที่ยงคืน]│   │
│ │ ⚠️ ยังได้คะแนน Punctuality  │   │
│ └───────────────────────────────┘   │
├─────────────────────────────────────┤
│ เวลาเข้า-ออก: [13:30] [00:15]      │
├─────────────────────────────────────┤
│ เหตุผล: [________________]          │
└─────────────────────────────────────┘
```

---

### หมายเหตุ

เมื่อเปิด toggle "อนุญาตเข้าสาย":
- `override_status` จะถูกบันทึกเป็น `on_time` (แทนที่ `present` ปกติ)
- ระบบคำนวณ points จะมองว่าพนักงานมาตรงเวลา
- Streak จะไม่ถูก reset

