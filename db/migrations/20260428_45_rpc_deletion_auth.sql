-- Migration 45: Stage 11 — Migrate deletion workflow bucket to current_dashboard_user_id()
--
-- Migrated RPCs (5): drop p_caller_id from signature, derive via current_dashboard_user_id()
--   request_deletion, approve_deletion, reject_deletion,
--   list_deletion_requests, count_pending_deletions
--
-- Audit columns (requested_by, reviewed_by) preserved: use v_caller_id.
-- All migrated RPCs: REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated.
-- Permission-fail RAISEs use USING errcode = '42501'.
--
-- Source migration: 20260424_11_rpc_deletion_workflow.sql

BEGIN;

-- ============================================================
-- 1. request_deletion
--    Original signature: (p_caller_id integer, p_target_user integer, p_reason text)
--    New signature:      (p_target_user integer, p_reason text)
--    Permission gate:    create_users
--    Audit column:       requested_by ← v_caller_id
-- ============================================================

DROP FUNCTION IF EXISTS public.request_deletion(integer, integer, text);

CREATE OR REPLACE FUNCTION public.request_deletion(
  p_target_user integer,
  p_reason      text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_request_id integer;
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

-- ============================================================
-- 2. approve_deletion
--    Original signature: (p_caller_id integer, p_request_id integer, p_note text)
--    New signature:      (p_request_id integer, p_note text)
--    Permission gate:    caller is superadmin
--    Audit column:       reviewed_by ← v_caller_id
-- ============================================================

DROP FUNCTION IF EXISTS public.approve_deletion(integer, integer, text);

CREATE OR REPLACE FUNCTION public.approve_deletion(
  p_request_id integer,
  p_note       text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_target    integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can approve deletion' USING errcode = '42501';
  END IF;

  UPDATE deletion_requests
  SET status      = 'approved',
      reviewed_by = v_caller_id,
      review_note = p_note,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending'
  RETURNING target_user INTO v_target;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'request % not found or not pending', p_request_id;
  END IF;

  UPDATE dashboard_users SET is_active = false WHERE id = v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_deletion(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_deletion(integer, text) TO authenticated;

-- ============================================================
-- 3. reject_deletion
--    Original signature: (p_caller_id integer, p_request_id integer, p_note text)
--    New signature:      (p_request_id integer, p_note text)
--    Permission gate:    caller is superadmin
--    Audit column:       reviewed_by ← v_caller_id
-- ============================================================

DROP FUNCTION IF EXISTS public.reject_deletion(integer, integer, text);

CREATE OR REPLACE FUNCTION public.reject_deletion(
  p_request_id integer,
  p_note       text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can reject deletion' USING errcode = '42501';
  END IF;

  UPDATE deletion_requests
  SET status      = 'rejected',
      reviewed_by = v_caller_id,
      review_note = p_note,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_deletion(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_deletion(integer, text) TO authenticated;

-- ============================================================
-- 4. list_deletion_requests
--    Original signature: (p_caller_id integer, p_status text DEFAULT 'pending')
--    New signature:      (p_status text DEFAULT 'pending')
--    Permission gate:    caller is superadmin
-- ============================================================

DROP FUNCTION IF EXISTS public.list_deletion_requests(integer, text);

CREATE OR REPLACE FUNCTION public.list_deletion_requests(
  p_status text DEFAULT 'pending'
) RETURNS TABLE (
  id                    integer,
  target_user           integer,
  target_ref_code       text,
  target_full_name      text,
  target_email          text,
  target_role           text,
  requested_by          integer,
  requested_by_ref_code text,
  requested_by_full_name text,
  reason                text,
  status                text,
  reviewed_by           integer,
  review_note           text,
  created_at            timestamptz,
  reviewed_at           timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can list deletion requests' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    dr.id, dr.target_user, tu.ref_code, (tu.first_name || ' ' || tu.last_name),
    tu.email, tu.role,
    dr.requested_by, ru.ref_code, (ru.first_name || ' ' || ru.last_name),
    dr.reason, dr.status, dr.reviewed_by, dr.review_note,
    dr.created_at, dr.reviewed_at
  FROM deletion_requests dr
  JOIN dashboard_users tu ON tu.id = dr.target_user
  JOIN dashboard_users ru ON ru.id = dr.requested_by
  WHERE (p_status IS NULL OR dr.status = p_status)
  ORDER BY dr.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_deletion_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_deletion_requests(text) TO authenticated;

-- ============================================================
-- 5. count_pending_deletions
--    Original signature: (p_caller_id integer)
--    New signature:      ()
--    Permission gate:    caller is superadmin (returns 0 if not)
-- ============================================================

DROP FUNCTION IF EXISTS public.count_pending_deletions(integer);

CREATE OR REPLACE FUNCTION public.count_pending_deletions()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin') THEN
    RETURN 0;
  END IF;

  RETURN COALESCE(
    (SELECT count(*)::integer FROM deletion_requests WHERE status = 'pending'),
    0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_pending_deletions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_pending_deletions() TO authenticated;

-- ============================================================
-- Cross-cutting: apply_user_archived_side_effects
-- ============================================================
-- This internal PL/pgSQL helper is called from approve_deletion (above)
-- and deactivate_staff (Stage 10 / migration 44).  It was granted
-- TO anon, authenticated in migration 24.  Revoke anon now and
-- re-grant explicitly to authenticated (defence-in-depth — the
-- function has no intrinsic permission gate, relies on its callers).
REVOKE ALL ON FUNCTION public.apply_user_archived_side_effects(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_user_archived_side_effects(integer, integer) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--     WHERE proname IN (
--       'request_deletion','approve_deletion','reject_deletion',
--       'list_deletion_requests','count_pending_deletions'
--     )
--     ORDER BY proname;
--   -- Expected: 5 rows, none with p_caller_id in their argument list.
--
--   -- Confirm anon has no EXECUTE on the migrated functions:
--   SELECT has_function_privilege('anon', 'public.count_pending_deletions()', 'EXECUTE');
--   -- Expected: false
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.count_pending_deletions();
--   DROP FUNCTION IF EXISTS public.list_deletion_requests(text);
--   DROP FUNCTION IF EXISTS public.reject_deletion(integer, text);
--   DROP FUNCTION IF EXISTS public.approve_deletion(integer, text);
--   DROP FUNCTION IF EXISTS public.request_deletion(integer, text);
--   -- Then restore originals from migration 20260424_11_rpc_deletion_workflow.sql.
