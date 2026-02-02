-- Add approved_late_start columns to attendance_adjustments table
ALTER TABLE public.attendance_adjustments 
ADD COLUMN IF NOT EXISTS approved_late_start BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_late_reason TEXT;