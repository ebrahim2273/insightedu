-- Add student_id column to students table
ALTER TABLE public.students ADD COLUMN student_id TEXT UNIQUE;

-- Create index for better performance
CREATE INDEX idx_students_student_id ON public.students(student_id);