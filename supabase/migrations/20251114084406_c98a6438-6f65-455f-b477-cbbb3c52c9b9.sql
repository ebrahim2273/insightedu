-- Update the handle_new_user function to also assign admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  
  -- Assign admin role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'admin');
  
  RETURN new;
END;
$function$;