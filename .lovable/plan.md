

## แก้ Bot ตอบ "Chat Summary" ภาษาอังกฤษ เมื่อถามคำถามที่มีคำว่า "สรุป"

### Root Cause (ที่แท้จริง)

ปัญหาไม่ได้อยู่ที่ prompt แต่อยู่ที่ **command routing**:

1. User พิมพ์: `@LumimiHR วันนี้ Baze พูดเรื่องอะไรบ้างสรุปมา วันนี้เท่านั้น`
2. `parseCommandDynamic` ทำงาน:
   - Step 1: ตรวจ trigger `@LumimiHR` → `isMentioned = true` → ลบ trigger ออก → `cleanedText = "วันนี้ Baze พูดเรื่องอะไรบ้างสรุปมา วันนี้เท่านั้น"`
   - Step 2: ตรวจ alias → เจอ alias `สรุป` (is_prefix: false = contains match) ใน "สรุปมา" → return `commandType: 'summary'`
3. Main handler เห็น `commandType === 'summary'` → เรียก `handleSummaryCommand()` ซึ่งเป็น hardcoded English template ที่ดึง 100 messages มาสรุปแบบ full chat summary

**สรุป**: คำว่า "สรุป" ใน database alias จับ match กับคำถามธรรมชาติที่มีคำว่า "สรุปมา" ทำให้ route ไป handler ผิด

### วิธีแก้

แก้ที่ `parseCommandDynamic` — เมื่อ user ถูก mention (`isMentioned = true`) และ cleanedText มีลักษณะเป็น **คำถามธรรมชาติ** (มีชื่อคน, มีคำถาม, มีบริบท) ไม่ใช่แค่คำสั่งสั้นๆ อย่าง "สรุป" หรือ "สรุปหน่อย" → ให้ fallback เป็น `ask` แทน `summary`

**กฎ**: ถ้า `isMentioned` + alias match เป็น `summary` + cleanedText ยาวกว่า alias text มาก (มีบริบทอื่นๆ เช่น ชื่อคน, คำถาม) → ให้ใช้ `ask` แทน

### ไฟล์ที่แก้

| ไฟล์ | จุดที่แก้ | รายละเอียด |
|------|----------|-----------|
| `supabase/functions/line-webhook/index.ts` | `parseCommandDynamic` (~line 4237-4258) | เพิ่ม logic: ถ้า isMentioned + commandType เป็น summary + cleanedText มีบริบทเพิ่มเติม (ชื่อคน/คำถาม) → return ask แทน |

### ตัวอย่างผลลัพธ์

| Input | ก่อนแก้ | หลังแก้ |
|-------|---------|---------|
| `@LumimiHR สรุป` | summary (ถูกต้อง) | summary (ไม่เปลี่ยน) |
| `@LumimiHR สรุปหน่อย` | summary (ถูกต้อง) | summary (ไม่เปลี่ยน) |
| `@LumimiHR วันนี้ Baze พูดอะไรบ้างสรุปมา` | summary (ผิด!) | ask (ถูกต้อง - ไป AI path) |
| `/สรุป` | summary (ถูกต้อง) | summary (ไม่เปลี่ยน) |

### Logic ที่เพิ่ม (Pseudocode)

```text
เมื่อ alias match สำเร็จ:
  ถ้า isMentioned AND command_key เป็น 'summary'
    AND cleanedText หลังลบ alias แล้วยังมีเนื้อหาเหลือ > 5 ตัวอักษร (มีคำถาม/ชื่อคน)
  → return { commandType: 'ask', userMessage: cleanedText }
  (ให้ AI ตอบตรงคำถามแทนทำ full summary)
```

### สิ่งที่ไม่แตะ
- ไม่แก้ `handleSummaryCommand` (ยังทำงานปกติสำหรับ `/สรุป` หรือ `@bot สรุป`)
- ไม่แก้ database aliases
- ไม่แก้ prompts (แก้ไปแล้วรอบก่อน ยังใช้ได้)
- ไม่แก้ cross-group-query
- ไม่แก้ frontend / DB / RLS

### ความเสี่ยง
- ต่ำ: เปลี่ยนเฉพาะ case ที่ mention + summary + มีบริบทเพิ่ม
- `/สรุป` command ตรงๆ ไม่ได้รับผลกระทบ
- `@bot สรุป` (สั้นๆ ไม่มีบริบท) ยังไป summary ปกติ

