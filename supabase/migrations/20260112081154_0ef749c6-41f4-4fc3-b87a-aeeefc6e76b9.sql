-- Fix: Replace invalid & operator with proper INTERSECT for text[] arrays
CREATE OR REPLACE FUNCTION public.search_memories_by_keywords(
  p_keywords text[], 
  p_group_id uuid DEFAULT NULL::uuid, 
  p_user_id uuid DEFAULT NULL::uuid, 
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  id uuid, 
  title text, 
  content text, 
  category text, 
  importance_score real, 
  memory_strength real, 
  relevance_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mi.id,
    mi.title,
    mi.content,
    mi.category,
    mi.importance_score,
    mi.memory_strength,
    -- FIX: Use INTERSECT instead of invalid & operator for text[]
    (COALESCE(array_length(ARRAY(
      SELECT unnest(mi.keywords) 
      INTERSECT 
      SELECT unnest(p_keywords)
    ), 1), 0)::REAL / GREATEST(array_length(p_keywords, 1), 1)::REAL) as relevance_score
  FROM memory_items mi
  WHERE mi.is_deleted = false
    AND mi.memory_strength > 0.3
    AND (p_group_id IS NULL OR mi.group_id = p_group_id)
    AND (p_user_id IS NULL OR mi.user_id = p_user_id)
    AND mi.keywords && p_keywords
  ORDER BY relevance_score DESC, mi.memory_strength DESC, mi.importance_score DESC
  LIMIT p_limit;
END;
$function$;