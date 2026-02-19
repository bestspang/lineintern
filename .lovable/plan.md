

## Fix 2 จุด: Test Console prompt + missing return

### ปัญหาที่แก้

| # | ปัญหา | ไฟล์ | รายละเอียด |
|---|-------|------|-----------|
| 3 | Test Console system prompt สั้นเกินไป (1 บรรทัด) ไม่ตรงกับ production (12 กฎ) | `ai-query-test/index.ts` line 369 | AI ตอบไม่เหมือนกันระหว่าง Test Console กับ LINE bot จริง |
| 4 | `retrieveCrossGroupEvidence` ไม่มี `return evidence;` | `cross-group-query.ts` line 542 | Production engine ได้ `undefined` ทำให้ AI ไม่มี evidence ใช้ |

### การแก้ไข

**ไฟล์ 1: `supabase/functions/line-webhook/utils/cross-group-query.ts`**
- เพิ่ม `return evidence;` ก่อนปิด `}` ของ function `retrieveCrossGroupEvidence` (line 542)

**ไฟล์ 2: `supabase/functions/ai-query-test/index.ts`**
- แทนที่ system prompt สั้น (line 369) ด้วย prompt เต็ม 12 กฎ เหมือน `CROSS_GROUP_SYSTEM_PROMPT` ใน production

### สิ่งที่จะไม่แตะ
- ไม่แก้ timezone logic
- ไม่แก้ retrieval logic
- ไม่แก้ frontend
- ไม่แก้ routing, DB, RLS

