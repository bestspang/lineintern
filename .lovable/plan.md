

## Auto-Suggest Synonyms สำหรับทุกกลุ่ม (กดปุ่มเดียว)

### สิ่งที่จะเพิ่ม

ปุ่ม **"Auto-fill Synonyms"** ในหน้า Group Export Policy ที่กดแล้วจะ:

1. ดึงชื่อกลุ่ม (`display_name`) + ชื่อสาขา (`branch.name`) ของทุกกลุ่ม
2. สร้าง synonyms อัตโนมัติจาก:
   - แยกคำจากชื่อกลุ่ม (เช่น "Eastville Goodchoose team" -> ["Eastville", "EV"])
   - ชื่อสาขาถ้ามี (เช่น branch "Central Park" -> ["Central Park", "CP"])
   - ตัดคำทั่วไปออก (team, goodchoose, etc.)
   - ไม่ทับ synonyms เดิมที่ admin เคยใส่ไว้แล้ว (merge เข้าไป)
3. Upsert ทุกกลุ่มที่มี export row อยู่แล้ว + สร้าง row ใหม่สำหรับกลุ่มที่ยังไม่มี

### ตัวอย่างผลลัพธ์

| Group | Auto Synonyms |
|-------|--------------|
| Goodchoose Central Park สีลม | Central Park, สีลม, CP |
| Eastville Goodchoose team | Eastville, EV |
| Team Office Goodchoose | Office, Glowfish Office |
| Phuket Goodchoose team | Phuket, ภูเก็ต |

### การเปลี่ยนแปลง

**ไฟล์เดียว**: `src/pages/settings/AIQueryControl.tsx`

- เพิ่มปุ่ม "Auto-fill Synonyms" ข้างหัวตาราง
- เพิ่มฟังก์ชัน `generateSynonyms(displayName, branchName?)` ที่แยกคำสำคัญจากชื่อ
- เพิ่ม mutation ที่ loop upsert synonyms ให้ทุกกลุ่ม (merge กับ synonyms เดิม)
- Query branches เพิ่มเพื่อ match กับ group ผ่าน `line_group_id`

### สิ่งที่จะไม่แตะ

- ไม่แก้ DB schema (ใช้ column `synonyms text[]` ที่มีอยู่แล้ว)
- ไม่แก้ backend / edge functions
- ไม่แก้ tab อื่น ไม่แก้ logic อื่นในหน้า

### Technical Details

```text
generateSynonyms(displayName, branchName):
  1. Split displayName by spaces
  2. Filter out common words: "team", "goodchoose", "gc", "group"
  3. Add branchName if different from displayName
  4. Generate abbreviation from remaining words (first letters -> uppercase)
  5. Deduplicate + return unique array

Auto-fill mutation:
  1. For each group:
     a. Find matching branch via line_group_id
     b. Generate suggested synonyms
     c. Merge with existing synonyms (keep admin's manual entries)
     d. Upsert to ai_query_group_export
  2. Invalidate query cache
  3. Toast success with count
```
