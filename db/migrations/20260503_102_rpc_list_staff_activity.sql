-- Migration 102: list_staff_activity(p_user_id, p_limit) — events from staff_activity table.
-- Permission: superadmin/admin always; otherwise caller can only view own activity.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_staff_activity(
  p_user_id integer,
  p_limit   integer DEFAULT 50
)
RETURNS TABLE (
  id          integer,
  actor_id    integer,
  actor_name  text,
  event_type  text,
  payload     jsonb,
  created_at  timestamptz
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_role       text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT du.role INTO v_role FROM dashboard_users du WHERE du.id = v_caller_id;

  IF v_role NOT IN ('admin', 'superadmin') AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sa.id,
    sa.actor_id,
    (u.first_name || ' ' || COALESCE(u.last_name, ''))::text AS actor_name,
    sa.event_type,
    sa.payload,
    sa.created_at
  FROM staff_activity sa
  LEFT JOIN dashboard_users u ON u.id = sa.actor_id
  WHERE sa.user_id = p_user_id
  ORDER BY sa.created_at DESC
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.list_staff_activity(integer, integer) TO anon, authenticated;

COMMIT;
