-- Subplan 5 Stage 2 — can_assign_task internal helper.
-- Decides whether p_caller_id can assign a task to p_target_user_id per D-2:
--   admin/superadmin → true (∀)
--   teamlead/moderator → other teamlead/moderator (cross-staff coordination)
--   teamlead → operators in team caller leads
--   moderator → operators caller curates
--   else → false
-- INTERNAL: NO GRANT EXECUTE — called only from other SECURITY DEFINER RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION can_assign_task(p_caller_id integer, p_target_user_id integer)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role
    FROM dashboard_users
   WHERE id = p_caller_id AND is_active = true;
  IF v_caller_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_target_role
    FROM dashboard_users
   WHERE id = p_target_user_id AND is_active = true;
  IF v_target_role IS NULL THEN
    RETURN false;
  END IF;

  -- Admin/superadmin → assign to anyone
  IF v_caller_role IN ('admin', 'superadmin') THEN
    RETURN true;
  END IF;

  -- TL/Moderator → other TL/moderator (cross-staff coordination)
  IF v_caller_role IN ('teamlead', 'moderator')
     AND v_target_role IN ('teamlead', 'moderator') THEN
    RETURN true;
  END IF;

  -- Teamlead → operators in team caller leads
  IF v_caller_role = 'teamlead' AND v_target_role = 'operator' THEN
    RETURN EXISTS (
      SELECT 1
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
       WHERE t.lead_user_id = p_caller_id
         AND t.is_active = true
         AND tm.operator_id = p_target_user_id
    );
  END IF;

  -- Moderator → curated operators
  IF v_caller_role = 'moderator' AND v_target_role = 'operator' THEN
    RETURN EXISTS (
      SELECT 1 FROM moderator_operators
       WHERE moderator_id = p_caller_id
         AND operator_id = p_target_user_id
    );
  END IF;

  RETURN false;
END;
$$;

-- INTENTIONAL: no GRANT EXECUTE. Called only from SECURITY DEFINER RPCs.

COMMIT;

-- VERIFY:
--   Smoke (на staging):
--     SELECT can_assign_task(<admin_id>, <any_user_id>);          -- true
--     SELECT can_assign_task(<tl_id>, <op_in_tl_team_id>);        -- true
--     SELECT can_assign_task(<tl_id>, <op_in_other_team_id>);     -- false
--     SELECT can_assign_task(<tl_id>, <other_tl_id>);             -- true
--     SELECT can_assign_task(<mod_id>, <curated_op_id>);          -- true
--     SELECT can_assign_task(<mod_id>, <not_curated_op_id>);      -- false
--     SELECT can_assign_task(<op_id>, <anyone_id>);               -- false
--
-- ROLLBACK:
--   DROP FUNCTION can_assign_task(integer, integer);
