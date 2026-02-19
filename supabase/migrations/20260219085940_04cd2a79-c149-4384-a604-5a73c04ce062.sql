
-- =============================================
-- Cross-Group AI Query System - 4 Tables
-- =============================================

-- Table 1: ai_query_policies (requester access rules)
CREATE TABLE public.ai_query_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('group', 'user')),
  source_group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  source_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  scope_mode TEXT NOT NULL DEFAULT 'all' CHECK (scope_mode IN ('all', 'include', 'exclude')),
  allowed_data_sources TEXT[] NOT NULL DEFAULT '{messages}',
  time_window_days INTEGER NOT NULL DEFAULT 30,
  pii_mode TEXT NOT NULL DEFAULT 'mask_sensitive' CHECK (pii_mode IN ('none', 'mask_sensitive', 'strict')),
  max_hits_per_group INTEGER NOT NULL DEFAULT 50,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_source CHECK (
    (source_type = 'group' AND source_group_id IS NOT NULL AND source_user_id IS NULL) OR
    (source_type = 'user' AND source_user_id IS NOT NULL AND source_group_id IS NULL)
  )
);

ALTER TABLE public.ai_query_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage ai_query_policies"
  ON public.ai_query_policies FOR ALL
  TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TRIGGER update_ai_query_policies_updated_at
  BEFORE UPDATE ON public.ai_query_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 2: ai_query_scope_groups (include/exclude group list)
CREATE TABLE public.ai_query_scope_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.ai_query_policies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  UNIQUE (policy_id, group_id)
);

ALTER TABLE public.ai_query_scope_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage ai_query_scope_groups"
  ON public.ai_query_scope_groups FOR ALL
  TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

-- Table 3: ai_query_group_export (per-group export control)
CREATE TABLE public.ai_query_group_export (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
  export_enabled BOOLEAN NOT NULL DEFAULT false,
  allowed_data_sources TEXT[] NOT NULL DEFAULT '{}',
  synonyms TEXT[] NOT NULL DEFAULT '{}',
  masking_level TEXT NOT NULL DEFAULT 'none' CHECK (masking_level IN ('none', 'mask_sensitive', 'strict')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_query_group_export ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage ai_query_group_export"
  ON public.ai_query_group_export FOR ALL
  TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TRIGGER update_ai_query_group_export_updated_at
  BEFORE UPDATE ON public.ai_query_group_export
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 4: ai_query_memory (follow-up memory, lightweight)
CREATE TABLE public.ai_query_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources_used JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE public.ai_query_memory ENABLE ROW LEVEL SECURITY;

-- Memory is read/written by edge functions (service role), admin can view
CREATE POLICY "Admin can view ai_query_memory"
  ON public.ai_query_memory FOR SELECT
  TO authenticated
  USING (public.has_admin_access(auth.uid()));

-- Index for quick memory lookup
CREATE INDEX idx_ai_query_memory_user_group ON public.ai_query_memory (user_id, group_id, expires_at DESC);
CREATE INDEX idx_ai_query_policies_source ON public.ai_query_policies (source_type, source_group_id, source_user_id, enabled);
