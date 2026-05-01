-- Migration 77: request_deletion — agency scoping (P1 fix from review)
--
-- Раньше: любой admin с create_users мог запросить удаление любого пользователя,
-- включая admin'ов чужих агентств / superadmin'а. Approve остаётся за superadmin,
-- но создание спам-запросов и flow утечки опасны.
--
-- Фикс:
--   - target operator/moderator/teamlead → assert_agency_access(caller, target.agency)
--   - target admin/superadmin → требовать caller=superadmin

CREATE OR REPLACE FUNCTION public.request_deletion(
  p_target_user integer,
  p_reason      text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_request_id  integer;
  v_target_role text;
  v_target_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id USING errcode = '42501';
  END IF;

  IF p_target_user = v_caller_id THEN
    RAISE EXCEPTION 'cannot request deletion of self';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason must be at least 20 characters';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role, u.agency_id INTO v_target_role, v_target_agency
    FROM dashboard_users u WHERE u.id = p_target_user;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'target user % not found', p_target_user USING errcode = 'P0002';
  END IF;

  -- Scope rules:
  --   target = admin/superadmin → only superadmin caller
  --   target = operator/moderator/teamlead → caller must have agency access
  IF v_target_role IN ('admin','superadmin') THEN
    IF v_caller_role <> 'superadmin' THEN
      RAISE EXCEPTION 'only superadmin can request deletion of admin/superadmin' USING errcode = '42501';
    END IF;
  ELSIF v_target_role IN ('operator','moderator','teamlead') THEN
    PERFORM assert_agency_access(v_caller_id, v_target_agency);
  END IF;

  IF EXISTS (
    SELECT 1 FROM deletion_requests
    WHERE target_user = p_target_user AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'pending deletion request already exists for user %', p_target_user;
  END IF;

  INSERT INTO deletion_requests (target_user, requested_by, reason, status)
    VALUES (p_target_user, v_caller_id, p_reason, 'pending')
    RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_deletion(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_deletion(integer, text) TO authenticated;
