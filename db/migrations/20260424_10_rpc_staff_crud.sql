-- Migration 10: Staff CRUD RPC functions
--   create_staff           — create user + assign default permissions (atomic)
--   update_staff_profile   — edit first/last/alias/email
--   list_staff             — list with pre-joined permissions + attributes + pending flag
--   get_staff_detail       — single user with permissions + attributes + pending flag

BEGIN;

-- Helper: generate next ref_code for a given role
-- Reads MAX(ref_code numeric suffix) for the role, returns +1 padded to 3 digits.
CREATE OR REPLACE FUNCTION _next_ref_code(
  p_role text, p_first_name text, p_last_name text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_next   int;
  v_first  text;
  v_last   text;
BEGIN
  v_prefix := CASE p_role
    WHEN 'superadmin' THEN 'SA'
    WHEN 'admin'      THEN 'ADM'
    WHEN 'moderator'  THEN 'MOD'
    WHEN 'teamlead'   THEN 'TL'
    WHEN 'operator'   THEN 'OP'
    ELSE NULL
  END;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Unknown role: %', p_role;
  END IF;

  SELECT COALESCE(MAX(
    CASE
      WHEN ref_code ~ ('^' || v_prefix || '-.+-\d{3}$')
        THEN (regexp_replace(ref_code, '.*-(\d{3})$', '\1'))::int
      ELSE 0
    END
  ), 0) + 1
  INTO v_next
  FROM dashboard_users
  WHERE role = p_role;

  IF v_next > 999 THEN
    RAISE EXCEPTION 'Ref code number exceeded 999 for role %', p_role;
  END IF;

  v_first := upper(left(p_first_name, 1)) || lower(substring(p_first_name, 2));
  v_last  := upper(left(p_last_name, 1));

  RETURN v_prefix || '-' || v_first || v_last || '-' || lpad(v_next::text, 3, '0');
END $$;

-- create_staff: creates a new user row, generates ref_code, grants permissions.
-- Returns the new user's id.
CREATE OR REPLACE FUNCTION create_staff(
  p_caller_id integer,
  p_email text,
  p_password text,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_alias text,
  p_permissions text[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_new_id   integer;
  v_ref_code text;
  v_perm     text;
BEGIN
  IF NOT has_permission(p_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', p_caller_id;
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
    p_caller_id,
    '{}'::jsonb
  )
  RETURNING id INTO v_new_id;

  -- Grant each permission in the passed array
  IF p_permissions IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
        VALUES (v_new_id, v_perm, p_caller_id, now())
      ON CONFLICT (user_id, permission) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION create_staff(integer,text,text,text,text,text,text,text[])
  TO anon, authenticated;

-- update_staff_profile: edit first_name, last_name, alias, email.
-- Ref_code and role are NOT editable here.
CREATE OR REPLACE FUNCTION update_staff_profile(
  p_caller_id integer,
  p_user_id integer,
  p_first_name text,
  p_last_name text,
  p_alias text,
  p_email text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot edit user %', p_caller_id, p_user_id;
  END IF;

  UPDATE dashboard_users
  SET first_name = COALESCE(p_first_name, first_name),
      last_name  = COALESCE(p_last_name, last_name),
      alias      = p_alias,
      email      = COALESCE(p_email, email)
  WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION update_staff_profile(integer,integer,text,text,text,text)
  TO anon, authenticated;

-- list_staff: list with pre-joined permissions, attributes, and pending-deletion flag.
CREATE OR REPLACE FUNCTION list_staff(p_caller_id integer)
RETURNS TABLE (
  id          integer,
  ref_code    text,
  first_name  text,
  last_name   text,
  alias       text,
  email       text,
  role        text,
  is_active   boolean,
  tableau_id  text,
  created_at  timestamptz,
  permissions text[],
  attributes  jsonb,
  has_pending_deletion boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion
  FROM dashboard_users u
  WHERE has_permission(p_caller_id, 'create_users')
  ORDER BY u.role, u.ref_code;
$$;

GRANT EXECUTE ON FUNCTION list_staff(integer) TO anon, authenticated;

-- get_staff_detail: single row with same shape as list_staff.
CREATE OR REPLACE FUNCTION get_staff_detail(p_caller_id integer, p_user_id integer)
RETURNS TABLE (
  id          integer,
  ref_code    text,
  first_name  text,
  last_name   text,
  alias       text,
  email       text,
  role        text,
  is_active   boolean,
  tableau_id  text,
  created_at  timestamptz,
  permissions text[],
  attributes  jsonb,
  has_pending_deletion boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion
  FROM dashboard_users u
  WHERE u.id = p_user_id
    AND (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users'));
$$;

GRANT EXECUTE ON FUNCTION get_staff_detail(integer, integer) TO anon, authenticated;

-- change_staff_password: bcrypt-hash new password. Self or create_users gates.
CREATE OR REPLACE FUNCTION change_staff_password(
  p_caller_id integer, p_user_id integer, p_new_password text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot change password for %', p_caller_id, p_user_id;
  END IF;
  UPDATE dashboard_users
  SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION change_staff_password(integer, integer, text) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname FROM pg_proc
--     WHERE proname IN ('create_staff','update_staff_profile','list_staff','get_staff_detail','change_staff_password','_next_ref_code')
--     ORDER BY proname;
--   -- Expected: 6 rows.
--
-- ROLLBACK:
--   DROP FUNCTION create_staff(integer,text,text,text,text,text,text,text[]);
--   DROP FUNCTION update_staff_profile(integer,integer,text,text,text,text);
--   DROP FUNCTION list_staff(integer);
--   DROP FUNCTION get_staff_detail(integer,integer);
--   DROP FUNCTION change_staff_password(integer,integer,text);
--   DROP FUNCTION _next_ref_code(text,text,text);
