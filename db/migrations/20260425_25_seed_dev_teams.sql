-- Migration 25: dev seed — 2 teams + 1 curatorship (Subplan 4 Stage 4).
--
-- Idempotent PL/pgSQL DO block:
--   * Picks first available admin/teamlead/moderator/operators by role.
--   * Skips with NOTICE if not enough seed users.
--   * Skips with NOTICE if dev teams already exist (by name).
--   * Skips per-row inserts that would violate uniqueness (operator already in
--     a team / client already assigned / operator already curated).
--
-- Manual run only on dev/staging — no production guard at DB level.

BEGIN;

DO $$
DECLARE
  v_admin   integer;
  v_tl1     integer;
  v_mod1    integer;
  v_op1     integer;
  v_op2     integer;
  v_op3     integer;
  v_team1   integer;
  v_team2   integer;
  v_client1 integer;
  v_client2 integer;
BEGIN
  -- Pick seed users by role.
  SELECT id INTO v_admin
    FROM dashboard_users
    WHERE role IN ('admin', 'superadmin') AND is_active
    ORDER BY id LIMIT 1;
  SELECT id INTO v_tl1
    FROM dashboard_users
    WHERE role = 'teamlead' AND is_active
    ORDER BY id LIMIT 1;
  SELECT id INTO v_mod1
    FROM dashboard_users
    WHERE role = 'moderator' AND is_active
    ORDER BY id LIMIT 1;

  IF v_admin IS NULL OR v_tl1 IS NULL OR v_mod1 IS NULL THEN
    RAISE NOTICE 'Subplan 4 seed skipped: need >=1 admin, >=1 teamlead, >=1 moderator. Have admin=%, tl=%, mod=%',
      v_admin, v_tl1, v_mod1;
    RETURN;
  END IF;

  -- Pick up to 3 operators (ordered, each independently optional).
  SELECT id INTO v_op1 FROM dashboard_users
    WHERE role = 'operator' AND is_active ORDER BY id OFFSET 0 LIMIT 1;
  SELECT id INTO v_op2 FROM dashboard_users
    WHERE role = 'operator' AND is_active ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_op3 FROM dashboard_users
    WHERE role = 'operator' AND is_active ORDER BY id OFFSET 2 LIMIT 1;

  -- Pick up to 2 active clients.
  SELECT id INTO v_client1 FROM clients WHERE is_active ORDER BY id OFFSET 0 LIMIT 1;
  SELECT id INTO v_client2 FROM clients WHERE is_active ORDER BY id OFFSET 1 LIMIT 1;

  -- Skip if dev teams already exist.
  IF EXISTS (
    SELECT 1 FROM teams
    WHERE lower(name) IN ('команда a (день)', 'команда b (вечер)')
  ) THEN
    RAISE NOTICE 'Subplan 4 seed skipped: dev teams already exist';
    RETURN;
  END IF;

  -- Команда A — TL-led.
  INSERT INTO teams (name, lead_user_id, created_by)
    VALUES ('Команда A (день)', v_tl1, v_admin)
    RETURNING id INTO v_team1;

  IF v_op1 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM team_members WHERE operator_id = v_op1) THEN
    INSERT INTO team_members (team_id, operator_id, added_by)
      VALUES (v_team1, v_op1, v_admin);
  END IF;
  IF v_op2 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM team_members WHERE operator_id = v_op2) THEN
    INSERT INTO team_members (team_id, operator_id, added_by)
      VALUES (v_team1, v_op2, v_admin);
  END IF;

  IF v_client1 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM team_clients WHERE client_id = v_client1) THEN
    INSERT INTO team_clients (team_id, client_id, assigned_by)
      VALUES (v_team1, v_client1, v_admin);
  END IF;
  IF v_client2 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM team_clients WHERE client_id = v_client2) THEN
    INSERT INTO team_clients (team_id, client_id, assigned_by)
      VALUES (v_team1, v_client2, v_admin);
  END IF;

  -- Команда B — moderator-led.
  INSERT INTO teams (name, lead_user_id, created_by)
    VALUES ('Команда B (вечер)', v_mod1, v_admin)
    RETURNING id INTO v_team2;

  IF v_op3 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM team_members WHERE operator_id = v_op3) THEN
    INSERT INTO team_members (team_id, operator_id, added_by)
      VALUES (v_team2, v_op3, v_admin);
  END IF;

  -- Curatorship — moderator курирует op1 (orthogonal to team membership).
  IF v_op1 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM moderator_operators WHERE operator_id = v_op1) THEN
    INSERT INTO moderator_operators (moderator_id, operator_id, assigned_by)
      VALUES (v_mod1, v_op1, v_admin);
  END IF;

  RAISE NOTICE 'Subplan 4 seed: created team A (id=%) and team B (id=%)', v_team1, v_team2;
END $$;

COMMIT;

-- VERIFY:
--   SELECT id, name, lead_user_id, is_active FROM teams
--     WHERE name IN ('Команда A (день)', 'Команда B (вечер)') ORDER BY id;
--   SELECT team_id, operator_id FROM team_members
--     WHERE team_id IN (SELECT id FROM teams WHERE name IN ('Команда A (день)','Команда B (вечер)'));
--   SELECT team_id, client_id FROM team_clients
--     WHERE team_id IN (SELECT id FROM teams WHERE name IN ('Команда A (день)','Команда B (вечер)'));
--   SELECT moderator_id, operator_id FROM moderator_operators;
--
-- ROLLBACK:
--   DELETE FROM moderator_operators
--     WHERE moderator_id IN (SELECT lead_user_id FROM teams WHERE name IN ('Команда A (день)','Команда B (вечер)'));
--   DELETE FROM team_clients
--     WHERE team_id IN (SELECT id FROM teams WHERE name IN ('Команда A (день)','Команда B (вечер)'));
--   DELETE FROM team_members
--     WHERE team_id IN (SELECT id FROM teams WHERE name IN ('Команда A (день)','Команда B (вечер)'));
--   DELETE FROM team_activity
--     WHERE team_id IN (SELECT id FROM teams WHERE name IN ('Команда A (день)','Команда B (вечер)'));
--   DELETE FROM teams
--     WHERE name IN ('Команда A (день)', 'Команда B (вечер)');
