-- Migration 24: user-deactivation cascade + safety checks (Subplan 4 Stage 4)
--
-- Hooks new helper apply_user_archived_side_effects() into both deactivation
-- entry points: approve_deletion (superadmin approves a deletion request) and
-- deactivate_staff (superadmin/self direct deactivation).
--
-- Safety checks (helper raises → outer transaction aborts → user stays active):
--   B1. Лид активной команды         → блок «смените лида сначала».
--   B2. Модератор с куратурируемыми → блок «переназначьте кураторство сначала».
--
-- Cascade (after checks pass, before is_active = false):
--   C1. DELETE FROM team_members           WHERE operator_id  = user_id
--   C2. DELETE FROM moderator_operators    WHERE moderator_id = user_id
--   C3. DELETE FROM moderator_operators    WHERE operator_id  = user_id
--
-- Audit:
--   INSERT staff_activity (user_archived_with_cascade) с counts.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: apply_user_archived_side_effects
-- ---------------------------------------------------------------------------
-- No own permission gate — gate lives on callers (approve_deletion,
-- deactivate_staff). Helper trusted; locks user row to avoid races.
CREATE OR REPLACE FUNCTION apply_user_archived_side_effects(
  p_user_id  integer,
  p_actor_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_role     text;
  v_blocking_team text;
  v_n_members     integer;
  v_n_curated_of  integer;
  v_n_curated_by  integer;
BEGIN
  -- Lock target user row.
  SELECT role INTO v_user_role
    FROM dashboard_users
    WHERE id = p_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % not found', p_user_id;
  END IF;

  -- B1: блок при активной команде, где user — лид.
  SELECT name INTO v_blocking_team
    FROM teams
    WHERE lead_user_id = p_user_id
      AND is_active = true
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Нельзя архивировать: ведёт команду "%". Смените лида сначала.', v_blocking_team;
  END IF;

  -- B2: блок при курируемых операторах (только для модератора).
  IF v_user_role = 'moderator'
     AND EXISTS (SELECT 1 FROM moderator_operators WHERE moderator_id = p_user_id)
  THEN
    RAISE EXCEPTION 'Нельзя архивировать модератора с курируемыми операторами. Переназначьте кураторство сначала.';
  END IF;

  -- Cascade with row counts.
  WITH d_members AS (
    DELETE FROM team_members
      WHERE operator_id = p_user_id
      RETURNING 1
  ),
  d_curated_of AS (
    DELETE FROM moderator_operators
      WHERE moderator_id = p_user_id
      RETURNING 1
  ),
  d_curated_by AS (
    DELETE FROM moderator_operators
      WHERE operator_id = p_user_id
      RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM d_members),
    (SELECT count(*) FROM d_curated_of),
    (SELECT count(*) FROM d_curated_by)
  INTO v_n_members, v_n_curated_of, v_n_curated_by;

  -- Audit.
  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (
    p_user_id,
    p_actor_id,
    'user_archived_with_cascade',
    jsonb_build_object(
      'user_role', v_user_role,
      'removed_team_memberships',          v_n_members,
      'removed_curatorships_as_moderator', v_n_curated_of,
      'removed_curatorships_as_operator',  v_n_curated_by
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION apply_user_archived_side_effects(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace approve_deletion: same body + PERFORM cascade before deactivation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_deletion(
  p_caller_id integer, p_request_id integer, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can approve deletion';
  END IF;
  UPDATE deletion_requests
  SET status = 'approved',
      reviewed_by = p_caller_id,
      review_note = p_note,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending'
  RETURNING target_user INTO v_target;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'request % not found or not pending', p_request_id;
  END IF;
  PERFORM apply_user_archived_side_effects(v_target, p_caller_id);
  UPDATE dashboard_users SET is_active = false WHERE id = v_target;
END $$;

GRANT EXECUTE ON FUNCTION approve_deletion(integer, integer, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace deactivate_staff: same body + PERFORM cascade before deactivation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deactivate_staff(p_caller_id integer, p_user_id integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    p_caller_id = p_user_id
    OR EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin')
  ) THEN
    RAISE EXCEPTION 'only superadmin or self can deactivate';
  END IF;
  PERFORM apply_user_archived_side_effects(p_user_id, p_caller_id);
  UPDATE dashboard_users SET is_active = false WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION deactivate_staff(integer, integer) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname FROM pg_proc
--     WHERE proname IN ('apply_user_archived_side_effects','approve_deletion','deactivate_staff')
--     ORDER BY proname;
--   -- Expected: 3 rows.
--
--   -- Block path: try to archive a user leading an active team → should raise.
--   -- Block path: try to archive a moderator with curated operators → should raise.
--   -- Cascade path: archive a plain operator who is in a team → row removed from
--   --   team_members; staff_activity row inserted with non-zero count.
--
-- ROLLBACK:
--   -- Restore approve_deletion + deactivate_staff from migration 11, then:
--   DROP FUNCTION apply_user_archived_side_effects(integer, integer);
