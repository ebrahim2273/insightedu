-- Delete all existing data
DELETE FROM attendance;
DELETE FROM face_embeddings;
DELETE FROM students;
DELETE FROM classes;

-- Add user_id column to students table
ALTER TABLE students ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid();

-- Add user_id column to classes table
ALTER TABLE classes ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid();

-- Drop existing RLS policies for students
DROP POLICY IF EXISTS "Admins can manage students" ON students;
DROP POLICY IF EXISTS "Authenticated users can view students" ON students;

-- Drop existing RLS policies for classes
DROP POLICY IF EXISTS "Admins can manage classes" ON classes;
DROP POLICY IF EXISTS "Authenticated users can view classes" ON classes;

-- Drop existing RLS policies for attendance
DROP POLICY IF EXISTS "Admins can manage attendance" ON attendance;
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON attendance;

-- Drop existing RLS policies for face_embeddings
DROP POLICY IF EXISTS "Admins can manage face embeddings" ON face_embeddings;
DROP POLICY IF EXISTS "Authenticated users can view face embeddings" ON face_embeddings;

-- Create new RLS policies for students (user owns their own data)
CREATE POLICY "Users can view own students"
ON students FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own students"
ON students FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own students"
ON students FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own students"
ON students FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Create new RLS policies for classes (user owns their own data)
CREATE POLICY "Users can view own classes"
ON classes FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own classes"
ON classes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own classes"
ON classes FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own classes"
ON classes FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Create new RLS policies for attendance (based on student ownership)
CREATE POLICY "Users can view own attendance"
ON attendance FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = attendance.student_id 
    AND students.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own attendance"
ON attendance FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = attendance.student_id 
    AND students.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own attendance"
ON attendance FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = attendance.student_id 
    AND students.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own attendance"
ON attendance FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = attendance.student_id 
    AND students.user_id = auth.uid()
  )
);

-- Create new RLS policies for face_embeddings (based on student ownership)
CREATE POLICY "Users can view own face embeddings"
ON face_embeddings FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = face_embeddings.student_id 
    AND students.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own face embeddings"
ON face_embeddings FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = face_embeddings.student_id 
    AND students.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own face embeddings"
ON face_embeddings FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = face_embeddings.student_id 
    AND students.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own face embeddings"
ON face_embeddings FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students 
    WHERE students.id = face_embeddings.student_id 
    AND students.user_id = auth.uid()
  )
);