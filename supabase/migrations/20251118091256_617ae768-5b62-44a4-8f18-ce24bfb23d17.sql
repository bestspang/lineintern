-- =============================
-- TABLE: bot_commands
-- =============================
CREATE TABLE public.bot_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Command identification
  command_key TEXT NOT NULL UNIQUE,
  display_name_en TEXT NOT NULL,
  display_name_th TEXT,
  
  -- Descriptions
  description_en TEXT NOT NULL,
  description_th TEXT,
  usage_example_en TEXT,
  usage_example_th TEXT,
  
  -- Configuration
  is_enabled BOOLEAN DEFAULT true,
  require_mention_in_group BOOLEAN DEFAULT false,
  available_in_dm BOOLEAN DEFAULT true,
  available_in_group BOOLEAN DEFAULT true,
  
  -- Icon & UI
  icon_name TEXT,
  display_order INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bot_commands_enabled ON public.bot_commands(is_enabled);
CREATE INDEX idx_bot_commands_order ON public.bot_commands(display_order);

CREATE TRIGGER update_bot_commands_updated_at
  BEFORE UPDATE ON public.bot_commands
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bot_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled commands"
  ON public.bot_commands
  FOR SELECT
  USING (is_enabled = true);

CREATE POLICY "Authenticated users can manage commands"
  ON public.bot_commands
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =============================
-- TABLE: command_aliases
-- =============================
CREATE TABLE public.command_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL REFERENCES public.bot_commands(id) ON DELETE CASCADE,
  
  -- Alias configuration
  alias_text TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  is_primary BOOLEAN DEFAULT false,
  is_prefix BOOLEAN DEFAULT true,
  case_sensitive BOOLEAN DEFAULT false,
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(command_id, alias_text)
);

CREATE INDEX idx_command_aliases_command_id ON public.command_aliases(command_id);
CREATE INDEX idx_command_aliases_text ON public.command_aliases(alias_text);
CREATE INDEX idx_command_aliases_primary ON public.command_aliases(is_primary) WHERE is_primary = true;

CREATE TRIGGER update_command_aliases_updated_at
  BEFORE UPDATE ON public.command_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.command_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view command aliases"
  ON public.command_aliases
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage aliases"
  ON public.command_aliases
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =============================
-- TABLE: bot_triggers
-- =============================
CREATE TABLE public.bot_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Trigger configuration
  trigger_text TEXT NOT NULL UNIQUE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('mention', 'keyword', 'emoji')),
  language TEXT DEFAULT 'en',
  
  -- Behavior
  is_enabled BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  case_sensitive BOOLEAN DEFAULT false,
  match_type TEXT DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'starts_with')),
  
  -- Scope
  available_in_dm BOOLEAN DEFAULT true,
  available_in_group BOOLEAN DEFAULT true,
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bot_triggers_enabled ON public.bot_triggers(is_enabled);
CREATE INDEX idx_bot_triggers_primary ON public.bot_triggers(is_primary) WHERE is_primary = true;
CREATE INDEX idx_bot_triggers_text ON public.bot_triggers(trigger_text);

CREATE TRIGGER update_bot_triggers_updated_at
  BEFORE UPDATE ON public.bot_triggers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bot_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled triggers"
  ON public.bot_triggers
  FOR SELECT
  USING (is_enabled = true);

CREATE POLICY "Authenticated users can manage triggers"
  ON public.bot_triggers
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =============================
-- INSERT DEFAULT DATA
-- =============================
INSERT INTO public.bot_commands (
  command_key, 
  display_name_en, 
  display_name_th,
  description_en, 
  description_th,
  usage_example_en,
  usage_example_th,
  icon_name,
  display_order,
  require_mention_in_group,
  available_in_dm,
  available_in_group
) VALUES 
  (
    'summary', 
    'Summary', 
    'สรุป',
    'Summarize recent conversation and highlight key points, decisions, and action items',
    'สรุปบทสนทนาล่าสุด พร้อมไฮไลท์ประเด็นสำคัญ การตัดสินใจ และสิ่งที่ต้องทำต่อ',
    '/summary or /summary last 50 messages',
    '/สรุป หรือ /สรุป 50 ข้อความล่าสุด',
    'FileText',
    1,
    false,
    true,
    true
  ),
  (
    'faq', 
    'FAQ', 
    'คำถาม',
    'Answer questions using knowledge base and documented FAQs',
    'ตอบคำถามโดยใช้ฐานความรู้และ FAQ ที่บันทึกไว้',
    '/faq what is the refund policy?',
    '/คำถาม นโยบายการคืนเงินคืออะไร?',
    'HelpCircle',
    2,
    false,
    true,
    true
  ),
  (
    'todo', 
    'To-Do / Reminder', 
    'รายการงาน',
    'Create tasks and set reminders for the group',
    'สร้างรายการงานและตั้งการแจ้งเตือนสำหรับกลุ่ม',
    '/todo remind us tomorrow 10am to send the report',
    '/งาน เตือนพรุ่งนี้ 10 โมงเช้าส่งรายงาน',
    'CheckSquare',
    3,
    false,
    true,
    true
  ),
  (
    'report', 
    'Report', 
    'รายงาน',
    'Generate activity and engagement reports for the group',
    'สร้างรายงานกิจกรรมและการมีส่วนร่วมของกลุ่ม',
    '/report weekly or /report today',
    '/รายงาน สัปดาห์นี้ หรือ /รายงาน วันนี้',
    'BarChart3',
    4,
    false,
    true,
    true
  ),
  (
    'help', 
    'Help', 
    'ช่วยเหลือ',
    'Show available commands and how to use the bot',
    'แสดงคำสั่งที่ใช้ได้และวิธีใช้บอท',
    '/help',
    '/ช่วยเหลือ',
    'Info',
    5,
    false,
    true,
    true
  ),
  (
    'ask', 
    'General Q&A', 
    'ถามทั่วไป',
    'Ask general questions or have a conversation with the bot',
    'ถามคำถามทั่วไปหรือสนทนากับบอท',
    '@goodlime how does X work?',
    '@goodlime อันนี้ทำงานยังไง?',
    'MessageSquare',
    6,
    true,
    true,
    true
  );

-- Insert default aliases
INSERT INTO public.command_aliases (command_id, alias_text, language, is_primary, is_prefix)
SELECT id, '/summary', 'en', true, true FROM public.bot_commands WHERE command_key = 'summary'
UNION ALL
SELECT id, '/สรุป', 'th', true, true FROM public.bot_commands WHERE command_key = 'summary'
UNION ALL
SELECT id, 'สรุปหน่อย', 'th', false, false FROM public.bot_commands WHERE command_key = 'summary'
UNION ALL
SELECT id, '/faq', 'en', true, true FROM public.bot_commands WHERE command_key = 'faq'
UNION ALL
SELECT id, '/คำถาม', 'th', true, true FROM public.bot_commands WHERE command_key = 'faq'
UNION ALL
SELECT id, '/todo', 'en', true, true FROM public.bot_commands WHERE command_key = 'todo'
UNION ALL
SELECT id, '/งาน', 'th', true, true FROM public.bot_commands WHERE command_key = 'todo'
UNION ALL
SELECT id, '/report', 'en', true, true FROM public.bot_commands WHERE command_key = 'report'
UNION ALL
SELECT id, '/รายงาน', 'th', true, true FROM public.bot_commands WHERE command_key = 'report'
UNION ALL
SELECT id, '/help', 'en', true, true FROM public.bot_commands WHERE command_key = 'help'
UNION ALL
SELECT id, '/ช่วยเหลือ', 'th', true, true FROM public.bot_commands WHERE command_key = 'help';

-- Insert default triggers
INSERT INTO public.bot_triggers (
  trigger_text, 
  trigger_type, 
  language, 
  is_primary, 
  match_type,
  available_in_dm,
  available_in_group
) VALUES 
  ('@goodlime', 'mention', 'en', true, 'contains', false, true),
  ('@bot', 'mention', 'en', false, 'contains', false, true),
  ('Hi', 'keyword', 'en', false, 'starts_with', true, true),
  ('เฮ้', 'keyword', 'th', false, 'starts_with', true, true),
  ('สวัสดี', 'keyword', 'th', false, 'starts_with', true, true);