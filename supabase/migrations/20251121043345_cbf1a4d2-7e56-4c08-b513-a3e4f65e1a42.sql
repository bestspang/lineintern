-- Fix security warnings: Add search_path to all functions

-- Drop and recreate find_or_create_thread with search_path
DROP FUNCTION IF EXISTS find_or_create_thread(UUID, UUID, TEXT, TIMESTAMPTZ);
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
  v_recent_threshold := p_message_timestamp - INTERVAL '30 minutes';
  v_keywords := string_to_array(lower(substring(p_message_text from 1 for 50)), ' ');
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate get_thread_context with search_path
DROP FUNCTION IF EXISTS get_thread_context(UUID, INTEGER);
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate get_working_memory_context with search_path
DROP FUNCTION IF EXISTS get_working_memory_context(UUID, UUID, INTEGER);
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate search_memories_by_keywords with search_path
DROP FUNCTION IF EXISTS search_memories_by_keywords(TEXT[], UUID, UUID, INTEGER);
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;