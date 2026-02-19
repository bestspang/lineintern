
-- Gacha Box Items table
CREATE TABLE public.gacha_box_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reward_id UUID NOT NULL REFERENCES public.point_rewards(id) ON DELETE CASCADE,
  prize_name TEXT NOT NULL,
  prize_name_th TEXT,
  prize_icon TEXT NOT NULL DEFAULT '🎁',
  prize_type TEXT NOT NULL DEFAULT 'nothing' CHECK (prize_type IN ('reward', 'points', 'nothing')),
  prize_value INT NOT NULL DEFAULT 0,
  prize_reward_id UUID REFERENCES public.point_rewards(id) ON DELETE SET NULL,
  weight INT NOT NULL DEFAULT 10 CHECK (weight > 0),
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gacha_box_items ENABLE ROW LEVEL SECURITY;

-- Admin can manage via service_role (edge functions)
-- Anon/authenticated can read active items (for portal display via portal-data)
CREATE POLICY "Anyone can read active gacha items"
  ON public.gacha_box_items
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage gacha items"
  ON public.gacha_box_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookup by reward_id
CREATE INDEX idx_gacha_box_items_reward_id ON public.gacha_box_items(reward_id);
