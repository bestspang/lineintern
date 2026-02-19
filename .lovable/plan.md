

## แก้ AI หาข้อมูลยอดสาขาภูเก็ตไม่เจอ

### ปัญหา
กลุ่ม "Phuket Goodchoose team" (`cd696360-7740-45d4-8041-35d073b84a23`) มี `export_enabled = true` แต่ synonyms มีแค่ `["Phuket"]` → คำถามภาษาไทย "ภูเก็ต" จับคู่ไม่ได้

### การแก้ไข
เพิ่ม synonyms ภาษาไทยใน `ai_query_group_export` สำหรับ Phuket group:
- เพิ่ม "ภูเก็ต" และ "เซ็นทรัลภูเก็ต" เข้าไปใน synonyms array

### SQL Migration

```sql
UPDATE ai_query_group_export
SET synonyms = ARRAY['Phuket', 'ภูเก็ต', 'เซ็นทรัลภูเก็ต']
WHERE group_id = 'cd696360-7740-45d4-8041-35d073b84a23';
```

### สิ่งที่ไม่แตะ
- ไม่แก้ code ใดๆ
- ไม่แก้ cross-group-query.ts (logic ถูกอยู่แล้ว)
- ไม่แก้ prompts / routing / frontend / RLS

### ผลลัพธ์
ถาม "ยอดสาขาภูเก็ตโดยรวมเป็นไง" → entity resolution จับคู่ "ภูเก็ต" กับ Phuket group ได้ → ดึงข้อมูลยอดขายจากกลุ่มนั้น → ตอบภาษาไทย

### หมายเหตุ
สาขาอื่นที่อาจมีปัญหาเดียวกัน (synonym เป็นอังกฤษอย่างเดียว):
- Eastville → ควรเพิ่ม "อีสต์วิลล์"
- Siam Center → ควรเพิ่ม "สยามเซ็นเตอร์"
- Central Park สีลม → มีไทยแล้วบางส่วน
- Management → อาจเพิ่ม "ผู้บริหาร"

ถ้าต้องการเพิ่ม synonym ไทยให้ทุกสาขาพร้อมกัน แจ้งได้เลย
