-- Fix function search path security issue
DROP TRIGGER IF EXISTS user_settings_updated_at ON public.user_settings;
DROP FUNCTION IF EXISTS update_user_settings_updated_at();

CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();