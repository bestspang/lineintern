-- Create cute_quotes table
CREATE TABLE public.cute_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  text_en TEXT,
  category TEXT DEFAULT 'general',
  emoji TEXT DEFAULT '😊',
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cute_quotes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read active quotes (for liveness camera)
CREATE POLICY "Anyone can read active quotes" ON public.cute_quotes
  FOR SELECT USING (is_active = true);

-- RLS Policy: Authenticated users with admin role can manage quotes
CREATE POLICY "Admins can manage quotes" ON public.cute_quotes
  FOR ALL USING (auth.role() = 'authenticated');

-- Insert sample quotes
INSERT INTO public.cute_quotes (text, emoji, category) VALUES
  ('ยิ้มกว้างๆๆๆๆๆค่ะ', '😁', 'funny'),
  ('หน้าบูดระวังมีริ้วรอย', '😅', 'funny'),
  ('วันนี้สดใสมากเลย!', '🌟', 'motivational'),
  ('ถ่ายสวยๆ นะคะ', '📸', 'general'),
  ('ทำงานวันนี้ให้ดีที่สุด!', '💪', 'motivational'),
  ('หน้าหล่อ/สวยจัง!', '🤩', 'funny'),
  ('นิ่งๆ อย่าขยับ!', '🧊', 'general'),
  ('รอแป๊บ...แค่ 3 วินาที', '⏱️', 'general'),
  ('สู้ๆ นะ!', '✊', 'motivational'),
  ('เก่งมากเลย!', '👏', 'motivational');

-- Insert feature flag for cute quotes
INSERT INTO public.feature_flags (flag_key, display_name, description, category, is_enabled, rollout_percentage)
VALUES (
  'cute_quotes_liveness',
  'Cute Quotes ใน Liveness Camera',
  'แสดงข้อความน่ารักตอนทำหน้าตรงค้างไว้',
  'ux',
  true,
  100
) ON CONFLICT (flag_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;