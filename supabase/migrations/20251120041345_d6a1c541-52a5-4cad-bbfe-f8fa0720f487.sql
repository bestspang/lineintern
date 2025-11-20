-- Initialize personality_state for existing active groups that don't have one yet
INSERT INTO personality_state (
  group_id, 
  mood, 
  energy_level, 
  current_interests, 
  relationship_map, 
  recent_topics, 
  personality_traits
)
SELECT 
  g.id,
  'friendly',
  70,
  '["conversations", "helping"]'::jsonb,
  '{}'::jsonb,
  '[]'::jsonb,
  '{"humor": 60, "helpfulness": 85, "curiosity": 75}'::jsonb
FROM groups g
WHERE g.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM personality_state ps WHERE ps.group_id = g.id
  );