-- Migration 11: deletion workflow and deactivate RPCs
--   request_deletion       — admin creates a pending deletion request
--   approve_deletion       — superadmin: approves → deactivates target
--   reject_deletion        — superadmin: rejects → leaves target active
--   list_deletion_requests — superadmin only, filter by status
--   deactivate_staff       — superadmin direct deactivation

BEGIN;

CREATE OR REPLACE FUNCTION request_deletion(
  p_caller_id integer, p_target_user integer, p_reason text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id integer;
BEGIN
  IF NOT has_permission(p_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', p_caller_id;
  END IF;
  IF p_target_user = p_caller_id THEN
    RAISE EXCEPTION 'cannot request deletion of self';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason must be at least 20 characters';
  END IF;
  IF EXISTS (
    SELECT 1 FROM deletion_requests
    WHERE target_user = p_target_user AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'pending deletion request already exists for user %', p_target_user;
  END IF;
  INSERT INTO deletion_requests (target_user, requested_by, reason, status)
    VALUES (p_target_user, p_caller_id, p_reason, 'pending')
    RETURNING id INTO v_request_id;
  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION request_deletion(integer, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION approve_deletion(
  p_caller_id integer, p_request_id integer, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can approve deletion';
  END IF;
  UPDATE deletion_requests
  SET status = 'approved',
      reviewed_by = p_caller_id,
      review_note = p_note,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending'
  RETURNING target_user INTO v_target;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'request % not found or not pending', p_request_id;
  END IF;
  UPDATE dashboard_users SET is_active = false WHERE id = v_target;
END $$;

GRANT EXECUTE ON FUNCTION approve_deletion(integer, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION reject_deletion(
  p_caller_id integer, p_request_id integer, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can reject deletion';
  END IF;
  UPDATE deletion_requests
  SET status = 'rejected',
      reviewed_by = p_caller_id,
      review_note = p_note,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';
END $$;

GRANT EXECUTE ON FUNCTION reject_deletion(integer, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_deletion_requests(
  p_caller_id integer, p_status text DEFAULT 'pending'
) RETURNS TABLE (
  id integer,
  target_user integer,
  target_ref_code text,
  target_full_name text,
  target_email text,
  target_role text,
  requested_by integer,
  requested_by_ref_code text,
  requested_by_full_name text,
  reason text,
  status text,
  reviewed_by integer,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.id, dr.target_user, tu.ref_code, (tu.first_name || ' ' || tu.last_name),
    tu.email, tu.role,
    dr.requested_by, ru.ref_code, (ru.first_name || ' ' || ru.last_name),
    dr.reason, dr.status, dr.reviewed_by, dr.review_note,
    dr.created_at, dr.reviewed_at
  FROM deletion_requests dr
  JOIN dashboard_users tu ON tu.id = dr.target_user
  JOIN dashboard_users ru ON ru.id = dr.requested_by
  WHERE EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin')
    AND (p_status IS NULL OR dr.status = p_status)
  ORDER BY dr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_deletion_requests(integer, text) TO anon, authenticated;

-- Count-only helper for sidebar badge
CREATE OR REPLACE FUNCTION count_pending_deletions(p_caller_id integer)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*)::integer, 0)
  FROM deletion_requests
  WHERE status = 'pending'
    AND EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin');
$$;

GRANT EXECUTE ON FUNCTION count_pending_deletions(integer) TO anon, authenticated;

-- Direct deactivation (for superadmin)
CREATE OR REPLACE FUNCTION deactivate_staff(p_caller_id integer, p_user_id integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    p_caller_id = p_user_id
    OR EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin')
  ) THEN
    RAISE EXCEPTION 'only superadmin or self can deactivate';
  END IF;
  UPDATE dashboard_users SET is_active = false WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION deactivate_staff(integer, integer) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname FROM pg_proc
--     WHERE proname IN ('request_deletion','approve_deletion','reject_deletion',
--                       'list_deletion_requests','count_pending_deletions','deactivate_staff')
--     ORDER BY proname;
--   -- Expected: 6 rows.
--
-- ROLLBACK:
--   DROP FUNCTION request_deletion(integer,integer,text);
--   DROP FUNCTION approve_deletion(integer,integer,text);
--   DROP FUNCTION reject_deletion(integer,integer,text);
--   DROP FUNCTION list_deletion_requests(integer,text);
--   DROP FUNCTION count_pending_deletions(integer);
--   DROP FUNCTION deactivate_staff(integer,integer);
