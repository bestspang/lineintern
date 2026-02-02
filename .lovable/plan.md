
## 🔍 วิเคราะห์ปัญหา "ไม่มีสิทธิ์เข้าถึง" ที่ /overview

### Root Cause Analysis

| ปัญหา | รายละเอียด |
|-------|-----------|
| **Route Mismatch** | `getMenuGroupFromPath()` มีเฉพาะ `/` ไม่มี `/overview` |
| **Database Config** | `webapp_page_config.page_path = '/'` แต่ route จริงคือ `/overview` |
| **Redirect Logic** | `RootRedirect.tsx` ส่งทุกคนไป `/overview` โดยไม่เช็ค role |
| **Error Handling** | `ProtectedRoute.tsx` แสดง error แทนที่จะ redirect ไปหน้าที่มีสิทธิ์ |

### Flow ที่ทำให้เกิดปัญหา

```text
1. User sasikan.j (role: field) login
2. RootRedirect → Navigate to /overview
3. ProtectedRoute → canAccessPage('/overview')
4. isAdmin/isOwner? → NO (field role)
5. Find pageConfig for '/overview'? → NOT FOUND (DB มีแค่ '/')
6. getMenuGroupFromPath('/overview')? → return NULL (ไม่มี /overview)
7. NULL → DENY ACCESS → แสดง "ไม่มีสิทธิ์เข้าถึง"
```

### Database Settings สำหรับ Role `field`

| Menu Group | Can Access |
|------------|-----------|
| Dashboard | ❌ FALSE |
| Attendance | ✅ TRUE |
| Deposits | ✅ TRUE |
| Overtime | ✅ TRUE |
| Payroll | ✅ TRUE |

**หน้าที่ field เข้าได้:** `/attendance/logs`, `/attendance/live-tracking`, `/attendance/employees`, etc.

---

## 📋 แผนการแก้ไข

### Fix #1: เพิ่ม `/overview` ใน Route Mapping (CRITICAL)

**ไฟล์:** `src/hooks/usePageAccess.ts`

**ปัจจุบัน (line 117):**
```typescript
if (path === '/' || path === '/health' || path === '/config-validator') {
  return 'Dashboard';
}
```

**แก้ไขเป็น:**
```typescript
if (path === '/' || path === '/overview' || path === '/health' || path === '/config-validator') {
  return 'Dashboard';
}
```

**Risk:** Very Low - เพิ่ม path matching เท่านั้น

---

### Fix #2: แก้ ProtectedRoute ให้ Redirect เมื่อไม่มีสิทธิ์ (IMPORTANT)

**ไฟล์:** `src/components/ProtectedRoute.tsx`

**ปัญหา:** เมื่อ user เข้า `/overview` แต่ไม่มีสิทธิ์ → แสดง error
**ควรจะ:** Redirect ไปหน้าแรกที่มีสิทธิ์

**แก้ไข (line 25-33):**
```typescript
// Check page-level access
if (!canAccessPage(location.pathname)) {
  // For any restricted page, redirect to first accessible page
  const firstAccessiblePage = getFirstAccessiblePage();
  if (firstAccessiblePage) {
    return <Navigate to={firstAccessiblePage} replace />;
  }
  
  // If no accessible page found, show error
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      {/* existing error UI */}
    </div>
  );
}
```

**Risk:** Low - ปรับปรุง UX ให้ดีขึ้น

---

### Fix #3: อัพเดท Database Config (OPTIONAL)

**SQL:**
```sql
-- เพิ่ม /overview ใน webapp_page_config สำหรับทุก role
INSERT INTO webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT role, 'Dashboard', '/overview', 'Overview', 
  CASE WHEN role IN ('owner', 'admin', 'executive', 'manager', 'moderator', 'user') THEN true ELSE false END
FROM (SELECT DISTINCT role FROM webapp_page_config) r
ON CONFLICT DO NOTHING;
```

**Risk:** Low - เพิ่ม config ใหม่ ไม่แก้ไขของเดิม

---

### Fix #4: อัพเดท RootRedirect ให้ Role-Aware (OPTIONAL ENHANCEMENT)

**ไฟล์:** `src/components/RootRedirect.tsx`

**แนวคิด:** แทนที่จะส่งทุกคนไป `/overview` ควรใช้ `getFirstAccessiblePage()`

**ความท้าทาย:** RootRedirect อาจไม่มี access ถึง role hooks (ต้องตรวจสอบเพิ่ม)

---

## 📊 สรุปลำดับความสำคัญ

| Priority | Fix | Impact | Risk |
|----------|-----|--------|------|
| 🔴 **CRITICAL** | Fix #1: เพิ่ม `/overview` ใน getMenuGroupFromPath | แก้ปัญหาทันที | Very Low |
| 🟡 **IMPORTANT** | Fix #2: แก้ ProtectedRoute redirect | UX ดีขึ้น | Low |
| 🟢 **OPTIONAL** | Fix #3: อัพเดท Database | Completeness | Low |

---

## 🛡️ ผลลัพธ์หลังแก้ไข

**Before:**
```text
field user → /overview → "ไม่มีสิทธิ์เข้าถึง" ❌
```

**After:**
```text
field user → /overview → redirect to /attendance/logs ✅
admin user → /overview → เข้าได้ปกติ ✅
```

---

## ⚠️ Files ที่จะแก้ไข

| File | การเปลี่ยนแปลง | Lines Affected |
|------|--------------|----------------|
| `usePageAccess.ts` | เพิ่ม `/overview` ใน path matching | Line 117 |
| `ProtectedRoute.tsx` | เพิ่ม auto-redirect logic | Lines 25-33 |

**Protected Files (ไม่แตะ):**
- `_shared/timezone.ts`
- `command-parser.ts`
- `auto-checkout-midnight/index.ts`
- `auto-checkout-grace/index.ts`
