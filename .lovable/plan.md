

## แก้ Bot ตอบ "Chat Summary" ภาษาอังกฤษ แทนที่จะตอบตรงคำถาม

### ปัญหา
เมื่อถาม "@LumimiHR วันนี้ Baze พูดเรื่องอะไรบ้างสรุปมา วันนี้เท่านั้น" bot ตอบเป็น "Chat Summary (last 100 messages)" ภาษาอังกฤษ แทนที่จะตอบสั้นๆ เป็นภาษาไทยว่า Baze พูดอะไรบ้าง

### Root Cause Analysis
1. คำถามนี้ถูก parse เป็น `commandType: 'ask'` (ไม่ใช่ 'summary')
2. ถ้า cross-group policy ไม่มี → fall through ไปใช้ `generateAiReply` (normal AI path)
3. Normal AI path ใช้ `COMMON_BEHAVIOR_PROMPT` ที่มีปัญหา 2 จุด:
   - **ไม่บังคับภาษาตอบ**: prompt บอกแค่ "Reply in the same language as USER_MESSAGE" แต่ไม่เข้มพอ AI เลยตอบอังกฤษ
   - **ไม่บังคับตอบตรงคำถาม**: AI เห็นคำว่า "สรุป" + RECENT_MESSAGES เลยทำ full summary แทนที่จะ focus ที่ "Baze พูดอะไร"

4. `SYSTEM_KNOWLEDGE_PROMPT` (line 3188) ก็ไม่มีกฎชัดเรื่อง:
   - ถ้าถามเรื่องคนเฉพาะ ต้อง filter ข้อมูลเฉพาะคนนั้น
   - ต้องตอบภาษาเดียวกับคำถามเสมอ

### การแก้ไข
เพิ่มกฎใน 2 จุดของ normal AI path:

**1. SYSTEM_KNOWLEDGE_PROMPT (line ~3188-3201)**
เพิ่มกฎ:
- "ตอบภาษาเดียวกับ USER_MESSAGE เสมอ ถ้าถามภาษาไทย ต้องตอบภาษาไทย"
- "ถ้าถามเรื่องคนเฉพาะ (เช่น 'Baze พูดอะไร') ให้ filter จาก RECENT_MESSAGES เฉพาะข้อความของคนนั้น แล้วสรุปสั้นๆ ห้ามทำ full chat summary"

**2. COMMON_BEHAVIOR_PROMPT (line ~3338)**
เปลี่ยนจาก "Reply in the same language as USER_MESSAGE" เป็นกฎที่เข้มขึ้น:
- "ภาษาในการตอบ: ต้องตอบภาษาเดียวกับ USER_MESSAGE เสมอ ห้ามตอบอังกฤษถ้าถามไทย"
- "ถ้า COMMAND เป็น 'ask' และมีชื่อคนเฉพาะ ให้ตอบเฉพาะเรื่องของคนนั้นจาก RECENT_MESSAGES ห้ามทำ full summary"

### ไฟล์ที่แก้

| ไฟล์ | จุดที่แก้ | รายละเอียด |
|------|----------|-----------|
| `supabase/functions/line-webhook/index.ts` | `SYSTEM_KNOWLEDGE_PROMPT` (line 3188-3201) | เพิ่มกฎภาษา + focus คำถาม |
| `supabase/functions/line-webhook/index.ts` | `COMMON_BEHAVIOR_PROMPT` (line 3338) | เปลี่ยนกฎภาษาให้เข้มขึ้น + เพิ่มกฎ person-specific query |

### สิ่งที่ไม่แตะ
- ไม่แก้ cross-group-query.ts (ไม่เกี่ยวกัน ตรงนั้นตอบไทยอยู่แล้ว)
- ไม่แก้ command parsing logic
- ไม่แก้ DB / RLS / routing
- ไม่แก้ frontend
- ไม่แก้ evidence retrieval

### ผลลัพธ์ที่คาดหวัง
ถาม "@LumimiHR วันนี้ Baze พูดเรื่องอะไรบ้าง" → bot ตอบภาษาไทย สรุปเฉพาะสิ่งที่ Baze พูดวันนี้ ไม่ทำ full chat summary ภาษาอังกฤษอีก

