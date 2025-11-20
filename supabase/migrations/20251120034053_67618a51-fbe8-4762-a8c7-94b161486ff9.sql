-- Create mood_history table to track AI mood changes over time
CREATE TABLE public.mood_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,
  energy_level INTEGER NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mood_history ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Authenticated users can manage mood_history"
ON public.mood_history
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_mood_history_group_id_recorded_at 
ON public.mood_history(group_id, recorded_at DESC);

-- Add comment
COMMENT ON TABLE public.mood_history IS 'Tracks AI personality mood and energy changes over time for magic mode groups';