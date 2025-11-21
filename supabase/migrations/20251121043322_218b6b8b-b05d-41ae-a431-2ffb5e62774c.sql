-- Phase 1: Conversation Threading Tables
CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  thread_title TEXT,
  started_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
  summary TEXT,
  message_count INTEGER DEFAULT 0,
  participants JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_threads_group ON conversation_threads(group_id, last_message_at DESC);
CREATE INDEX idx_conversation_threads_status ON conversation_threads(status);

CREATE TABLE IF NOT EXISTS message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  is_thread_starter BOOLEAN DEFAULT false,
  position_in_thread INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, thread_id)
);

CREATE INDEX idx_message_threads_thread ON message_threads(thread_id, position_in_thread);
CREATE INDEX idx_message_threads_message ON message_threads(message_id);

-- Phase 2: Working Memory (Short-term)
CREATE TABLE IF NOT EXISTS working_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('answer', 'question', 'decision', 'task', 'context', 'fact')),
  content TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  importance_score REAL DEFAULT 0.5 CHECK (importance_score >= 0 AND importance_score <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_working_memory_expires ON working_memory(expires_at);
CREATE INDEX idx_working_memory_group ON working_memory(group_id, created_at DESC);
CREATE INDEX idx_working_memory_thread ON working_memory(conversation_thread_id);

-- Phase 2: Enhanced Long-Term Memory
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS related_thread_ids UUID[] DEFAULT '{}';
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS memory_strength REAL DEFAULT 1.0 CHECK (memory_strength >= 0 AND memory_strength <= 1);
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS last_reinforced_at TIMESTAMPTZ;
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_memory_items_strength ON memory_items(memory_strength DESC);
CREATE INDEX IF NOT EXISTS idx_memory_items_keywords ON memory_items USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_memory_items_threads ON memory_items USING GIN(related_thread_ids);

-- Phase 7: User Privacy & Controls
ALTER TABLE users ADD COLUMN IF NOT EXISTS memory_preferences JSONB DEFAULT '{
  "auto_save_conversations": true,
  "retention_days": 90,
  "exclude_topics": []
}'::jsonb;

-- RLS Policies for new tables
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage conversation_threads"
  ON conversation_threads FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage message_threads"
  ON message_threads FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage working_memory"
  ON working_memory FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Helper function to find or create conversation thread
CREATE OR REPLACE FUNCTION find_or_create_thread(
  p_group_id UUID,
  p_user_id UUID,
  p_message_text TEXT,
  p_message_timestamp TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_thread_id UUID;
  v_recent_threshold TIMESTAMPTZ;
  v_keywords TEXT[];
BEGIN
  -- Look for active threads in last 30 minutes
  v_recent_threshold := p_message_timestamp - INTERVAL '30 minutes';
  
  -- Extract simple keywords (first 3 words)
  v_keywords := string_to_array(lower(substring(p_message_text from 1 for 50)), ' ');
  
  -- Try to find recent active thread with similar keywords
  SELECT ct.id INTO v_thread_id
  FROM conversation_threads ct
  WHERE ct.group_id = p_group_id
    AND ct.status = 'active'
    AND ct.last_message_at >= v_recent_threshold
    AND (
      ct.started_by_user_id = p_user_id
      OR p_user_id = ANY(SELECT jsonb_array_elements_text(ct.participants)::UUID)
    )
  ORDER BY ct.last_message_at DESC
  LIMIT 1;
  
  -- If no thread found, create new one
  IF v_thread_id IS NULL THEN
    INSERT INTO conversation_threads (
      group_id,
      started_by_user_id,
      started_at,
      last_message_at,
      thread_title,
      participants,
      message_count
    ) VALUES (
      p_group_id,
      p_user_id,
      p_message_timestamp,
      p_message_timestamp,
      substring(p_message_text from 1 for 100),
      jsonb_build_array(p_user_id),
      1
    ) RETURNING id INTO v_thread_id;
  ELSE
    -- Update existing thread
    UPDATE conversation_threads
    SET last_message_at = p_message_timestamp,
        message_count = message_count + 1,
        participants = CASE
          WHEN NOT (participants @> jsonb_build_array(p_user_id))
          THEN participants || jsonb_build_array(p_user_id)
          ELSE participants
        END,
        updated_at = NOW()
    WHERE id = v_thread_id;
  END IF;
  
  RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get thread context messages
CREATE OR REPLACE FUNCTION get_thread_context(
  p_thread_id UUID,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE(
  message_id UUID,
  user_id UUID,
  user_display_name TEXT,
  text TEXT,
  sent_at TIMESTAMPTZ,
  direction message_direction,
  position_in_thread INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.user_id,
    u.display_name,
    m.text,
    m.sent_at,
    m.direction,
    mt.position_in_thread
  FROM message_threads mt
  JOIN messages m ON m.id = mt.message_id
  LEFT JOIN users u ON u.id = m.user_id
  WHERE mt.thread_id = p_thread_id
  ORDER BY mt.position_in_thread DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get working memory for context
CREATE OR REPLACE FUNCTION get_working_memory_context(
  p_group_id UUID,
  p_thread_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE(
  memory_type TEXT,
  content TEXT,
  importance_score REAL,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wm.memory_type,
    wm.content,
    wm.importance_score,
    wm.created_at
  FROM working_memory wm
  WHERE wm.group_id = p_group_id
    AND wm.expires_at > NOW()
    AND (p_thread_id IS NULL OR wm.conversation_thread_id = p_thread_id)
  ORDER BY wm.importance_score DESC, wm.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search memories by keywords
CREATE OR REPLACE FUNCTION search_memories_by_keywords(
  p_keywords TEXT[],
  p_group_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE(
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  importance_score REAL,
  memory_strength REAL,
  relevance_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mi.id,
    mi.title,
    mi.content,
    mi.category,
    mi.importance_score,
    mi.memory_strength,
    (array_length(mi.keywords & p_keywords, 1)::REAL / GREATEST(array_length(p_keywords, 1), 1)::REAL) as relevance_score
  FROM memory_items mi
  WHERE mi.is_deleted = false
    AND mi.memory_strength > 0.3
    AND (p_group_id IS NULL OR mi.group_id = p_group_id)
    AND (p_user_id IS NULL OR mi.user_id = p_user_id)
    AND mi.keywords && p_keywords
  ORDER BY relevance_score DESC, mi.memory_strength DESC, mi.importance_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;