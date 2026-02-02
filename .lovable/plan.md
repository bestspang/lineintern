
## 📋 แผนการแก้ไข 3 ปัญหา

### สรุปปัญหาที่พบ

| ปัญหา | รายละเอียด | Priority |
|-------|-----------|----------|
| **1. Invalid Groups** | "Test Team (Work Reminders)" และ "Test Group" มี LINE Group ID ไม่ถูกต้อง | Medium |
| **2. Wrong LINE API** | `refresh-member-count` ใช้ Group Summary API แทน Members Count API | High |
| **3. User Selection UX** | ต้องใส่ UUID แทนที่จะเลือกจาก dropdown | Medium |

---

## Fix #1: ลบ/อัพเดท Invalid Test Groups

**ปัญหา:**
- `Test Team (Work Reminders)` - line_group_id: `C1234567890abcdefTEST` (fake ID)
- `Test Group` - line_group_id: `test-group` (invalid format)

**วิธีแก้ไข:** Set status เป็น `inactive` แทนการลบ (เก็บ history ไว้)

**SQL:**
```sql
UPDATE groups 
SET status = 'inactive', updated_at = NOW()
WHERE id IN (
  'd871dcd7-9c91-4f5b-aa1c-5eadab53c524',  -- Test Team (Work Reminders)
  'ff0fc26e-47c7-4dd8-a0b6-b52883c5cf06'   -- Test Group
);
```

---

## Fix #2: แก้ไข refresh-member-count API Endpoint

**ปัญหา:** ใช้ `/v2/bot/group/{groupId}/summary` ซึ่ง **ไม่มี memberCount** ใน response

**LINE API Response จาก Group Summary:**
```json
{
  "groupId": "C...",
  "groupName": "...",
  "pictureUrl": "..."
}
```

**API ที่ถูกต้อง:** `/v2/bot/group/{groupId}/members/count`

**Response:**
```json
{
  "count": 5
}
```

**ไฟล์:** `supabase/functions/refresh-member-count/index.ts`

**การเปลี่ยนแปลง (Lines 100-116):**

```typescript
// Before (WRONG):
const response = await fetch(
  `https://api.line.me/v2/bot/group/${group.line_group_id}/summary`,
  ...
);
const summary = JSON.parse(responseText);
const memberCount = summary.memberCount || summary.count || 0;

// After (CORRECT):
const response = await fetch(
  `https://api.line.me/v2/bot/group/${group.line_group_id}/members/count`,
  ...
);
const countData = JSON.parse(responseText);
const memberCount = countData.count || 0;
```

---

## Fix #3: เปลี่ยน User ID Input เป็น User Selector

**ปัญหา:** User ต้องใส่ UUID แทนที่จะเลือกจาก dropdown

**วิธีแก้ไข:** เปลี่ยนจาก Input เป็น Searchable Combobox

**ไฟล์:** `src/pages/settings/UserManagement.tsx`

**การเปลี่ยนแปลง:**

1. **เพิ่ม State:**
```typescript
const [selectedUserId, setSelectedUserId] = useState<string>('');
const [userSearchTerm, setUserSearchTerm] = useState('');
```

2. **กรอง Users ที่ยังไม่มี Role:**
```typescript
const usersWithoutRole = usersWithRoles?.filter(u => !u.role) || [];
```

3. **เปลี่ยน Dialog Content (Lines 223-235):**

**Before:**
```tsx
<Label>User ID</Label>
<Input
  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  value={newUserEmail}
  onChange={(e) => setNewUserEmail(e.target.value)}
  className="font-mono text-sm"
/>
<p className="text-xs text-muted-foreground">
  UUID ของ user ที่ได้จากการสมัครสมาชิก
</p>
```

**After:**
```tsx
<Label>เลือกผู้ใช้</Label>
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" className="w-full justify-between">
      {selectedUserId ? (
        usersWithoutRole.find(u => u.user_id === selectedUserId)?.email || selectedUserId.slice(0,8)+'...'
      ) : (
        "เลือกผู้ใช้..."
      )}
      <ChevronsUpDown className="ml-2 h-4 w-4" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-full p-0">
    <Command>
      <CommandInput placeholder="ค้นหา email..." />
      <CommandEmpty>ไม่พบผู้ใช้</CommandEmpty>
      <CommandGroup>
        {usersWithoutRole.filter(u => 
          !userSearchTerm || 
          u.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
        ).map(user => (
          <CommandItem
            key={user.user_id}
            onSelect={() => {
              setSelectedUserId(user.user_id);
              setNewUserEmail(user.user_id);
            }}
          >
            <div className="flex flex-col">
              <span>{user.email || 'ไม่มี email'}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {user.user_id.slice(0,8)}...
              </span>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </Command>
  </PopoverContent>
</Popover>
```

4. **อัพเดท handleAddByUserId:**
```typescript
const handleAddByUserId = () => {
  if (!selectedUserId) {
    toast.error('กรุณาเลือกผู้ใช้');
    return;
  }
  addRoleMutation.mutate({ userId: selectedUserId, role: selectedRole });
};
```

5. **Reset state เมื่อปิด Dialog:**
```typescript
onOpenChange={(open) => {
  setIsAddDialogOpen(open);
  if (!open) {
    setSelectedUserId('');
    setNewUserEmail('');
  }
}}
```

---

## 📁 Files ที่จะแก้ไข

| File | การเปลี่ยนแปลง | Risk |
|------|--------------|------|
| `supabase/functions/refresh-member-count/index.ts` | เปลี่ยน API endpoint | Low |
| `src/pages/settings/UserManagement.tsx` | เปลี่ยน Input เป็น Combobox | Low |

---

## 🗄️ Database Changes

```sql
-- Mark invalid test groups as inactive
UPDATE groups 
SET status = 'inactive', updated_at = NOW()
WHERE id IN (
  'd871dcd7-9c91-4f5b-aa1c-5eadab53c524',
  'ff0fc26e-47c7-4dd8-a0b6-b52883c5cf06'
);
```

---

## ✅ ผลลัพธ์หลังแก้ไข

| Feature | Before | After |
|---------|--------|-------|
| Sync Member Count | ❌ Returns 0 for all groups | ✅ Returns actual count |
| Test Groups | ❌ Cause errors | ✅ Marked inactive |
| Add Role Dialog | ❌ Manual UUID input | ✅ Searchable user dropdown |

---

## 🛡️ Protected Files (ไม่แตะ)

- `_shared/timezone.ts`
- `command-parser.ts`
- `ProtectedRoute.tsx` (just updated)
- `usePageAccess.ts` (just updated)
