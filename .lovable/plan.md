

## แผนปรับระบบ Multi-Language (TH/EN) ทั้ง Web App

### สถานะปัจจุบัน

| ส่วน | สถานะ | หมายเหตุ |
|------|-------|----------|
| `LocaleContext` | ✅ มีแล้ว | มี `t(th, en)` function |
| `DashboardLayout` Navigation | ✅ มีแล้ว | มี `titleTh/title` ทุก item |
| Language Toggle (Admin) | ✅ มีแล้ว | Globe button ที่ header |
| Language Toggle (Portal) | ✅ เสร็จแล้ว | เพิ่ม Globe button ที่ header |
| Portal Pages | ✅ บางส่วน | ใช้ `locale` จาก PortalContext |
| Admin Pages (~50 หน้า) | 🔄 กำลังดำเนินการ | ต้องเพิ่ม translation |
| Translations File | ✅ เสร็จแล้ว | `src/lib/translations.ts` |

---

### ✅ Phase 1: Portal Language Toggle - เสร็จแล้ว

**ไฟล์:** `src/components/portal/PortalLayout.tsx`
- เพิ่มปุ่ม Globe สำหรับ toggle ภาษาใน header ✅

---

### ✅ Phase 2: Shared Translation Constants - เสร็จแล้ว

**สร้างไฟล์:** `src/lib/translations.ts` ✅

---

### 🔄 Phase 3: ปรับ Admin Pages (ทีละกลุ่ม)

##### ✅ กลุ่ม 1: Attendance Module - เสร็จแล้ว

| ไฟล์ | สถานะ | หมายเหตุ |
|------|-------|----------|
| `Employees.tsx` | ✅ เสร็จ | title, buttons, labels |
| `Payroll.tsx` | ✅ เสร็จ | header, description |
| `Dashboard.tsx` | ✅ เสร็จ | title, loading state |
| `Logs.tsx` | ✅ เสร็จ | title, pagination, filters |

##### กลุ่ม 2-6: รอดำเนินการ

- Dashboard & Overview
- Points & Rewards
- Receipts Module
- Settings & Configuration
- Other Admin Pages
  
  // Common
  loading: { th: 'กำลังโหลด...', en: 'Loading...' },
  noData: { th: 'ไม่มีข้อมูล', en: 'No data' },
  success: { th: 'สำเร็จ', en: 'Success' },
  error: { th: 'เกิดข้อผิดพลาด', en: 'Error' },
  
  // Table headers
  name: { th: 'ชื่อ', en: 'Name' },
  status: { th: 'สถานะ', en: 'Status' },
  date: { th: 'วันที่', en: 'Date' },
  time: { th: 'เวลา', en: 'Time' },
  actions: { th: 'Actions', en: 'Actions' },
  branch: { th: 'สาขา', en: 'Branch' },
  role: { th: 'Role', en: 'Role' },
  employee: { th: 'พนักงาน', en: 'Employee' },
  
  // Specific modules (ใช้ EN สำหรับคำ technical)
  payroll: { th: 'Payroll', en: 'Payroll' },
  overtime: { th: 'OT', en: 'OT' },
  checkIn: { th: 'Check-in', en: 'Check-in' },
  checkOut: { th: 'Check-out', en: 'Check-out' },
  dashboard: { th: 'Dashboard', en: 'Dashboard' },
  analytics: { th: 'Analytics', en: 'Analytics' },
} as const;

// Helper type
export type TranslationKey = keyof typeof translations;
```

---

#### Phase 3: ปรับ Admin Pages (ทีละกลุ่ม)

##### กลุ่ม 1: Attendance Module (สำคัญที่สุด - หน้าปัจจุบันของ user)

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `Employees.tsx` | แปลง title, buttons, labels |
| `Payroll.tsx` | แปลง table headers, status |
| `EmployeeDetail.tsx` | แปลง tabs, labels |
| `Dashboard.tsx` | แปลง cards, stats |
| `Logs.tsx` | แปลง filters, status |

**ตัวอย่างการแปลง `Employees.tsx`:**

```typescript
// ก่อน
<CardTitle>Employees</CardTitle>
<CardDescription>Manage employee records</CardDescription>

// หลัง
import { useLocale } from '@/contexts/LocaleContext';

const { t } = useLocale();

<CardTitle>{t('พนักงาน', 'Employees')}</CardTitle>
<CardDescription>{t('จัดการข้อมูลพนักงาน', 'Manage employee records')}</CardDescription>
```

##### กลุ่ม 2: Dashboard & Overview

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `Overview.tsx` | แปลง stat cards, system health |
| `HealthMonitoring.tsx` | แปลง status indicators |

##### กลุ่ม 3: Points & Rewards

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `HappyPoints.tsx` | แปลง leaderboard, stats |
| `PointTransactions.tsx` | แปลง transaction types |
| `Rewards.tsx` | แปลง reward items |

##### กลุ่ม 4: Receipts Module

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `Receipts.tsx` | แปลง table, filters |
| `ReceiptAnalytics.tsx` | แปลง charts |

##### กลุ่ม 5: Settings & Configuration

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `Settings.tsx` | แปลง form labels |
| `UserManagement.tsx` | แปลง user table |
| `RoleManagement.tsx` | แปลง role permissions |

##### กลุ่ม 6: Other Admin Pages

- Groups, Users, Knowledge Base, Tasks, etc.

---

### หลักการเลือกภาษา

| คำ/วลี | ใช้ภาษา | เหตุผล |
|--------|---------|--------|
| Dashboard, Analytics | EN | ศัพท์ tech คุ้นเคย |
| Payroll, OT | EN | ใช้กันทั่วไป |
| Check-in/out | EN | เข้าใจง่ายกว่า "ลงเวลาเข้า" |
| Export, Import, Filter | EN | UI standard |
| พนักงาน, สาขา, วันลา | TH | เข้าใจง่ายกว่า |
| อนุมัติ, ปฏิเสธ, รอดำเนินการ | TH | context ชัดเจนกว่า |
| บันทึก, ยกเลิก, แก้ไข | TH | actions พื้นฐาน |

---

### ไฟล์ที่ต้องแก้ไข (รวม ~60 ไฟล์)

**สร้างใหม่:**
- `src/lib/translations.ts`

**แก้ไข:**
1. `src/components/portal/PortalLayout.tsx` - เพิ่ม language toggle
2. `src/pages/attendance/Employees.tsx` - แปลง UI
3. `src/pages/attendance/Payroll.tsx` - แปลง UI
4. `src/pages/attendance/Dashboard.tsx` - แปลง UI
5. ... (และอีก ~55 ไฟล์)

---

### แนะนำ: Implementation แบบ Incremental

เนื่องจากมีหลายไฟล์ ขอเสนอให้ implement ทีละกลุ่ม:

1. **รอบแรก**: Portal Language Toggle + Attendance Module (10 ไฟล์)
2. **รอบสอง**: Dashboard & Overview (5 ไฟล์)
3. **รอบสาม**: Points & Rewards (5 ไฟล์)
4. ... ต่อไปเรื่อยๆ

ต้องการให้เริ่มจากกลุ่มไหนก่อน?

---

### หมายเหตุทางเทคนิค

- ใช้ `t(th, en)` pattern จาก `useLocale()` ที่มีอยู่แล้ว
- ไม่ต้องสร้าง i18n library ใหม่ (KISS principle)
- Locale จะ persist ใน localStorage
- Admin และ Portal ใช้ locale store เดียวกัน

