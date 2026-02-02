
## อัพเดทชื่อกลุ่ม GC_Operation

### ปัญหา
กลุ่ม LINE มีชื่อใน database เป็น `Nk 🐮, Best, Wariss, mefonn` แต่ต้องการให้แสดงเป็น `GC_Operation`

### ข้อมูลปัจจุบัน
| Field | Value |
|-------|-------|
| ID | `b36e22b1-34fe-4ba1-b8d9-e2b10f56f4d6` |
| display_name | Nk 🐮, Best, Wariss, mefonn |
| line_group_id | Cbfe73d0a69e576d3ef182f6282635c05 |
| status | active |

### วิธีแก้ไข
ใช้ Database Migration เพื่ออัพเดทชื่อกลุ่ม

### SQL
```sql
UPDATE groups 
SET display_name = 'GC_Operation', updated_at = NOW()
WHERE id = 'b36e22b1-34fe-4ba1-b8d9-e2b10f56f4d6';
```

### ผลลัพธ์
- ชื่อกลุ่มจะเปลี่ยนจาก `Nk 🐮, Best, Wariss, mefonn` → `GC_Operation`
- กลุ่มจะแสดงในหน้า Employees dropdown ด้วยชื่อ GC_Operation
