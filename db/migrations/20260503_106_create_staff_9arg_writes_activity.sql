-- Migration 106: fix staff_activity logging on the 9-arg create_staff overload.
--
-- Migration 63 introduced a 9-arg create_staff (added p_agency_id +
-- p_admin_agency_ids) and dropped the original 7-arg version. Migration 103
-- mistakenly added staff_activity logging to a re-created 7-arg overload that
-- the UI never calls — so user_created events were never recorded.
--
-- This migration:
--   1. Drops the orphan 7-arg overload from migration 103.
--   2. Replaces the 9-arg overload with the same body + INSERT INTO staff_activity.

BEGIN;

DROP FUNCTION IF EXISTS public.create_staff(text, text, text, text, text, text, text[]);

CREATE OR REPLACE FUNCTION public.create_staff(
  p_email             text,
  p_password          text,
  p_role              text,
  p_first_name        text,
  p_last_name         text,
  p_alias             text,
  p_permissions       text[],
  p_agency_id         uuid      DEFAULT NULL,
  p_admin_agency_ids  uuid[]    DEFAULT ARRAY[]::uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_new_id      integer;
  v_ref_code    text;
  v_perm        text;
  v_admin_agid  uuid;
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

  IF p_role IN ('moderator','teamlead','operator') THEN
    IF p_agency_id IS NULL THEN
      RAISE EXCEPTION 'agency_id is required for role %', p_role USING errcode = '23502';
    END IF;
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  ELSIF p_role = 'admin' THEN
    IF p_agency_id IS NOT NULL THEN
      RAISE EXCEPTION 'agency_id must be NULL for admin role; use p_admin_agency_ids'
        USING errcode = '23514';
    END IF;
    IF p_admin_agency_ids IS NOT NULL AND array_length(p_admin_agency_ids, 1) > 0 THEN
      FOREACH v_admin_agid IN ARRAY p_admin_agency_ids LOOP
        PERFORM assert_agency_access(v_caller_id, v_admin_agid);
      END LOOP;
    END IF;
  END IF;

  v_ref_code := _next_ref_code(p_role, p_first_name, p_last_name);

  INSERT INTO dashboard_users (
    email, password_hash, role,
    first_name, last_name, alias, ref_code,
    created_by, permissions, agency_id
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_role,
    p_first_name, p_last_name, p_alias, v_ref_code,
    v_caller_id,
    '{}'::jsonb,
    p_agency_id
  )
  RETURNING id INTO v_new_id;

  IF p_permissions IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
        VALUES (v_new_id, v_perm, v_caller_id, now())
      ON CONFLICT (user_id, permission) DO NOTHING;
    END LOOP;
  END IF;

  IF p_role = 'admin'
     AND p_admin_agency_ids IS NOT NULL
     AND array_length(p_admin_agency_ids, 1) > 0 THEN
    FOREACH v_admin_agid IN ARRAY p_admin_agency_ids LOOP
      INSERT INTO admin_agencies (admin_id, agency_id, assigned_by)
        VALUES (v_new_id, v_admin_agid, v_caller_id)
      ON CONFLICT (admin_id, agency_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Notifications feed: log creation into staff_activity.
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

REVOKE ALL ON FUNCTION public.create_staff(text, text, text, text, text, text, text[], uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff(text, text, text, text, text, text, text[], uuid, uuid[]) TO authenticated;

COMMIT;
