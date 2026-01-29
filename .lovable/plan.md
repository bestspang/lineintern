

## แผนเพิ่ม Option: ส่ง Auto Checkout ไป Admin Group

### สถานะปัจจุบัน

**มีอยู่แล้ว:**
- `auto_checkout_notify_dm` - ส่งไปหาพนักงาน
- `auto_checkout_notify_group` - ส่งไปกลุ่มประกาศ (Branch/Announcement Group)
- `admin_line_group_id` - LINE Group สำหรับ Admin (ใช้กับ Team Health Reports)

**ขาด:**
- Option สำหรับส่ง Auto Checkout notifications ไปยัง Admin Group

---

### การแก้ไข

#### 1. Database Migration - เพิ่ม column ใหม่

```sql
ALTER TABLE attendance_settings
ADD COLUMN IF NOT EXISTS auto_checkout_notify_admin_group BOOLEAN DEFAULT false;

COMMENT ON COLUMN attendance_settings.auto_checkout_notify_admin_group IS 
  'Send auto-checkout notification to admin LINE group';
```

| Column | Type | Default | คำอธิบาย |
|--------|------|---------|---------|
| `auto_checkout_notify_admin_group` | boolean | **false** | ส่งแจ้งเตือนไป Admin Group |

---

#### 2. แก้ไข Edge Function - `auto-checkout-midnight`

**ไฟล์:** `supabase/functions/auto-checkout-midnight/index.ts`

**แก้ไข Query ดึง settings (บรรทัด 169-176):**
```typescript
const { data: notifySettings } = await supabase
  .from('attendance_settings')
  .select('auto_checkout_notify_dm, auto_checkout_notify_group, auto_checkout_notify_admin_group, admin_line_group_id')
  .eq('scope', 'global')
  .maybeSingle();

const notifyDM = notifySettings?.auto_checkout_notify_dm ?? true;
const notifyGroup = notifySettings?.auto_checkout_notify_group ?? true;
const notifyAdminGroup = notifySettings?.auto_checkout_notify_admin_group ?? false;
const adminGroupId = notifySettings?.admin_line_group_id;
```

**เพิ่ม Logic ส่งไป Admin Group (หลังบรรทัด 386):**
```typescript
// Send summary to Admin Group (if enabled)
// Note: ส่งหลัง loop เสร็จ เป็น summary รวม
```

**แต่!** เนื่องจากต้องการส่งรายคน → เพิ่มใน loop (หลัง branch group):
```typescript
// Post to Admin Group (only if enabled and different from announcement group)
if (notifyAdminGroup && adminGroupId && adminGroupId !== announcementGroupId) {
  let adminMessage = `🌙 Auto Check Out: ${employee.full_name}\n`;
  adminMessage += `⏰ 23:59 (ไม่ได้ Check Out ตามปกติ)\n`;
  adminMessage += `📊 เวลาทำงาน: ${hoursWorked.toFixed(1)} ชม.`;
  
  if (overtimeHours > 0) {
    adminMessage += `\n⚠️ OT ไม่ได้รับอนุมัติ: ${overtimeHours.toFixed(1)} ชม.`;
  }

  await fetchWithRetry(
    'https://api.line.me/v2/bot/message/push',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lineAccessToken}`
      },
      body: JSON.stringify({
        to: adminGroupId,
        messages: [{ type: 'text', text: adminMessage }]
      })
    },
    { maxRetries: 2 }
  );
}
```

---

#### 3. แก้ไข UI Settings Page

**ไฟล์:** `src/pages/attendance/Settings.tsx`

**เพิ่มใน formData state (บรรทัด 43-45):**
```typescript
auto_checkout_notify_dm: true,
auto_checkout_notify_group: true,
auto_checkout_notify_admin_group: false, // NEW
```

**เพิ่มใน useEffect sync (บรรทัด 131-133):**
```typescript
auto_checkout_notify_dm: (settings as any).auto_checkout_notify_dm ?? true,
auto_checkout_notify_group: (settings as any).auto_checkout_notify_group ?? true,
auto_checkout_notify_admin_group: (settings as any).auto_checkout_notify_admin_group ?? false, // NEW
```

**เพิ่ม UI Switch ใหม่ (หลังบรรทัด 557):**
```tsx
<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label htmlFor="auto_checkout_notify_admin_group">ส่งแจ้งเตือนไป Admin Group</Label>
    <p className="text-sm text-muted-foreground">
      ส่งข้อมูล Auto Checkout ไปยัง Admin LINE Group (สำหรับ HR/Manager)
    </p>
  </div>
  <Switch
    id="auto_checkout_notify_admin_group"
    checked={formData.auto_checkout_notify_admin_group}
    onCheckedChange={(checked) => setFormData({ ...formData, auto_checkout_notify_admin_group: checked })}
    disabled={!formData.admin_line_group_id}
  />
</div>

{!formData.admin_line_group_id && (
  <p className="text-sm text-amber-600">
    ⚠️ กรุณาตั้งค่า Admin LINE Group ด้านล่างก่อนใช้งาน option นี้
  </p>
)}
```

---

### Behavior Matrix (อัปเดต)

| DM | Branch Group | Admin Group | ผลลัพธ์ |
|----|--------------|-------------|--------|
| ✓ | ✓ | ✗ | ส่ง DM + Branch (เหมือนเดิม) |
| ✓ | ✗ | ✓ | ส่ง DM + Admin Group |
| ✓ | ✓ | ✓ | ส่งทั้ง 3 ช่องทาง |
| ✗ | ✗ | ✓ | ส่งเฉพาะ Admin Group |
| ✗ | ✗ | ✗ | ไม่ส่ง notification ใดๆ |

---

### สรุปการเปลี่ยนแปลง

| รายการ | รายละเอียด |
|--------|-----------|
| **Migration** | เพิ่ม 1 column `auto_checkout_notify_admin_group` |
| **Edge Function** | เพิ่ม ~20 บรรทัด (query + condition + send) |
| **Settings UI** | เพิ่ม ~15 บรรทัด (Switch + warning) |
| **Default** | **ปิด** (false) - ต้องเปิดเองหลังตั้งค่า Admin Group |
| **Smart Logic** | ไม่ส่งซ้ำถ้า Admin Group = Branch Group |

