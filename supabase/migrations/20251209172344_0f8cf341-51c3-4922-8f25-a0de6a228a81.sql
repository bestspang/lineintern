-- Phase 1: Ghost Tracker & Response Analytics + Relationship & Sentiment Radar

-- 1. Add response tracking columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES messages(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS response_time_seconds integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_within_work_hours boolean DEFAULT true;

-- 2. Create response_analytics table for aggregated metrics
CREATE TABLE IF NOT EXISTS response_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_messages_sent integer DEFAULT 0,
  total_replies_received integer DEFAULT 0,
  avg_response_time_seconds integer,
  min_response_time_seconds integer,
  max_response_time_seconds integer,
  messages_during_work_hours integer DEFAULT 0,
  messages_outside_work_hours integer DEFAULT 0,
  ghost_score numeric(3,2) DEFAULT 0.00, -- 0-1 score, higher = more ghosting
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, group_id, date)
);

-- 3. Create user_sentiment_history for tracking sentiment trends
CREATE TABLE IF NOT EXISTS user_sentiment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  date date NOT NULL,
  message_count integer DEFAULT 0,
  avg_sentiment numeric(3,2) DEFAULT 0.00, -- -1 to 1
  positive_count integer DEFAULT 0,
  negative_count integer DEFAULT 0,
  neutral_count integer DEFAULT 0,
  emotion_breakdown jsonb DEFAULT '{}', -- {joy: 5, anger: 2, sadness: 1, ...}
  burnout_score numeric(3,2) DEFAULT 0.00, -- 0-1, higher = more risk
  burnout_signals jsonb DEFAULT '[]', -- ["negative_trend", "low_engagement", ...]
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, group_id, date)
);

-- 4. Create user_network_metrics for network analysis
CREATE TABLE IF NOT EXISTS user_network_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  degree_centrality numeric(5,4) DEFAULT 0.0000, -- Number of connections
  betweenness_centrality numeric(5,4) DEFAULT 0.0000, -- Bridge between others
  closeness_centrality numeric(5,4) DEFAULT 0.0000, -- Average distance to others
  eigenvector_centrality numeric(5,4) DEFAULT 0.0000, -- Influence score
  network_role text DEFAULT 'regular', -- 'influencer', 'connector', 'outsider', 'regular'
  unique_contacts integer DEFAULT 0,
  total_interactions integer DEFAULT 0,
  most_contacted_users jsonb DEFAULT '[]', -- [{user_id, count}, ...]
  communication_direction jsonb DEFAULT '{}', -- {outbound: 50, inbound: 30}
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, group_id, period_start, period_end)
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_response_time ON messages(response_time_seconds) WHERE response_time_seconds IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_response_analytics_user_date ON response_analytics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_response_analytics_ghost ON response_analytics(ghost_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_sentiment_history_user_date ON user_sentiment_history(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_sentiment_history_burnout ON user_sentiment_history(burnout_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_network_metrics_user_period ON user_network_metrics(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_user_network_metrics_role ON user_network_metrics(network_role);

-- 6. Enable RLS on new tables
ALTER TABLE response_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sentiment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_network_metrics ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
CREATE POLICY "Authenticated users can view response_analytics"
  ON response_analytics FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage response_analytics"
  ON response_analytics FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view user_sentiment_history"
  ON user_sentiment_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage user_sentiment_history"
  ON user_sentiment_history FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view user_network_metrics"
  ON user_network_metrics FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage user_network_metrics"
  ON user_network_metrics FOR ALL
  USING (true) WITH CHECK (true);

-- 8. Create function to calculate ghost score
CREATE OR REPLACE FUNCTION calculate_ghost_score(
  p_total_sent integer,
  p_replies_received integer,
  p_avg_response_time integer
) RETURNS numeric AS $$
DECLARE
  reply_ratio numeric;
  time_penalty numeric;
BEGIN
  -- No messages sent = no ghost score
  IF p_total_sent = 0 THEN RETURN 0.00; END IF;
  
  -- Reply ratio (0-1, lower = more ghosting)
  reply_ratio := LEAST(1.0, COALESCE(p_replies_received::numeric / p_total_sent, 0));
  
  -- Time penalty (longer response = higher penalty)
  -- 0 = instant, 0.5 = 1 hour, 1 = 4+ hours
  time_penalty := LEAST(1.0, COALESCE(p_avg_response_time, 0) / 14400.0);
  
  -- Ghost score = (1 - reply_ratio) * 0.6 + time_penalty * 0.4
  RETURN ROUND(((1 - reply_ratio) * 0.6 + time_penalty * 0.4)::numeric, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- 9. Create function to detect burnout signals
CREATE OR REPLACE FUNCTION detect_burnout_signals(
  p_avg_sentiment numeric,
  p_negative_ratio numeric,
  p_message_count integer,
  p_prev_message_count integer
) RETURNS jsonb AS $$
DECLARE
  signals jsonb := '[]';
BEGIN
  -- Very negative sentiment
  IF p_avg_sentiment < -0.3 THEN
    signals := signals || '["high_negativity"]'::jsonb;
  END IF;
  
  -- High negative message ratio
  IF p_negative_ratio > 0.4 THEN
    signals := signals || '["frequent_negative_messages"]'::jsonb;
  END IF;
  
  -- Significant drop in engagement
  IF p_prev_message_count > 0 AND p_message_count < p_prev_message_count * 0.5 THEN
    signals := signals || '["declining_engagement"]'::jsonb;
  END IF;
  
  -- Low engagement
  IF p_message_count < 3 THEN
    signals := signals || '["low_engagement"]'::jsonb;
  END IF;
  
  RETURN signals;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;