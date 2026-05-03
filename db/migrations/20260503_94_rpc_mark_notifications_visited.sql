-- Migration 94: mark_notifications_visited — UPDATE last_visited timestamp.

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_notifications_visited()
RETURNS timestamptz
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_now        timestamptz;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  UPDATE dashboard_users
     SET last_visited_notifications_at = now()
   WHERE id = v_caller_id
   RETURNING last_visited_notifications_at INTO v_now;

  RETURN v_now;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_visited() TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT mark_notifications_visited();
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.mark_notifications_visited();
