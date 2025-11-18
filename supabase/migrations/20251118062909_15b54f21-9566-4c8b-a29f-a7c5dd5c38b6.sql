-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix messages table RLS - replace overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage messages" ON public.messages;

-- Users can view messages from their groups
CREATE POLICY "Users can view group messages"
ON public.messages FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT gm.group_id 
    FROM public.group_members gm
    JOIN public.users u ON u.id = gm.user_id
    WHERE u.line_user_id = (
      SELECT line_user_id FROM public.users WHERE id = auth.uid()
    )
    AND gm.left_at IS NULL
  )
);

-- Bot can insert messages
CREATE POLICY "System can insert messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (true);

-- Admins can manage all messages
CREATE POLICY "Admins can manage all messages"
ON public.messages FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));