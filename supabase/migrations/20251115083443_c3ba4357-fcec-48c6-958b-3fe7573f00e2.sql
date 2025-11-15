-- Add teacher email field to classes table
ALTER TABLE public.classes 
ADD COLUMN teacher_email TEXT;