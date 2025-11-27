-- Fix Knowledge Items: Remove incorrect /งาน from todo section

-- Fix English "Available Commands"
UPDATE knowledge_items 
SET content = '# LINE Intern Bot Commands

LINE Intern is your AI assistant for team collaboration. Here are all available commands:

## 💬 Chat & Knowledge
- `/ask [question]` or `/ถาม` - Ask a question
- `/faq [question]` or `/คำถาม` - Search FAQ knowledge base
- `/find [keyword]` or `/search` or `/ค้นหา` - Search previous conversations
- `/train [topic: content]` or `/ฝึก` - Add new knowledge to bot

## 📝 Summaries & Reports
- `/summary` or `/recap` or `/สรุป` - Summarize recent conversation
  - Add timeframe: `/summary today`, `/summary last 100 messages`
- `/report` or `/รายงาน` - Generate group activity report
  - `/report today`, `/report weekly`

## ✅ Tasks & Reminders
- `/todo [task]` or `/task` - Create a task
- `/tasks` or `/งาน` - List all pending tasks
- `/remind [task] [time]` or `/ตั้งเตือน` - Set a reminder
  - Example: `/remind Meeting tomorrow 2pm`
- `/reminders` or `/reminder` or `/เตือน` - List all active reminders

## 👥 Work Management
- `/work` - Work assignment features
- `/checkin` or `/เข้างาน` or `/เช็คอิน` - Check in to work
- `/checkout` or `/ออกงาน` or `/เช็คเอาต์` - Check out from work
- `/history` or `/ประวัติ` - View work history
- `/ot [reason]` or `/โอที` - Request overtime
- `/progress [update]` or `/update` or `/ความคืบหน้า` - Report work progress
- `/confirm` or `/ยืนยัน` - Confirm work completion

## 🎨 Creative & Social
- `/imagine [description]` or `/draw` or `/gen` or `/วาดรูป` - Generate AI images
- `/mentions` or `/แท็ก` - See who mentioned you
- `/menu` or `/เมนู` - Open employee menu

## ⚙️ Settings
- `/mode [helper|faq|report|fun|safety]` or `/m` or `/โหมด` - Change bot mode
- `/status` or `/สถานะ` - Check bot status
- `/help` or `/ช่วยเหลือ` - Show this help message

## 📌 Tips
- In DM: Just type your message (no need for @intern)
- In groups: Mention @intern or use commands with /
- Natural language works too: "สรุปหน่อย", "ค้นหา project X"',
updated_at = NOW()
WHERE title = 'Available Commands' AND scope = 'global';

-- Fix Thai "คำสั่งที่มีทั้งหมด"
UPDATE knowledge_items 
SET content = '# คำสั่งทั้งหมดของ LINE Intern Bot

LINE Intern เป็นผู้ช่วย AI สำหรับการทำงานร่วมกันของทีม นี่คือคำสั่งทั้งหมดที่ใช้ได้:

## 💬 แชทและความรู้
- `/ask [คำถาม]` หรือ `/ถาม` - ถามคำถาม
- `/faq [คำถาม]` หรือ `/คำถาม` - ค้นหาคำตอบจากฐานความรู้
- `/find [คำค้น]` หรือ `/search` หรือ `/ค้นหา` - ค้นหาในการสนทนาก่อนหน้า
- `/train [หัวข้อ: เนื้อหา]` หรือ `/ฝึก` - เพิ่มความรู้ใหม่ให้บอท

## 📝 สรุปและรายงาน
- `/summary` หรือ `/recap` หรือ `/สรุป` - สรุปการสนทนาล่าสุด
  - เพิ่มช่วงเวลา: `/summary today`, `/summary last 100 messages`
- `/report` หรือ `/รายงาน` - สร้างรายงานกิจกรรมกลุ่ม
  - `/report today`, `/report weekly`

## ✅ งานและการแจ้งเตือน
- `/todo [งาน]` หรือ `/task` - สร้างงาน
- `/tasks` หรือ `/งาน` - แสดงรายการงานที่รอดำเนินการ
- `/remind [งาน] [เวลา]` หรือ `/ตั้งเตือน` - ตั้งเตือน
  - ตัวอย่าง: `/ตั้งเตือน ประชุม พรุ่งนี้ 14:00`
- `/reminders` หรือ `/reminder` หรือ `/เตือน` - แสดงรายการเตือนทั้งหมด

## 👥 การจัดการงาน
- `/work` - ฟีเจอร์การมอบหมายงาน
- `/checkin` หรือ `/เข้างาน` หรือ `/เช็คอิน` - เช็คอินเข้างาน
- `/checkout` หรือ `/ออกงาน` หรือ `/เช็คเอาต์` - เช็คเอาต์ออกงาน
- `/history` หรือ `/ประวัติ` - ดูประวัติการทำงาน
- `/ot [เหตุผล]` หรือ `/โอที` - ขอทำล่วงเวลา
- `/progress [อัพเดท]` หรือ `/update` หรือ `/ความคืบหน้า` - รายงานความคืบหน้างาน
- `/confirm` หรือ `/ยืนยัน` - ยืนยันงานเสร็จสมบูรณ์

## 🎨 สร้างสรรค์และโซเชียล
- `/imagine [รายละเอียด]` หรือ `/draw` หรือ `/gen` หรือ `/วาดรูป` - สร้างภาพด้วย AI
- `/mentions` หรือ `/แท็ก` - ดูว่าใครกล่าวถึงคุณ
- `/menu` หรือ `/เมนู` - เปิดเมนูพนักงาน

## ⚙️ การตั้งค่า
- `/mode [helper|faq|report|fun|safety]` หรือ `/m` หรือ `/โหมด` - เปลี่ยนโหมดบอท
- `/status` หรือ `/สถานะ` - ตรวจสอบสถานะบอท
- `/help` หรือ `/ช่วยเหลือ` - แสดงข้อความช่วยเหลือนี้

## 📌 เคล็ดลับ
- ใน DM: แค่พิมพ์ข้อความ (ไม่ต้องพิมพ์ @intern)
- ในกลุ่ม: กล่าวถึง @intern หรือใช้คำสั่งที่มี /
- ภาษาธรรมชาติใช้ได้เช่นกัน: "สรุปหน่อย", "ค้นหา โปรเจค X"',
updated_at = NOW()
WHERE title = 'คำสั่งที่มีทั้งหมด' AND scope = 'global';