-- Create chat_summaries table for persistent summaries
CREATE TABLE IF NOT EXISTS public.chat_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  from_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  from_time TIMESTAMP WITH TIME ZONE NOT NULL,
  to_time TIMESTAMP WITH TIME ZONE NOT NULL,
  summary_text TEXT NOT NULL,
  main_topics TEXT[] DEFAULT '{}',
  decisions JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  open_questions TEXT[] DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can manage chat_summaries"
ON public.chat_summaries
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Indexes for performance
CREATE INDEX idx_chat_summaries_group_id ON public.chat_summaries(group_id);
CREATE INDEX idx_chat_summaries_time_range ON public.chat_summaries(group_id, from_time, to_time);
CREATE INDEX idx_chat_summaries_created_at ON public.chat_summaries(created_at DESC);

-- Add full-text search index on messages.text for /find command
CREATE INDEX IF NOT EXISTS idx_messages_text_search ON public.messages USING gin(to_tsvector('english', text));

-- Add index for /mentions command
CREATE INDEX IF NOT EXISTS idx_messages_text_mentions ON public.messages(group_id, text) WHERE text LIKE '%@%';