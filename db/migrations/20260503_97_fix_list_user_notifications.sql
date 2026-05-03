-- Migration 97: fix list_user_notifications.
-- 1) deletion_requests column is target_user (not target_user_id).
-- 2) CTE column aliased "id" conflicts with RETURNS TABLE OUT param "id" → rename to evt_*.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_user_notifications(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id            text,
  source        text,
  entity_id     integer,
  entity_label  text,
  actor_id      integer,
  actor_name    text,
  event_type    text,
  payload       jsonb,
  created_at    timestamptz,
  is_unseen     boolean
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_role       text;
  v_last_seen  timestamptz;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT du.role, du.last_visited_notifications_at
    INTO v_role, v_last_seen
    FROM dashboard_users du WHERE du.id = v_caller_id;

  RETURN QUERY
  WITH all_events AS (
    SELECT
      ('task_activity:' || ta.id)::text AS evt_id,
      'task_activity'::text             AS evt_source,
      ta.task_id                        AS evt_entity_id,
      t.title                           AS evt_entity_label,
      ta.actor_id                       AS evt_actor_id,
      (u.first_name || ' ' || COALESCE(u.last_name, ''))::text AS evt_actor_name,
      ta.event_type                     AS evt_event_type,
      ta.payload                        AS evt_payload,
      ta.created_at                     AS evt_created_at
    FROM task_activity ta
    JOIN tasks t                ON t.id = ta.task_id
    LEFT JOIN dashboard_users u ON u.id = ta.actor_id
    WHERE ta.actor_id IS DISTINCT FROM v_caller_id
      AND CASE
            WHEN v_role = 'superadmin' THEN true
            WHEN v_role = 'admin' THEN
              EXISTS (
                SELECT 1 FROM admin_agencies aa
                  JOIN dashboard_users a ON a.id = t.assigned_to
                 WHERE aa.admin_user_id = v_caller_id
                   AND aa.agency_id = a.agency_id)
            ELSE
              t.assigned_to = v_caller_id OR t.created_by = v_caller_id
          END

    UNION ALL

    SELECT
      ('team_activity:' || tma.id)::text,
      'team_activity'::text,
      tma.team_id,
      tm.name,
      tma.actor_id,
      (u.first_name || ' ' || COALESCE(u.last_name, ''))::text,
      tma.event_type,
      tma.payload,
      tma.created_at
    FROM team_activity tma
    JOIN teams tm               ON tm.id = tma.team_id
    LEFT JOIN dashboard_users u ON u.id = tma.actor_id
    WHERE tma.actor_id IS DISTINCT FROM v_caller_id
      AND CASE
            WHEN v_role = 'superadmin' THEN true
            WHEN v_role = 'admin' THEN
              tm.agency_id IN (SELECT agency_id FROM admin_agencies WHERE admin_user_id = v_caller_id)
            ELSE
              EXISTS (SELECT 1 FROM team_members mem WHERE mem.team_id = tm.id AND mem.user_id = v_caller_id)
          END

    UNION ALL

    SELECT
      ('deletion_request:' || dr.id)::text,
      'deletion_request'::text,
      dr.id,
      (du_target.first_name || ' ' || COALESCE(du_target.last_name, ''))::text,
      dr.requested_by,
      (du_actor.first_name || ' ' || COALESCE(du_actor.last_name, ''))::text,
      ('deletion_request_' || dr.status)::text,
      to_jsonb(dr),
      dr.created_at
    FROM deletion_requests dr
    JOIN dashboard_users du_target ON du_target.id = dr.target_user
    JOIN dashboard_users du_actor  ON du_actor.id  = dr.requested_by
    WHERE v_role = 'superadmin' AND dr.status = 'pending'
  )
  SELECT
    e.evt_id           AS id,
    e.evt_source       AS source,
    e.evt_entity_id    AS entity_id,
    e.evt_entity_label AS entity_label,
    e.evt_actor_id     AS actor_id,
    e.evt_actor_name   AS actor_name,
    e.evt_event_type   AS event_type,
    e.evt_payload      AS payload,
    e.evt_created_at   AS created_at,
    e.evt_created_at > COALESCE(v_last_seen, '1970-01-01'::timestamptz) AS is_unseen
  FROM all_events e
  ORDER BY e.evt_created_at DESC
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.list_user_notifications(integer) TO anon, authenticated;

COMMIT;
