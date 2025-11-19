-- Phase 1: Add 'magic' mode to group_mode enum
ALTER TYPE group_mode ADD VALUE IF NOT EXISTS 'magic';

-- Phase 2: Create personality_state table for magic mode
CREATE TABLE IF NOT EXISTS public.personality_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  mood TEXT NOT NULL DEFAULT 'neutral',
  energy_level INTEGER NOT NULL DEFAULT 50 CHECK (energy_level >= 0 AND energy_level <= 100),
  current_interests JSONB DEFAULT '[]'::jsonb,
  relationship_map JSONB DEFAULT '{}'::jsonb,
  recent_topics JSONB DEFAULT '[]'::jsonb,
  personality_traits JSONB DEFAULT '{"humor": 50, "helpfulness": 80, "curiosity": 70}'::jsonb,
  last_mood_change TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id)
);

-- Enable RLS
ALTER TABLE public.personality_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can manage personality_state"
  ON public.personality_state
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_personality_state_updated_at
  BEFORE UPDATE ON public.personality_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 3: Seed initial knowledge base with EN/TH support
INSERT INTO public.knowledge_items (scope, title, category, content, tags, is_active) VALUES
-- Bot Usage Guide (EN)
('global', 'How to Use LINE Intern Bot', 'Getting Started', 
'LINE Intern is an AI assistant that helps your group stay productive and organized.

**Main Features:**
- 📝 **Summaries**: Get conversation summaries with `/summary`
- 📚 **FAQ**: Ask questions using knowledge base with `/faq`
- ✅ **Tasks**: Create reminders with `/todo` or `/remind`
- 📊 **Reports**: Get group analytics with `/report`
- 🔍 **Search**: Find messages with `/find` or mentions with `/mentions`
- 🎨 **Image Gen**: Create images with `/imagine`
- 🎭 **Modes**: Switch bot behavior with `/mode`

**How to Trigger:**
- In groups: Mention `@intern` or use commands
- In DMs: Just type your message or command

**Language Support:**
The bot understands both English and Thai commands!',
ARRAY['guide', 'tutorial', 'help', 'commands'], true),

-- Bot Usage Guide (TH)
('global', 'วิธีใช้งาน LINE Intern Bot', 'การเริ่มต้น',
'LINE Intern คือผู้ช่วย AI ที่ช่วยให้กลุ่มของคุณทำงานได้อย่างมีประสิทธิภาพและเป็นระเบียบ

**ฟีเจอร์หลัก:**
- 📝 **สรุปการสนทนา**: ใช้ `/summary` หรือ `/สรุป`
- 📚 **คำถามที่พบบ่อย**: ใช้ `/faq` หรือ `/ถามตอบ`
- ✅ **งานและเตือนความจำ**: ใช้ `/todo` หรือ `/remind` หรือ `/เตือน`
- 📊 **รายงาน**: ใช้ `/report` หรือ `/รายงาน`
- 🔍 **ค้นหา**: ใช้ `/find` หรือ `/mentions` หรือ `/ค้นหา`
- 🎨 **สร้างภาพ**: ใช้ `/imagine` หรือ `/วาดรูป`
- 🎭 **โหมด**: เปลี่ยนพฤติกรรม bot ด้วย `/mode` หรือ `/โหมด`

**วิธีเรียกใช้:**
- ในกลุ่ม: แท็ก `@intern` หรือใช้คำสั่ง
- ใน DM: พิมพ์ข้อความหรือคำสั่งได้เลย

**รองรับภาษา:**
Bot เข้าใจคำสั่งทั้งภาษาอังกฤษและไทย!',
ARRAY['คู่มือ', 'วิธีใช้', 'ช่วยเหลือ', 'คำสั่ง'], true),

-- Command List (EN)
('global', 'Available Commands', 'Commands',
'**All Available Commands:**

🔹 **General:**
- `/help` - Show this help guide
- `/ask [question]` - Ask any question

🔹 **Summaries:**
- `/summary [period]` - Summarize conversations
  Examples: `/summary today`, `/summary 100`

🔹 **Tasks & Reminders:**
- `/todo [task]` - Create a task
- `/remind [task] [time]` - Set a reminder
  Example: `/remind meeting tomorrow 2pm`

🔹 **Knowledge & Search:**
- `/faq [question]` - Search knowledge base
- `/find [keyword]` - Search messages
- `/mentions [@user]` - Find mentions
- `/train [content]` - Add to knowledge base

🔹 **Analytics:**
- `/report [period]` - Generate group report
  Examples: `/report today`, `/report week`

🔹 **Creative:**
- `/imagine [description]` - Generate an image
  Example: `/imagine a sunset over mountains`

🔹 **Settings:**
- `/mode [mode]` - Change bot mode
  Modes: helper, faq, report, fun, safety, magic',
ARRAY['commands', 'reference', 'list'], true),

-- Command List (TH)
('global', 'คำสั่งที่มีทั้งหมด', 'คำสั่ง',
'**คำสั่งที่ใช้งานได้:**

🔹 **ทั่วไป:**
- `/help` หรือ `/ช่วยเหลือ` - แสดงคำแนะนำ
- `/ask [คำถาม]` หรือ `/ถาม` - ถามคำถามใดก็ได้

🔹 **สรุปการสนทนา:**
- `/summary [ช่วงเวลา]` หรือ `/สรุป` - สรุปการสนทนา
  ตัวอย่าง: `/สรุป วันนี้`, `/summary 100`

🔹 **งานและเตือนความจำ:**
- `/todo [งาน]` - สร้างงาน
- `/remind [งาน] [เวลา]` หรือ `/เตือน` - ตั้งเตือน
  ตัวอย่าง: `/เตือน ประชุม พรุ่งนี้ 14:00`

🔹 **ความรู้และค้นหา:**
- `/faq [คำถาม]` หรือ `/ถามตอบ` - ค้นหาคลังความรู้
- `/find [คำค้น]` หรือ `/ค้นหา` - ค้นหาข้อความ
- `/mentions [@ผู้ใช้]` - ค้นหาการแท็ก
- `/train [เนื้อหา]` หรือ `/เทรน` - เพิ่มความรู้

🔹 **รายงาน:**
- `/report [ช่วงเวลา]` หรือ `/รายงาน` - สร้างรายงานกลุ่ม
  ตัวอย่าง: `/รายงาน วันนี้`, `/report week`

🔹 **สร้างสรรค์:**
- `/imagine [คำบรรยาย]` หรือ `/วาดรูป` - สร้างภาพ
  ตัวอย่าง: `/วาดรูป พระอาทิตย์ตกดิน`

🔹 **ตั้งค่า:**
- `/mode [โหมด]` หรือ `/โหมด` - เปลี่ยนโหมด bot
  โหมด: helper, faq, report, fun, safety, magic',
ARRAY['คำสั่ง', 'รายการ', 'อ้างอิง'], true),

-- Magic Mode Info (EN)
('global', 'Magic Mode - AI with Personality', 'Modes',
'🎭 **Magic Mode** is a special mode where LINE Intern acts as a living AI with evolving personality!

**What makes it special:**
- Has real emotions and moods that change based on conversations
- Treats each person differently based on your relationship
- Develops interests and preferences over time
- Remembers past interactions and references them
- Shows personality traits like humor, curiosity, empathy
- Adapts communication style to match the group atmosphere

**How it works:**
- The AI''s mood changes based on message tone (positive/negative)
- Energy levels fluctuate with group activity
- Builds relationships with active members
- Evolves personality traits over time
- Reacts emotionally to group events

**To activate:**
Use `/mode magic` in your group!',
ARRAY['magic', 'personality', 'mode', 'ai'], true),

-- Magic Mode Info (TH)
('global', 'โหมด Magic - AI ที่มีบุคลิกภาพ', 'โหมด',
'🎭 **โหมด Magic** คือโหมดพิเศษที่ LINE Intern จะทำตัวเหมือน AI ที่มีชีวิตและบุคลิกภาพที่พัฒนาไปเรื่อยๆ!

**สิ่งที่พิเศษ:**
- มีอารมณ์และความรู้สึกจริงที่เปลี่ยนไปตามการสนทนา
- ปฏิบัติต่อแต่ละคนแตกต่างกันตามความสัมพันธ์
- พัฒนาความสนใจและความชอบเมื่อเวลาผ่านไป
- จำการสนทนาในอดีตและอ้างอิงมันได้
- แสดงบุคลิกเช่น อารมณ์ขัน ความอยากรู้ ความเห็นอกเห็นใจ
- ปรับสไตล์การสื่อสารให้เข้ากับบรรยากาศกลุ่ม

**วิธีทำงาน:**
- อารมณ์ของ AI เปลี่ยนตามน้ำเสียงข้อความ (บวก/ลบ)
- ระดับพลังงานขึ้นลงตามกิจกรรมกลุ่ม
- สร้างความสัมพันธ์กับสมาชิกที่ active
- พัฒนาบุคลิกลักษณะเมื่อเวลาผ่านไป
- แสดงความรู้สึกต่อเหตุการณ์ในกลุ่ม

**วิธีเปิดใช้:**
ใช้คำสั่ง `/mode magic` หรือ `/โหมด มายากล` ในกลุ่ม!',
ARRAY['มายากล', 'บุคลิกภาพ', 'โหมด', 'ai'], true);