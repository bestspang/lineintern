-- =============================================
-- HAPPY POINT SYSTEM - Database Schema v2.0
-- =============================================

-- 1. Main Points Balance Table
CREATE TABLE public.happy_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  point_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  
  -- Punctuality Streaks
  current_punctuality_streak INTEGER DEFAULT 0,
  longest_punctuality_streak INTEGER DEFAULT 0,
  last_punctuality_date DATE,
  
  -- Daily Response Score (reset daily, cap 20)
  daily_response_score INTEGER DEFAULT 0,
  daily_score_date DATE,
  
  -- Monthly Health Bonus (Loss Aversion mechanic)
  monthly_health_bonus INTEGER DEFAULT 100,
  health_bonus_month INTEGER, -- e.g., 202506 for June 2025
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(employee_id)
);

-- 2. Point Transactions Log (Audit Trail)
CREATE TABLE public.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'spend', 'deduct', 'bonus')),
  category TEXT NOT NULL CHECK (category IN ('attendance', 'response', 'health', 'streak', 'redemption', 'adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id UUID,
  reference_type TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Rewards Catalog
CREATE TABLE public.point_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_th TEXT,
  description TEXT,
  description_th TEXT,
  point_cost INTEGER NOT NULL CHECK (point_cost > 0),
  category TEXT NOT NULL CHECK (category IN ('micro', 'perk', 'legendary')),
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT false,
  stock_limit INTEGER, -- null = unlimited
  stock_used INTEGER DEFAULT 0,
  cooldown_days INTEGER DEFAULT 0,
  valid_from DATE,
  valid_until DATE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Redemption Records
CREATE TABLE public.point_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.point_rewards(id),
  point_cost INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'used', 'expired', 'cancelled', 'rejected')),
  approved_by_admin_id UUID,
  approved_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES for Performance
-- =============================================
CREATE INDEX idx_happy_points_employee ON public.happy_points(employee_id);
CREATE INDEX idx_point_transactions_employee ON public.point_transactions(employee_id);
CREATE INDEX idx_point_transactions_created ON public.point_transactions(created_at DESC);
CREATE INDEX idx_point_transactions_category ON public.point_transactions(category);
CREATE INDEX idx_point_rewards_active ON public.point_rewards(is_active) WHERE is_active = true;
CREATE INDEX idx_point_rewards_category ON public.point_rewards(category);
CREATE INDEX idx_point_redemptions_employee ON public.point_redemptions(employee_id);
CREATE INDEX idx_point_redemptions_status ON public.point_redemptions(status);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.happy_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_redemptions ENABLE ROW LEVEL SECURITY;

-- happy_points policies
CREATE POLICY "Admins can manage happy_points" ON public.happy_points
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Employees can view own happy_points" ON public.happy_points
  FOR SELECT USING (
    employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON e.line_user_id = u.line_user_id
      WHERE u.id = auth.uid()
    )
  );

-- point_transactions policies
CREATE POLICY "Admins can manage point_transactions" ON public.point_transactions
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Employees can view own transactions" ON public.point_transactions
  FOR SELECT USING (
    employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON e.line_user_id = u.line_user_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert transactions" ON public.point_transactions
  FOR INSERT WITH CHECK (true);

-- point_rewards policies
CREATE POLICY "Anyone can view active rewards" ON public.point_rewards
  FOR SELECT USING (is_active = true OR has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage rewards" ON public.point_rewards
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- point_redemptions policies
CREATE POLICY "Admins can manage redemptions" ON public.point_redemptions
  FOR ALL USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Employees can view own redemptions" ON public.point_redemptions
  FOR SELECT USING (
    employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON e.line_user_id = u.line_user_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Employees can create own redemptions" ON public.point_redemptions
  FOR INSERT WITH CHECK (
    employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON e.line_user_id = u.line_user_id
      WHERE u.id = auth.uid()
    )
  );

-- =============================================
-- TRIGGER for updated_at
-- =============================================
CREATE TRIGGER update_happy_points_updated_at
  BEFORE UPDATE ON public.happy_points
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_point_rewards_updated_at
  BEFORE UPDATE ON public.point_rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_point_redemptions_updated_at
  BEFORE UPDATE ON public.point_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- FUNCTION: Initialize happy_points for new employees
-- =============================================
CREATE OR REPLACE FUNCTION public.create_happy_points_for_employee()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.happy_points (employee_id, health_bonus_month)
  VALUES (NEW.id, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER * 100 + EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER)
  ON CONFLICT (employee_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER create_happy_points_on_employee_insert
  AFTER INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.create_happy_points_for_employee();

-- =============================================
-- DEFAULT REWARDS DATA
-- =============================================
INSERT INTO public.point_rewards (name, name_th, description, description_th, point_cost, category, icon, requires_approval, cooldown_days, display_order) VALUES
-- Micro Rewards
('Gacha Box', 'กาชาบ็อกซ์', 'Try your luck! Win random prizes or consolation points.', 'ลุ้นโชค! อาจได้รางวัลใหญ่หรือแต้มปลอบใจ', 50, 'micro', '🎲', false, 0, 1),
('DJ of the Day', 'ดีเจประจำวัน', 'Pick the office playlist for one day.', 'เลือกเพลงเปิดในออฟฟิศได้ 1 วัน', 100, 'micro', '🎵', false, 7, 2),

-- Perks
('Late Pass (15min)', 'บัตรสาย 15 นาที', 'Be up to 15 minutes late without penalty.', 'เข้างานสายได้ 15 นาทีโดยไม่เสียประวัติ', 150, 'perk', '⏰', false, 7, 10),
('Nap Pass', 'บัตรนอนกลางวัน', 'Take a 30-minute nap during lunch break.', 'สิทธิ์นอนพักกลางวัน 30 นาที', 250, 'perk', '😴', false, 3, 11),
('Late Pass (1hr)', 'บัตรสาย 1 ชม.', 'Be up to 1 hour late without penalty.', 'เข้างานสายได้ 1 ชั่วโมงโดยไม่เสียประวัติ', 300, 'perk', '🕐', false, 14, 12),
('Office Snack Stock', 'ขนมกองกลาง', 'Company buys snacks for the office.', 'บริษัทซื้อขนมเข้าออฟฟิศ 1 แพ็ค', 300, 'perk', '🍪', false, 30, 13),
('Bubble Tea Voucher', 'คูปองชานม', 'One bubble tea on the company.', 'ชานมไข่มุก 1 แก้ว', 400, 'perk', '🧋', false, 7, 14),
('Immunity Card', 'บัตรล้างประวัติ', 'Clear one late record from your history.', 'ล้างสถานะสาย 1 ครั้ง รักษา Streak', 400, 'perk', '🛡️', false, 30, 15),
('Deadline Extension', 'ขอเลื่อนส่งงาน', 'Extend a non-urgent deadline by 24 hours.', 'ขอเลื่อนกำหนดส่งงาน 24 ชม.', 500, 'perk', '📅', true, 14, 16),
('Movie Night', 'ตั๋วหนัง', 'One movie ticket (SF/Major).', 'ตั๋วหนัง 1 ใบ', 800, 'perk', '🎬', false, 30, 17),
('Sleep In (2hr)', 'นอนเต็มอิ่ม', 'Come in at 11 AM for one day.', 'เข้างาน 11 โมงได้ 1 วัน', 1200, 'perk', '🌙', true, 30, 18),
('Book Worm', 'หนังสือ 1 เล่ม', 'Company buys any book you want (up to 300 THB).', 'บริษัทซื้อหนังสือให้ 1 เล่ม (งบ 300 บาท)', 1200, 'perk', '📚', false, 60, 19),

-- Legendary
('Go Home Early', 'กลับบ้านก่อน', 'Leave 1 hour early for one day.', 'กลับบ้านก่อนเวลา 1 ชม.', 1000, 'legendary', '🏠', true, 30, 30),
('WFH Ticket', 'ทำงานที่บ้าน', 'Work from home for one day.', 'สิทธิ์ WFH 1 วัน', 1500, 'legendary', '💻', true, 14, 31),
('Half-Day Off', 'หยุดครึ่งวัน', 'Take half a day off without using vacation days.', 'หยุดครึ่งวันบ่ายโดยไม่ใช้วันลา', 2500, 'legendary', '🏖️', true, 30, 32),
('CEO Lunch', 'ข้าวเที่ยวกับ CEO', 'Exclusive lunch with the CEO.', 'ผู้บริหารเลี้ยงข้าวเที่ยวมื้อหรู', 3000, 'legendary', '👔', true, 90, 33);

-- =============================================
-- BACKFILL: Create happy_points for existing employees
-- =============================================
INSERT INTO public.happy_points (employee_id, health_bonus_month)
SELECT id, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER * 100 + EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
FROM public.employees
WHERE id NOT IN (SELECT employee_id FROM public.happy_points)
ON CONFLICT (employee_id) DO NOTHING;