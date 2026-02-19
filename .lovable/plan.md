

## MyRedemptions.tsx - Fix 2 Bugs (Verified)

### Bug 1: เพิ่ม rejection_reason display

**ปัญหาจริง**: DB มี `rejection_reason` ใน `point_redemptions`, backend ส่งมาครบ (SELECT *), แต่ frontend ไม่รับและไม่แสดง

**การแก้ไข**:
1. เพิ่ม `rejection_reason: string | null` ใน `Redemption` interface (line 21)
2. เพิ่ม UI แสดงเหตุผลหลัง notes (หลัง line 101) เมื่อ status === 'rejected'

### Bug 2: เปลี่ยนเป็น Bangkok timezone

**ปัญหาจริง**: Line 83 และ 95 ใช้ `format()` จาก date-fns ซึ่งใช้ browser local timezone ผิด convention

**การแก้ไข**:
1. เพิ่ม import `formatBangkokDateTime, formatBangkokDate` จาก `@/lib/timezone`
2. ลบ import `format` จาก `date-fns` (ไม่ใช้แล้ว)
3. Line 83: เปลี่ยนเป็น `formatBangkokDateTime(redemption.created_at)`
4. Line 95: เปลี่ยนเป็น `formatBangkokDate(redemption.expires_at)`

---

### รายละเอียดทางเทคนิค

**ไฟล์ที่แก้**: `src/pages/portal/MyRedemptions.tsx` เท่านั้น

**Interface เดิม** (line 13-27):
```typescript
interface Redemption {
  // ... existing fields
  notes: string | null;
  // rejection_reason is MISSING
}
```

**Interface ใหม่**:
```typescript
interface Redemption {
  // ... existing fields
  notes: string | null;
  rejection_reason: string | null;  // ADD THIS
}
```

**UI เพิ่ม** (หลัง line 101):
```tsx
{redemption.status === 'rejected' && redemption.rejection_reason && (
  <p className="text-xs text-destructive mt-2">
    {locale === 'th' ? '❌ เหตุผล: ' : '❌ Reason: '}
    {redemption.rejection_reason}
  </p>
)}
```

**Timezone เปลี่ยน**:
- Line 83: `format(new Date(redemption.created_at), 'dd/MM/yyyy HH:mm')` -> `formatBangkokDateTime(redemption.created_at)`
- Line 95: `format(new Date(redemption.expires_at), 'dd/MM/yyyy')` -> `formatBangkokDate(redemption.expires_at)`

### สิ่งที่จะไม่แตะ
- ไม่แตะ backend, edge functions, routing, หรือไฟล์อื่นใด
- ไม่เปลี่ยน logic การ filter, query, หรือ status

### Regression risk: ZERO
- เพิ่ม field ใน interface (additive only)
- เพิ่ม conditional UI element (ไม่กระทบ existing render)
- เปลี่ยน timezone function (output format เปลี่ยนเล็กน้อยแต่ถูกต้องกว่าเดิม)
