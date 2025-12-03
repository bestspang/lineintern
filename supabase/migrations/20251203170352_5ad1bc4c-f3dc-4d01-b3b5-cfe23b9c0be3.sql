-- Phase 1: Fix memory_items constraints to allow all needed categories and source_types

-- 1. Drop old category constraint if exists
ALTER TABLE memory_items DROP CONSTRAINT IF EXISTS memory_items_category_check;

-- 2. Add new category constraint with ALL needed categories
ALTER TABLE memory_items ADD CONSTRAINT memory_items_category_check 
CHECK (category = ANY (ARRAY[
  -- Original categories
  'trait', 'preference', 'topic', 'project', 'context', 'relationship', 'meta',
  -- Personal info categories (from memory-writer)
  'name', 'birthday', 'hobby', 'habit', 'life_event', 'food_preference', 'work_info', 'skill',
  -- Business categories
  'decision', 'policy', 'task', 'metric', 'fact',
  -- Generic fallback
  'general'
]));

-- 3. Drop old source_type constraint if exists
ALTER TABLE memory_items DROP CONSTRAINT IF EXISTS memory_items_source_type_check;

-- 4. Add new source_type constraint with 'conversation' and 'passive'
ALTER TABLE memory_items ADD CONSTRAINT memory_items_source_type_check 
CHECK (source_type = ANY (ARRAY['dm', 'mention', 'passive', 'manual', 'conversation']));