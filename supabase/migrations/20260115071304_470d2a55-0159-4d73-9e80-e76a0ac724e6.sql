-- Create app_role enum if not exists
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create feature_flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT false,
  rollout_percentage INTEGER DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  enabled_for_roles TEXT[],
  enabled_for_employees UUID[],
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create deploy_checklist_runs table
CREATE TABLE IF NOT EXISTS public.deploy_checklist_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE DEFAULT CURRENT_DATE,
  run_by UUID REFERENCES auth.users(id),
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  passed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  overall_status TEXT DEFAULT 'pending' CHECK (overall_status IN ('pending', 'passed', 'failed', 'partial')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create system_health_logs table for tracking health check history
CREATE TABLE IF NOT EXISTS public.system_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'degraded', 'down')),
  response_time_ms INTEGER,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deploy_checklist_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_logs ENABLE ROW LEVEL SECURITY;

-- Feature flags policies: Anyone can read (for frontend checks)
CREATE POLICY "Anyone can read feature flags" ON public.feature_flags
  FOR SELECT USING (true);

-- Feature flags policies: Only authenticated users can manage (will add admin check in app)
CREATE POLICY "Authenticated users can manage feature flags" ON public.feature_flags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Deploy checklist policies
CREATE POLICY "Authenticated users can read checklist runs" ON public.deploy_checklist_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create checklist runs" ON public.deploy_checklist_runs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = run_by);

-- System health logs policies
CREATE POLICY "Anyone can read health logs" ON public.system_health_logs
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert health logs" ON public.system_health_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create updated_at trigger for feature_flags
CREATE OR REPLACE FUNCTION public.update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feature_flags_updated_at();

-- Insert default feature flags
INSERT INTO public.feature_flags (flag_key, display_name, description, is_enabled, category)
VALUES 
  ('portal_new_bottom_nav', 'Portal: New Bottom Navigation', 'Use new 5-item bottom navigation in portal', false, 'portal'),
  ('portal_dynamic_greeting', 'Portal: Dynamic Greeting', 'Show time-based greeting messages', false, 'portal'),
  ('dashboard_command_palette', 'Dashboard: Command Palette', 'Enable Cmd+K command palette in admin dashboard', false, 'dashboard'),
  ('attendance_liveness_check', 'Attendance: Liveness Detection', 'Require liveness detection for photo check-in', false, 'attendance'),
  ('deposit_auto_ocr', 'Deposit: Auto OCR', 'Automatically extract data from deposit slips', true, 'deposit')
ON CONFLICT (flag_key) DO NOTHING;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON public.feature_flags(category);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON public.feature_flags(is_enabled);
CREATE INDEX IF NOT EXISTS idx_deploy_checklist_runs_date ON public.deploy_checklist_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_logs_created ON public.system_health_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_logs_type ON public.system_health_logs(check_type);