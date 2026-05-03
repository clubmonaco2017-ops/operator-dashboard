-- Migration 112: get_push_event_data — single row of base fields used by /api/push/dispatch
-- to render title/body/url. Returns the same shape that list_user_notifications produces
-- for a single source/row, minus is_unseen (push has no per-user unseen state at send time).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_push_event_data(
  p_source text,
  p_row_id bigint
)
RETURNS TABLE (
  source        text,
  entity_id     integer,
  entity_label  text,
  actor_id      integer,
  actor_name    text,
  event_type    text,
  payload       jsonb,
  created_at    timestamptz
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_source = 'task_activity' THEN
    RETURN QUERY
    SELECT 'task_activity'::text, ta.task_id, t.title, ta.actor_id,
           (u.first_name || ' ' || COALESCE(u.last_name, ''))::text,
           ta.event_type, ta.payload, ta.created_at
      FROM task_activity ta
      JOIN tasks t                ON t.id = ta.task_id
      LEFT JOIN dashboard_users u ON u.id = ta.actor_id
     WHERE ta.id = p_row_id;

  ELSIF p_source = 'team_activity' THEN
    RETURN QUERY
    SELECT 'team_activity'::text, tma.team_id, tm.name, tma.actor_id,
           (u.first_name || ' ' || COALESCE(u.last_name, ''))::text,
           tma.event_type, tma.payload, tma.created_at
      FROM team_activity tma
      JOIN teams tm               ON tm.id = tma.team_id
      LEFT JOIN dashboard_users u ON u.id = tma.actor_id
     WHERE tma.id = p_row_id;

  ELSIF p_source = 'staff_activity' THEN
    RETURN QUERY
    SELECT 'staff_activity'::text, sa.user_id,
           (du_target.first_name || ' ' || COALESCE(du_target.last_name, ''))::text,
           sa.actor_id,
           (du_actor.first_name || ' ' || COALESCE(du_actor.last_name, ''))::text,
           sa.event_type, sa.payload, sa.created_at
      FROM staff_activity sa
      JOIN dashboard_users du_target ON du_target.id = sa.user_id
      LEFT JOIN dashboard_users du_actor ON du_actor.id = sa.actor_id
     WHERE sa.id = p_row_id;

  ELSIF p_source = 'deletion_requests' THEN
    RETURN QUERY
    SELECT 'deletion_request'::text, dr.id,
           (du_target.first_name || ' ' || COALESCE(du_target.last_name, ''))::text,
           dr.requested_by,
           (du_actor.first_name || ' ' || COALESCE(du_actor.last_name, ''))::text,
           ('deletion_request_' || dr.status)::text,
           to_jsonb(dr),
           dr.created_at
      FROM deletion_requests dr
      JOIN dashboard_users du_target ON du_target.id = dr.target_user_id
      JOIN dashboard_users du_actor  ON du_actor.id  = dr.requested_by
     WHERE dr.id = p_row_id;

  ELSE
    RAISE EXCEPTION 'unknown source: %', p_source;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.get_push_event_data(text, bigint)
  TO authenticated, service_role;

COMMIT;

-- VERIFY:
--   SELECT * FROM get_push_event_data('task_activity', (SELECT MAX(id) FROM task_activity));
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_push_event_data(text, bigint);
