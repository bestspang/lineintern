

## แผนแก้ไข: Sync Menu Groups ใน Role Management

### ปัญหาที่พบ

#### ปัญหา 1: menuGroupLabels ไม่ครบ
`RoleManagement.tsx` มี hardcoded `menuGroupLabels` เพียง **7 groups** แต่ database มี **13 groups**:

| ใน Code (7) | ขาดหายไป (6) |
|-------------|--------------|
| Dashboard | Schedule & Leaves |
| Attendance | Overtime |
| Management | Payroll |
| AI Features | Points & Rewards |
| Content & Knowledge | Deposits |
| Configuration | Receipts |
| Monitoring & Tools | |

#### ปัญหา 2: Employee role มี config แต่ไม่แสดง
Employee role มี `webapp_menu_config` ครบ 13 groups แล้ว แต่เนื่องจาก `menuGroupLabels` มีแค่ 7 groups ทำให้ไม่แสดง groups ที่เหลือ

---

### วิธีแก้ไข

**แก้ไขไฟล์:** `src/pages/settings/RoleManagement.tsx`

เปลี่ยนจาก hardcoded `menuGroupLabels` ให้รวม groups ที่ขาดหายไป:

```typescript
const menuGroupLabels: Record<string, { label: string; description: string }> = {
  'Dashboard': { label: 'Dashboard', description: 'หน้าแรก ภาพรวมระบบ' },
  'Attendance': { label: 'Attendance', description: 'ระบบลงเวลา พนักงาน สาขา' },
  'Schedule & Leaves': { label: 'Schedule & Leaves', description: 'กะงาน วันหยุด วันลา' },
  'Overtime': { label: 'Overtime', description: 'การทำงานล่วงเวลา OT' },
  'Payroll': { label: 'Payroll', description: 'เงินเดือน ประวัติการทำงาน' },
  'Points & Rewards': { label: 'Points & Rewards', description: 'แต้มสะสม รางวัล' },
  'Deposits': { label: 'Deposits', description: 'เงินมัดจำพนักงาน' },
  'Receipts': { label: 'Receipts', description: 'ใบเสร็จ การอนุมัติ' },
  'Management': { label: 'Management', description: 'จัดการงาน คำสั่ง การแจ้งเตือน' },
  'AI Features': { label: 'AI Features', description: 'ความจำ บุคลิกภาพ การวิเคราะห์' },
  'Content & Knowledge': { label: 'Content & Knowledge', description: 'FAQ Knowledge Base การฝึกอบรม' },
  'Configuration': { label: 'Configuration', description: 'ตั้งค่าระบบ การเชื่อมต่อ' },
  'Monitoring & Tools': { label: 'Monitoring & Tools', description: 'Logs การตรวจสอบสุขภาพระบบ' },
};
```

---

### ผลลัพธ์หลังแก้ไข

| ก่อนแก้ไข | หลังแก้ไข |
|-----------|-----------|
| แสดง 7 menu groups | แสดง 13 menu groups ครบ |
| Employee role ไม่แสดง | Employee role แสดงครบทุก group |
| ไม่มี Overtime, Payroll, etc. | มีครบตาม sidebar จริง |

### ไฟล์ที่ต้องแก้ไข
1. `src/pages/settings/RoleManagement.tsx` - เพิ่ม menu groups ที่ขาดหายไป

### หมายเหตุ
- ไม่ต้องแก้ database เพราะ `webapp_menu_config` มี groups ครบแล้วสำหรับทุก role รวมถึง employee
- การเพิ่ม `menuGroupLabels` จะทำให้ UI แสดง groups เพิ่มเติมโดยอัตโนมัติ

