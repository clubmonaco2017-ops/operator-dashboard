-- Migration 110: list_push_recipients — recipient + endpoint resolution per event.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_push_recipients(
  p_source text,
  p_row_id bigint
)
RETURNS TABLE (
  user_id  integer,
  endpoint text,
  p256dh   text,
  auth     text
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_id  integer;
  v_target_id integer;   -- staff_activity target
  v_task_row  tasks%ROWTYPE;
  v_team_id   integer;
BEGIN
  IF p_source = 'task_activity' THEN
    SELECT t.* INTO v_task_row
      FROM task_activity ta
      JOIN tasks t ON t.id = ta.task_id
     WHERE ta.id = p_row_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT actor_id INTO v_actor_id FROM task_activity WHERE id = p_row_id;

    RETURN QUERY
    SELECT DISTINCT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
     WHERE u.is_active
       AND u.id IS DISTINCT FROM v_actor_id
       AND (
            -- superadmin: all active users
            u.role = 'superadmin'
         OR -- admin: users from the agency that owns the assignee
            (u.role = 'admin' AND EXISTS (
              SELECT 1 FROM admin_agencies aa
                JOIN dashboard_users a ON a.id = v_task_row.assigned_to
               WHERE aa.admin_user_id = u.id
                 AND aa.agency_id = a.agency_id))
         OR -- everyone else: the assignee or creator personally
            (u.role IN ('lead', 'mod', 'operator')
             AND (u.id = v_task_row.assigned_to OR u.id = v_task_row.created_by))
       );

  ELSIF p_source = 'team_activity' THEN
    SELECT actor_id, team_id INTO v_actor_id, v_team_id
      FROM team_activity WHERE id = p_row_id;
    IF NOT FOUND THEN RETURN; END IF;

    RETURN QUERY
    SELECT DISTINCT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
      JOIN teams tm ON tm.id = v_team_id
     WHERE u.is_active
       AND u.id IS DISTINCT FROM v_actor_id
       AND (
            u.role = 'superadmin'
         OR (u.role = 'admin' AND tm.agency_id IN (
              SELECT agency_id FROM admin_agencies WHERE admin_user_id = u.id))
         OR (u.role IN ('lead', 'mod', 'operator') AND (
              EXISTS (SELECT 1 FROM team_members mem
                       WHERE mem.team_id = tm.id AND mem.user_id = u.id)))
       );

  ELSIF p_source = 'staff_activity' THEN
    SELECT actor_id, user_id INTO v_actor_id, v_target_id
      FROM staff_activity WHERE id = p_row_id;
    IF NOT FOUND THEN RETURN; END IF;

    RETURN QUERY
    SELECT DISTINCT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
     WHERE u.is_active
       AND u.id IS DISTINCT FROM v_actor_id
       AND (
            u.role = 'superadmin'
         OR (u.role = 'admin' AND EXISTS (
              SELECT 1 FROM admin_agencies aa
                JOIN dashboard_users target ON target.id = v_target_id
               WHERE aa.admin_user_id = u.id
                 AND aa.agency_id = target.agency_id))
         OR (u.role IN ('lead', 'mod', 'operator') AND u.id = v_target_id)
       );

  ELSIF p_source = 'deletion_requests' THEN
    RETURN QUERY
    SELECT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
     WHERE u.is_active AND u.role = 'superadmin';

  ELSE
    RAISE EXCEPTION 'unknown source: %', p_source;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.list_push_recipients(text, bigint)
  TO authenticated, service_role;

COMMIT;

-- VERIFY (run after a sample event row exists):
--   SELECT * FROM list_push_recipients('task_activity', (SELECT MAX(id) FROM task_activity));
--   SELECT * FROM list_push_recipients('deletion_requests', (SELECT MAX(id) FROM deletion_requests));
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.list_push_recipients(text, bigint);
