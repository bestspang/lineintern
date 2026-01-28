
## แผนเพิ่ม Profile Sync Health Dashboard

### ภาพรวม

เพิ่มหน้า Dashboard สำหรับ Admin เพื่อดู Users ที่ LINE Profile Sync ไม่สำเร็จ ช่วยให้ Admin ทราบว่า User ไหนอาจ:
- Block Bot
- ออกจาก Group แล้ว
- มีปัญหา LINE API

จากข้อมูล Database พบ Users ที่มี sync errors:
- **221 errors** - User 8da68c (ไม่มี avatar, display = "User 8da68c")
- **99 errors** - User ee717d
- **62 errors** - User 1ed6d1
- และอีก 16 users อื่นๆ

---

### สิ่งที่จะสร้าง

#### 1. หน้าใหม่: `ProfileSyncHealth.tsx`

**Features:**
- แสดงรายการ users ที่มี profile sync errors
- แสดงจำนวน error count และ last error time
- แสดงสถานะ (มี avatar หรือไม่, display_name เป็น generic หรือไม่)
- ปุ่ม "Retry Sync" เพื่อลอง fetch profile ใหม่
- ปุ่ม "Resolve All" เพื่อ mark alerts ว่า resolved

**Query ที่จะใช้:**
```typescript
// Join users กับ alerts ที่ match LINE user ID suffix
SELECT 
  u.id, u.line_user_id, u.display_name, u.avatar_url, u.last_seen_at,
  COUNT(a.id) as error_count,
  MAX(a.created_at) as last_error
FROM users u
LEFT JOIN alerts a ON a.summary LIKE '%' || RIGHT(u.line_user_id, 6) || '%'
  AND a.summary LIKE 'Failed to fetch LINE profile%'
GROUP BY u.id
HAVING COUNT(a.id) > 0
ORDER BY error_count DESC
```

**UI Components:**
- Card สำหรับ summary statistics
- Table แสดงรายละเอียด users
- Badge สำหรับสถานะ (Missing Avatar, Generic Name)
- Actions: View User, Retry Sync, Resolve Alerts

---

#### 2. เพิ่ม Route ใน App.tsx

```typescript
<Route path="/profile-sync-health" element={<ProfileSyncHealth />} />
```

---

#### 3. เพิ่ม Navigation ใน DashboardLayout.tsx

เพิ่มใน group "Monitoring & Tools":
```typescript
{ title: 'Profile Sync Health', titleTh: 'สุขภาพ Profile Sync', url: '/profile-sync-health', icon: Activity },
```

---

### Design หน้า Dashboard

```text
┌─────────────────────────────────────────────────────────────┐
│  Profile Sync Health                                        │
│  Monitor users with LINE profile sync issues                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   🔴 17     │  │   ⚠️ 473    │  │   ✅ 92%    │         │
│  │ Users with  │  │ Total       │  │ Healthy     │         │
│  │ Sync Issues │  │ Errors      │  │ Users       │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Users with Profile Sync Issues                      │   │
│  │ [Filter: All] [Retry All] [Resolve All Alerts]     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ User              │ Errors │ Last Error │ Status   │   │
│  ├───────────────────┼────────┼────────────┼──────────┤   │
│  │ 👤 User 8da68c   │  221   │ 2h ago     │ 🔴 🚫    │   │
│  │ 👤 User ee717d   │   99   │ 6d ago     │ 🔴 🚫    │   │
│  │ 👤 User 1ed6d1   │   62   │ 14h ago    │ 🔴 🚫    │   │
│  │ 👤 thebutter     │   27   │ 16d ago    │ ✅ ✅    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Legend: 🔴 No Avatar  🚫 Generic Name  ✅ Has Avatar/Name │
└─────────────────────────────────────────────────────────────┘
```

---

### ไฟล์ที่จะสร้าง/แก้ไข

| ไฟล์ | การเปลี่ยนแปลง | ความเสี่ยง |
|------|---------------|-----------|
| `src/pages/ProfileSyncHealth.tsx` | **สร้างใหม่** | ไม่มี - ไฟล์ใหม่ |
| `src/App.tsx` | เพิ่ม import + Route | ต่ำมาก - เพิ่ม 2 บรรทัด |
| `src/components/DashboardLayout.tsx` | เพิ่ม nav item | ต่ำมาก - เพิ่ม 1 บรรทัด |

---

### Regression Prevention

**สิ่งที่จะไม่แตะ:**
- ไม่แก้ไข Users.tsx ที่มีอยู่
- ไม่แก้ไข Alerts.tsx ที่มีอยู่
- ไม่เปลี่ยนโครงสร้าง Database
- ไม่เปลี่ยน Edge Functions

**การป้องกัน:**
- หน้าใหม่เป็น read-only (ดูข้อมูลอย่างเดียว)
- ใช้ existing Edge Function `fix-user-names` สำหรับ retry sync
- ไม่สร้าง dependency ใหม่

---

### Technical Details

```typescript
// src/pages/ProfileSyncHealth.tsx

interface UserWithSyncIssue {
  id: string;
  line_user_id: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string | null;
  error_count: number;
  last_error: string;
}

// Stats calculation
const stats = {
  usersWithIssues: data?.length || 0,
  totalErrors: data?.reduce((sum, u) => sum + u.error_count, 0) || 0,
  missingAvatars: data?.filter(u => !u.avatar_url).length || 0,
  genericNames: data?.filter(u => u.display_name.startsWith('User ')).length || 0,
};
```

---

### ลำดับการ Implementation

```text
1. สร้าง src/pages/ProfileSyncHealth.tsx
   ├── Stats cards component
   ├── Users table with sync issues
   ├── Filter และ actions
   └── Integration กับ fix-user-names Edge Function

2. แก้ไข src/App.tsx
   └── เพิ่ม import และ Route

3. แก้ไข src/components/DashboardLayout.tsx
   └── เพิ่ม nav item ใน "Monitoring & Tools" group
```

---

### ประโยชน์

1. **Admin Visibility** - รู้ทันทีว่า user ไหนมีปัญหา
2. **Proactive Maintenance** - สามารถ retry sync ได้โดยไม่ต้องรอ user แจ้ง
3. **Reduced Noise** - สามารถ resolve alerts แบบ bulk ได้
4. **User Health Score** - เห็นภาพรวมว่ากี่ % ของ users ที่ healthy
