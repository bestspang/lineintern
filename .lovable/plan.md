

## แก้ AI หาข้อมูลยอดสาขาภูเก็ตไม่เจอ

### Root Cause

ระบบ Cross-Group Query ใช้ entity resolution เพื่อจับคู่คำถามกับกลุ่ม LINE:

```
คำถาม: "ยอดสาขาภูเก็ตโดยรวมเป็นไง"
                  ^^^^^^^^
                  ภาษาไทย

Synonym ใน DB: "Phuket"
                ^^^^^^
                ภาษาอังกฤษ
```

`"ภูเก็ต".includes("phuket")` = **false** → entity resolution ล้มเหลว → AI ไม่ได้รับข้อมูลจากกลุ่ม Phuket → ตอบว่า "ข้อมูลไม่เพียงพอ"

ทั้งที่ข้อมูลยอดขาย (Sales: 1,550 / Target: 7,000) มีอยู่ในข้อความของ Nada ในกลุ่ม Phuket

### การแก้ไข (2 จุด)

**1. เพิ่ม Thai synonym ให้กลุ่ม Phuket (DB fix)**
- เพิ่ม "ภูเก็ต" และ "เซ็นทรัลภูเก็ต" เข้าไปใน synonyms ของ `ai_query_group_export` สำหรับ Phuket group
- ทำให้ entity resolution จับคู่ "ภูเก็ต" ในคำถาม ↔ กลุ่ม Phuket ได้ทันที

**2. ป้องกันปัญหาซ้ำ: เพิ่ม branch name (Thai) ใน entity resolution**
- ตาราง `branches` มี `name = "Phuket"` (อังกฤษ) แต่ข้อความจริงใช้ "เซ็นทรัลภูเก็ต" / "ภูเก็ต"
- เพิ่ม logic ใน `resolveEntities` ให้ดึง branch name + ตรวจสอบ synonyms ในตาราง `ai_query_group_export` ที่เป็นภาษาไทยด้วย
- ปัจจุบันใช้ `branch_name` จาก branches table เฉยๆ ซึ่งเป็นภาษาอังกฤษ

### ไฟล์ที่แก้

| ไฟล์ | จุดที่แก้ | รายละเอียด |
|------|----------|-----------|
| DB migration | `ai_query_group_export` | เพิ่ม synonyms "ภูเก็ต", "เซ็นทรัลภูเก็ต" สำหรับ Phuket group |
| ไม่มีไฟล์ code ที่ต้องแก้ | - | Entity resolution logic ทำงานถูกแล้ว แค่ข้อมูล synonym ไม่ครบ |

### สิ่งที่ไม่แตะ
- ไม่แก้ cross-group-query.ts (logic ถูกแล้ว)
- ไม่แก้ prompts
- ไม่แก้ command routing
- ไม่แก้ frontend / RLS

### ผลลัพธ์ที่คาดหวัง
ถาม "ยอดสาขาภูเก็ตโดยรวมเป็นไง" → entity resolution จับได้ว่าถามเรื่อง Phuket group → ดึงข้อความจากกลุ่มนั้น → AI เห็นข้อมูล Sales: 1,550 ที่ Nada โพสต์ → ตอบเป็นภาษาไทยสรุปยอดขาย

### หมายเหตุ
ควรตรวจสอบ synonyms ของทุกสาขาว่ามีชื่อภาษาไทยครบหรือยัง เพื่อป้องกันปัญหาเดียวกันกับสาขาอื่น
