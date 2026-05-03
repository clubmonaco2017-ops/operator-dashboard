-- Migration 107: list_staff_activity returns events where user_id = X OR actor_id = X.
-- Also returns target_name (full name of the user the event is about) so the formatter
-- can render «{actor} → действие → {target}» symmetrically regardless of perspective.
--
-- Signature change (added 2 columns target_id, target_name) → DROP+CREATE.

BEGIN;

DROP FUNCTION IF EXISTS public.list_staff_activity(integer, integer);

CREATE OR REPLACE FUNCTION public.list_staff_activity(
  p_user_id integer,
  p_limit   integer DEFAULT 50
)
RETURNS TABLE (
  id           integer,
  actor_id     integer,
  actor_name   text,
  target_id    integer,
  target_name  text,
  event_type   text,
  payload      jsonb,
  created_at   timestamptz
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
    (au.first_name || ' ' || COALESCE(au.last_name, ''))::text AS actor_name,
    sa.user_id AS target_id,
    (tu.first_name || ' ' || COALESCE(tu.last_name, ''))::text AS target_name,
    sa.event_type,
    sa.payload,
    sa.created_at
  FROM staff_activity sa
  LEFT JOIN dashboard_users au ON au.id = sa.actor_id
  JOIN dashboard_users tu       ON tu.id = sa.user_id
  WHERE sa.user_id = p_user_id OR sa.actor_id = p_user_id
  ORDER BY sa.created_at DESC
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.list_staff_activity(integer, integer) TO anon, authenticated;

COMMIT;
