ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS session_name text;

CREATE INDEX IF NOT EXISTS idx_attendance_class_marked
  ON public.attendance (class_id, marked_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_session
  ON public.attendance (class_id, session_name);
