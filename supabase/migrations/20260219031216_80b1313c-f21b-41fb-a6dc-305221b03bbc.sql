
-- 1. Add use_mode column to point_rewards
ALTER TABLE public.point_rewards ADD COLUMN IF NOT EXISTS use_mode TEXT NOT NULL DEFAULT 'use_now';

-- 2. Create employee_bag_items table
CREATE TABLE public.employee_bag_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reward_id UUID REFERENCES public.point_rewards(id) ON DELETE SET NULL,
  redemption_id UUID REFERENCES public.point_redemptions(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  item_name_th TEXT,
  item_icon TEXT DEFAULT '🎁',
  item_type TEXT NOT NULL DEFAULT 'reward',
  status TEXT NOT NULL DEFAULT 'active',
  usage_rules TEXT,
  usage_rules_th TEXT,
  auto_activate BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  granted_by TEXT NOT NULL DEFAULT 'purchase',
  granted_by_admin_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.employee_bag_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Admin/HR can see all bag items
CREATE POLICY "Admin/HR can view all bag items"
ON public.employee_bag_items
FOR SELECT
USING (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid()));

-- Admin/HR can insert bag items (for granting)
CREATE POLICY "Admin/HR can insert bag items"
ON public.employee_bag_items
FOR INSERT
WITH CHECK (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid()));

-- Admin/HR can update bag items
CREATE POLICY "Admin/HR can update bag items"
ON public.employee_bag_items
FOR UPDATE
USING (public.has_admin_access(auth.uid()) OR public.has_hr_access(auth.uid()));

-- Admin can delete bag items
CREATE POLICY "Admin can delete bag items"
ON public.employee_bag_items
FOR DELETE
USING (public.has_admin_access(auth.uid()));

-- Service role / edge functions handle employee's own items via service key
-- No employee self-access RLS needed since portal uses portalApi with service role

-- 5. Index for fast lookup
CREATE INDEX idx_employee_bag_items_employee_status ON public.employee_bag_items (employee_id, status);
CREATE INDEX idx_employee_bag_items_type ON public.employee_bag_items (item_type, status);

-- 6. Auto-update updated_at trigger
CREATE TRIGGER update_employee_bag_items_updated_at
  BEFORE UPDATE ON public.employee_bag_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Update existing Streak Shield rewards to bag_only mode
UPDATE public.point_rewards SET use_mode = 'bag_only' WHERE name = 'Streak Shield';

-- 8. Migrate existing streak_shields from happy_points to employee_bag_items
INSERT INTO public.employee_bag_items (employee_id, item_name, item_name_th, item_icon, item_type, status, auto_activate, granted_by, usage_rules, usage_rules_th)
SELECT 
  hp.employee_id,
  'Streak Shield',
  'โล่ป้องกัน Streak',
  '🛡️',
  'shield',
  'active',
  true,
  'purchase',
  'Auto-activates when you are late or miss a work day. Protects your punctuality streak from resetting.',
  'ใช้อัตโนมัติเมื่อคุณมาสายหรือขาดงาน ช่วยป้องกันไม่ให้ streak ตรงเวลาถูกรีเซ็ต'
FROM public.happy_points hp
CROSS JOIN generate_series(1, GREATEST(COALESCE(hp.streak_shields, 0), 0)) AS s
WHERE hp.streak_shields > 0;
