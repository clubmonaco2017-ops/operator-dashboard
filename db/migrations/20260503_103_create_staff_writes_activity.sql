-- Migration 103: create_staff RPC also writes user_created event into staff_activity.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_staff(
  p_email       text,
  p_password    text,
  p_role        text,
  p_first_name  text,
  p_last_name   text,
  p_alias       text,
  p_permissions text[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_new_id    integer;
  v_ref_code  text;
  v_perm      text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id USING errcode = '42501';
  END IF;

  IF p_role NOT IN ('admin','moderator','teamlead','operator') THEN
    RAISE EXCEPTION 'Invalid role for create_staff: %', p_role;
  END IF;

  v_ref_code := _next_ref_code(p_role, p_first_name, p_last_name);

  INSERT INTO dashboard_users (
    email, password_hash, role,
    first_name, last_name, alias, ref_code,
    created_by, permissions
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_role,
    p_first_name, p_last_name, p_alias, v_ref_code,
    v_caller_id,
    '{}'::jsonb
  )
  RETURNING id INTO v_new_id;

  IF p_permissions IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
        VALUES (v_new_id, v_perm, v_caller_id, now())
      ON CONFLICT (user_id, permission) DO NOTHING;
    END LOOP;
  END IF;

  -- NEW: log creation into staff_activity for notifications feed.
  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (
    v_new_id,
    v_caller_id,
    'user_created',
    jsonb_build_object(
      'role', p_role,
      'first_name', p_first_name,
      'last_name', p_last_name,
      'email', p_email
    )
  );

  RETURN v_new_id;
END;
$$;

COMMIT;
