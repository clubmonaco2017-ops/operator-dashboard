-- Migration 82: restore_agency RPC — обратная операция к archive_agency
-- Reason: Switch toggle в detail panel должен работать в обе стороны (archive ↔ restore).

BEGIN;

CREATE OR REPLACE FUNCTION public.restore_agency(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can restore agencies' USING errcode = '42501';
  END IF;

  UPDATE agencies SET is_active = true WHERE id = p_agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agency % not found', p_agency_id USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_agency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_agency(uuid) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT restore_agency('<some archived agency uuid>');
--   SELECT is_active FROM agencies WHERE id = '<that uuid>';  -- expected: true
--
-- ROLLBACK:
--   DROP FUNCTION public.restore_agency(uuid);
