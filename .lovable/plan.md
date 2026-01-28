

## แผนแก้ไข Timezone Display Bug

### ปัญหาที่พบ

**ไฟล์:** `supabase/functions/line-webhook/index.ts`  
**บรรทัด:** 2039

```typescript
// ❌ BUG: ใช้ toISOString() ได้วันที่ UTC
const formattedDate = formatDate(parsedDate.toISOString().split('T')[0]);
```

**ปัญหา:** ใช้ `toISOString().split('T')[0]` ซึ่งได้วันที่ UTC ไม่ใช่ Bangkok
- ถ้า user พิมพ์ /cancel-ot เวลา 00:30 Bangkok → UTC จะเป็น 17:30 ของวันก่อนหน้า
- Error message จะแสดงวันที่ผิด

---

### Solution

เปลี่ยนจาก `parsedDate.toISOString().split('T')[0]` เป็น `dateStr` ที่คำนวณไว้แล้วที่ line 2011

**ก่อนแก้ (Line 2039):**
```typescript
const formattedDate = formatDate(parsedDate.toISOString().split('T')[0]);
```

**หลังแก้:**
```typescript
const formattedDate = formatDate(dateStr);
```

---

### เหตุผลที่ใช้ dateStr

| ตัวแปร | ที่มา | ค่า |
|--------|------|-----|
| `parsedDate` | Line 2009 | Date object จาก user input |
| `dateStr` | Line 2011 | `getBangkokDateString(parsedDate)` → YYYY-MM-DD ใน Bangkok timezone |

`dateStr` ถูกคำนวณไว้แล้วที่ line 2011 ด้วย `getBangkokDateString()` ซึ่งใช้ Bangkok timezone ถูกต้อง

---

### ผลกระทบ

| รายการ | ผลกระทบ |
|--------|--------|
| Database query | ❌ ไม่กระทบ - ใช้ `dateStr` อยู่แล้ว (line 2012) |
| Cancel logic | ❌ ไม่กระทบ - ไม่ได้แตะ logic |
| Error message display | ✅ แก้ไข - แสดงวันที่ถูกต้องตาม Bangkok timezone |

**ความเสี่ยง:** ต่ำมาก - แก้ไขเฉพาะ string ที่ใช้แสดงผลใน error message เท่านั้น

---

### Technical Details

**ไฟล์ที่แก้ไข:** 1 ไฟล์
- `supabase/functions/line-webhook/index.ts` (line 2039 เท่านั้น)

**Scope ที่ต้องแก้ไข:** 1 บรรทัด

