-- Phase 2.1: Social Intelligence Layer
-- Create user_relationships table for tracking relationships between users
CREATE TABLE user_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_a_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  user_b_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  -- AI-inferred relationships
  relationship_type TEXT DEFAULT 'unknown', -- 'romantic', 'family', 'boss-employee', 'friends', 'colleagues', 'unknown'
  confidence_score REAL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Observations
  interaction_count INTEGER DEFAULT 0,
  first_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Behavioral patterns
  communication_style JSONB DEFAULT '{}'::jsonb,
  
  -- Inferred details
  inferred_data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(group_id, user_a_id, user_b_id),
  CHECK (user_a_id != user_b_id)
);

CREATE INDEX idx_user_relationships_group ON user_relationships(group_id);
CREATE INDEX idx_user_relationships_type ON user_relationships(relationship_type);
CREATE INDEX idx_user_relationships_users ON user_relationships(user_a_id, user_b_id);

-- Create user_profiles table for individual user profiles per group
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  -- AI-inferred personal data
  inferred_age_range TEXT,
  inferred_gender TEXT,
  inferred_occupation TEXT,
  confidence_scores JSONB DEFAULT '{}'::jsonb,
  
  -- Preferences (learned over time)
  preferences JSONB DEFAULT '{}'::jsonb,
  
  -- Personality traits (observed)
  personality_traits JSONB DEFAULT '{}'::jsonb,
  
  -- Behavioral patterns (per group)
  behavioral_patterns JSONB DEFAULT '{}'::jsonb,
  
  -- Learning metadata
  observation_count INTEGER DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_user_profiles_group_user ON user_profiles(group_id, user_id);
CREATE INDEX idx_user_profiles_user ON user_profiles(user_id);

-- Add trigger for updated_at columns
CREATE TRIGGER update_user_relationships_updated_at
  BEFORE UPDATE ON user_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE user_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can manage user_relationships"
  ON user_relationships FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage user_profiles"
  ON user_profiles FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);