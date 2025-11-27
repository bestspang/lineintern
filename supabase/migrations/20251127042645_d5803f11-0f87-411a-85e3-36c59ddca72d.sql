-- Phase 1: Fix Knowledge Items (remove duplicate /reminders, correct examples)
UPDATE knowledge_items 
SET content = '# Available Commands

## 🎯 Core Commands
- `/help` - Show all available commands
- `/mode [helper/faq/report/fun/safety]` - Change bot mode
- `/status` - Check bot status and settings

## 📝 Chat & Knowledge
- `/ask [question]` - Ask the bot anything
- `/faq [question]` - Search FAQ/documentation
- `/find [keyword]` - Search previous messages
- `/train [topic] [content]` - Add to knowledge base

## 📊 Summaries & Reports
- `/summary` or `/summary [timeframe]` - Summarize recent chat
- `/report` or `/report [period]` - Generate activity report

## ✅ Tasks & Reminders
- `/todo [task]` - Create a task
- `/tasks` - List all tasks
- `/remind [task] [time]` or `/ตั้งเตือน` - Set a reminder
- `/reminders` or `/เตือน` - List all pending reminders

## 👥 Work Management
- `/work @user [task] [deadline]` - Assign work
- `/checkin` or `/เช็คอิน` - Check-in to work
- `/checkout` or `/เช็คเอาต์` - Check-out from work
- `/history` or `/ประวัติ` - View attendance history
- `/ot [hours] [reason]` - Request overtime
- `/progress [update]` - Report work progress
- `/confirm` - Confirm with feedback

## 🎨 Creative & Social
- `/imagine [description]` - Generate an image
- `/mentions` or `@me` - See who mentioned you
- `/menu` - Show employee menu

## 📌 Tips
- Most commands work in both **DM** and **group chats**
- In groups, mention `@intern` or use slash commands
- Use Thai aliases for convenience (e.g., `/สรุป`, `/งาน`)'
WHERE title = 'Available Commands';

UPDATE knowledge_items
SET content = '# คำสั่งที่มีทั้งหมด

## 🎯 คำสั่งหลัก
- `/help` หรือ `/ช่วยเหลือ` - แสดงคำสั่งทั้งหมด
- `/mode [helper/faq/report/fun/safety]` หรือ `/โหมด` - เปลี่ยนโหมดบอท
- `/status` หรือ `/สถานะ` - ตรวจสอบสถานะบอท

## 📝 แชทและความรู้
- `/ask [คำถาม]` หรือ `/ถาม` - ถามบอทอะไรก็ได้
- `/faq [คำถาม]` หรือ `/ถามตอบ` - ค้นหา FAQ
- `/find [คีย์เวิร์ด]` หรือ `/ค้นหา` - ค้นหาข้อความย้อนหลัง
- `/train [หัวข้อ] [เนื้อหา]` หรือ `/ฝึก` - เพิ่มความรู้ให้บอท

## 📊 สรุปและรายงาน
- `/summary` หรือ `/สรุป` - สรุปการแชท
- `/report` หรือ `/รายงาน` - สร้างรายงานกิจกรรม

## ✅ งานและเตือนความจำ
- `/todo [งาน]` หรือ `/งาน` - สร้างงาน
- `/tasks` หรือ `/งาน` - ดูรายการงานทั้งหมด
- `/remind [งาน] [เวลา]` หรือ `/ตั้งเตือน` - ตั้งเตือน (ตัวอย่าง: `/ตั้งเตือน ประชุม พรุ่งนี้ 14:00`)
- `/reminders` หรือ `/เตือน` - ดูรายการเตือนทั้งหมด

## 👥 การจัดการงาน
- `/work @user [งาน] [กำหนดส่ง]` - มอบหมายงาน
- `/checkin` หรือ `/เช็คอิน` - เช็คอินเข้างาน
- `/checkout` หรือ `/เช็คเอาต์` - เช็คเอาต์ออกงาน
- `/history` หรือ `/ประวัติ` - ดูประวัติการเข้างาน
- `/ot [ชั่วโมง] [เหตุผล]` หรือ `/ทำล่วงเวลา` - ขอทำล่วงเวลา
- `/progress [อัพเดท]` หรือ `/ความคืบหน้า` - รายงานความคืบหน้า
- `/confirm` หรือ `/ยืนยัน` - ยืนยันพร้อมฟีดแบ็ค

## 🎨 สร้างสรรค์และโซเชียล
- `/imagine [คำอธิบาย]` หรือ `/วาดรูป` - สร้างภาพ
- `/mentions` หรือ `/แท็ก` - ดูว่าใครแท็กคุณ
- `/menu` หรือ `/เมนู` - แสดงเมนูพนักงาน

## 📌 เคล็ดลับ
- คำสั่งส่วนใหญ่ใช้ได้ทั้ง **DM** และ **กลุ่มแชท**
- ในกลุ่ม ใช้ `@intern` หรือคำสั่งแบบ slash
- ใช้คำสั่งภาษาไทยได้เลย (เช่น `/สรุป`, `/งาน`)'
WHERE title = 'คำสั่งที่มีทั้งหมด';

-- Phase 3: Add missing database aliases (Thai variants from parser)
INSERT INTO command_aliases (command_id, alias_text, language, is_primary, is_prefix)
VALUES 
  -- faq: add /ถามตอบ
  ((SELECT id FROM bot_commands WHERE command_key = 'faq'), '/ถามตอบ', 'th', false, true),
  
  -- mentions: add /แท็ก
  ((SELECT id FROM bot_commands WHERE command_key = 'mentions'), '/แท็ก', 'th', false, true),
  
  -- train: add /ฝึก
  ((SELECT id FROM bot_commands WHERE command_key = 'train'), '/ฝึก', 'th', false, true),
  
  -- ot: add /ทำล่วงเวลา
  ((SELECT id FROM bot_commands WHERE command_key = 'ot'), '/ทำล่วงเวลา', 'th', false, true),
  
  -- Additional English aliases from database that were missing
  -- find: add /search
  ((SELECT id FROM bot_commands WHERE command_key = 'find'), '/search', 'en', false, true),
  
  -- imagine: add /draw, /gen, /image
  ((SELECT id FROM bot_commands WHERE command_key = 'imagine'), '/draw', 'en', false, true),
  ((SELECT id FROM bot_commands WHERE command_key = 'imagine'), '/gen', 'en', false, true),
  ((SELECT id FROM bot_commands WHERE command_key = 'imagine'), '/image', 'en', false, true),
  
  -- mode: add /m, /setmode
  ((SELECT id FROM bot_commands WHERE command_key = 'mode'), '/m', 'en', false, true),
  ((SELECT id FROM bot_commands WHERE command_key = 'mode'), '/setmode', 'en', false, true),
  
  -- progress_report: add /update
  ((SELECT id FROM bot_commands WHERE command_key = 'progress_report'), '/update', 'en', false, true),
  
  -- summary: add /recap, /summarize
  ((SELECT id FROM bot_commands WHERE command_key = 'summary'), '/recap', 'en', false, true),
  ((SELECT id FROM bot_commands WHERE command_key = 'summary'), '/summarize', 'en', false, true),
  
  -- todo: add /task
  ((SELECT id FROM bot_commands WHERE command_key = 'todo'), '/task', 'en', false, true)
ON CONFLICT DO NOTHING;