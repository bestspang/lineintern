-- Add streak shield columns to happy_points table
ALTER TABLE public.happy_points
ADD COLUMN IF NOT EXISTS streak_shields INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_shield_used_at DATE;

-- Add comment for documentation
COMMENT ON COLUMN public.happy_points.streak_shields IS 'Number of streak shields owned by employee';
COMMENT ON COLUMN public.happy_points.last_shield_used_at IS 'Date when last shield was used';

-- Insert Streak Shield reward into point_rewards table
INSERT INTO public.point_rewards (
  name,
  name_th,
  description,
  description_th,
  point_cost,
  category,
  icon,
  cooldown_days,
  requires_approval,
  stock_limit,
  is_active
) VALUES (
  'Streak Shield',
  'โล่ป้องกัน Streak',
  'Protect your streak from one late check-in. Will auto-activate when needed.',
  'ป้องกัน streak ไม่ให้ reset 1 ครั้งเมื่อมาสาย ใช้อัตโนมัติเมื่อจำเป็น',
  200,
  'perk',
  '🛡️',
  0,
  false,
  NULL,
  true
) ON CONFLICT DO NOTHING;