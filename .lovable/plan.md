

## แก้ 2 จุด: PostgREST Filter Validation + Logger Sensitive Keys

### 1. เพิ่ม UUID validation ใน cross-group-query.ts (line 83-104)

**ไฟล์**: `supabase/functions/line-webhook/utils/cross-group-query.ts`

เพิ่ม UUID regex check ก่อน `.or()` query:

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCrossGroupPolicy(
  groupId: string,
  userId: string
): Promise<CrossGroupPolicy | null> {
  // Validate UUID format to prevent filter injection
  if (!UUID_RE.test(groupId) || !UUID_RE.test(userId)) {
    console.warn("[crossGroupQuery] Invalid UUID format", { groupId: !!groupId, userId: !!userId });
    return null;
  }
  // ... existing query unchanged ...
}
```

- ค่าเป็น UUID อยู่แล้วในทางปฏิบัติ → ผ่าน validation เหมือนเดิม
- ถ้าค่าผิดปกติ → return null (เหมือน policy ไม่เจอ) ไม่ throw error
- Caller เดียว: `index.ts:10820` → ไม่กระทบ function อื่น

---

### 2. เพิ่ม sensitive keys ใน logger.ts (line 6-18)

**ไฟล์**: `supabase/functions/_shared/logger.ts`

เพิ่ม 4 keys ใน `SENSITIVE_KEYS` array:

```typescript
const SENSITIVE_KEYS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'secret',
  'line_user_id',
  'line_group_id',
  'authorization',
  'photo_hash',
  'device_info',
  // เพิ่มใหม่
  'email',
  'phone',
  'phone_number',
  'bank_account',
];
```

- ไม่เปลี่ยน logic, signature, หรือ export
- 31 edge functions ที่ import logger จะ mask เพิ่มอัตโนมัติ

---

### สิ่งที่ไม่แตะ
- ไม่แก้ index.ts
- ไม่แก้ DB / RLS / frontend / prompts / routing
- ไม่แก้ function อื่นใน cross-group-query.ts

### ความเสี่ยง: ศูนย์
- UUID validation: ค่าเป็น UUID อยู่แล้ว → ไม่เปลี่ยนพฤติกรรม
- Logger keys: เพิ่ม masking → ไม่กระทบ functionality
