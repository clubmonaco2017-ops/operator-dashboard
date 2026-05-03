-- Migration 98: defensive update of count_user_notifications_unseen.
-- Original migration 93 didn't reference deletion_requests.target_user (count
-- branch only filters by status), so no real bug — but qualify dashboard_users
-- columns in the SELECT INTO for symmetry with migration 97.

BEGIN;

CREATE OR REPLACE FUNCTION public.count_user_notifications_unseen()
RETURNS integer
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_role       text;
  v_last_seen  timestamptz;
  v_count      integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT du.role, COALESCE(du.last_visited_notifications_at, '1970-01-01'::timestamptz)
    INTO v_role, v_last_seen
    FROM dashboard_users du WHERE du.id = v_caller_id;

  SELECT COUNT(*)::integer INTO v_count FROM (
    SELECT 1 FROM task_activity ta
      JOIN tasks t ON t.id = ta.task_id
     WHERE ta.created_at > v_last_seen
       AND ta.actor_id IS DISTINCT FROM v_caller_id
       AND CASE
             WHEN v_role = 'superadmin' THEN true
             WHEN v_role = 'admin' THEN
               EXISTS (SELECT 1 FROM admin_agencies aa
                        JOIN dashboard_users a ON a.id = t.assigned_to
                       WHERE aa.admin_user_id = v_caller_id AND aa.agency_id = a.agency_id)
             ELSE t.assigned_to = v_caller_id OR t.created_by = v_caller_id
           END
    UNION ALL
    SELECT 1 FROM team_activity tma
      JOIN teams tm ON tm.id = tma.team_id
     WHERE tma.created_at > v_last_seen
       AND tma.actor_id IS DISTINCT FROM v_caller_id
       AND CASE
             WHEN v_role = 'superadmin' THEN true
             WHEN v_role = 'admin' THEN
               tm.agency_id IN (SELECT agency_id FROM admin_agencies WHERE admin_user_id = v_caller_id)
             ELSE EXISTS (SELECT 1 FROM team_members mem WHERE mem.team_id = tm.id AND mem.user_id = v_caller_id)
           END
    UNION ALL
    SELECT 1 FROM deletion_requests dr
     WHERE v_role = 'superadmin' AND dr.status = 'pending' AND dr.created_at > v_last_seen
  ) s;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.count_user_notifications_unseen() TO anon, authenticated;

COMMIT;
