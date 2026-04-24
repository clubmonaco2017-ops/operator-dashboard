-- Migration 05: Backfill existing dashboard_users with new CRM fields
-- Run ONCE. Idempotent where possible.
--
-- Actions:
--   1. Convert role 'user' → 'operator'.
--   2. Derive first_name / last_name from email (placeholder; editable later).
--   3. Generate ref_code per user (numbered by role).
--   4. Convert legacy permissions jsonb → rows in user_permissions.
--   5. Grant default permissions per role.

BEGIN;

-- 5.1) role: 'user' → 'operator'
UPDATE dashboard_users
SET role = 'operator'
WHERE role = 'user';

-- 5.2) first_name / last_name from email (part before @, split by .)
UPDATE dashboard_users
SET first_name = COALESCE(first_name, split_part(split_part(email, '@', 1), '.', 1)),
    last_name  = COALESCE(last_name,  split_part(split_part(email, '@', 1), '.', 2))
WHERE first_name IS NULL OR last_name IS NULL;

-- Handle empty last_name / first_name so ref_code can be generated
UPDATE dashboard_users
SET last_name = 'X'
WHERE last_name IS NULL OR last_name = '';

UPDATE dashboard_users
SET first_name = 'User'
WHERE first_name IS NULL OR first_name = '';

-- 5.3) Generate ref_code
CREATE OR REPLACE FUNCTION _backfill_ref_code(
  p_role text, p_first_name text, p_last_name text, p_num int
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix text;
  v_first  text;
  v_last   text;
BEGIN
  v_prefix := CASE p_role
    WHEN 'superadmin' THEN 'SA'
    WHEN 'admin'      THEN 'ADM'
    WHEN 'moderator'  THEN 'MOD'
    WHEN 'teamlead'   THEN 'TL'
    WHEN 'operator'   THEN 'OP'
    ELSE 'USR'
  END;
  v_first := upper(left(p_first_name, 1)) || lower(substring(p_first_name, 2));
  v_last  := upper(left(p_last_name, 1));
  RETURN v_prefix || '-' || v_first || v_last || '-' || lpad(p_num::text, 3, '0');
END $$;

WITH numbered AS (
  SELECT id, role, first_name, last_name,
         row_number() OVER (PARTITION BY role ORDER BY created_at, id) AS rn
  FROM dashboard_users
  WHERE ref_code IS NULL
)
UPDATE dashboard_users u
SET ref_code = _backfill_ref_code(n.role, n.first_name, n.last_name, n.rn::int)
FROM numbered n
WHERE u.id = n.id;

DROP FUNCTION _backfill_ref_code(text, text, text, int);

-- 5.4) Legacy permissions (jsonb) → user_permissions rows
INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, 'view_all_revenue', NULL, now()
  FROM dashboard_users u
  WHERE (u.permissions ->> 'can_view_revenue')::boolean IS TRUE
  ON CONFLICT (user_id, permission) DO NOTHING;

INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, 'view_chart', NULL, now()
  FROM dashboard_users u
  WHERE (u.permissions ->> 'can_view_chart')::boolean IS TRUE
  ON CONFLICT (user_id, permission) DO NOTHING;

INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, 'view_top', NULL, now()
  FROM dashboard_users u
  WHERE (u.permissions ->> 'can_view_top')::boolean IS TRUE
  ON CONFLICT (user_id, permission) DO NOTHING;

-- 5.5) Default permissions by role
INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, p.perm, NULL, now()
FROM dashboard_users u
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE u.role
      WHEN 'superadmin' THEN ARRAY[
        'create_users','manage_roles','create_tasks','view_all_tasks',
        'view_all_revenue','send_reminders','manage_teams','use_chat'
      ]
      WHEN 'admin' THEN ARRAY[
        'create_tasks','view_all_tasks','view_all_revenue',
        'send_reminders','manage_teams'
      ]
      WHEN 'operator' THEN ARRAY['view_own_revenue','view_own_tasks']
      ELSE ARRAY[]::text[]
    END
  ) AS perm
) p
ON CONFLICT (user_id, permission) DO NOTHING;

COMMIT;

-- VERIFY:
--   -- Все пользователи имеют ref_code?
--   SELECT count(*) FROM dashboard_users WHERE ref_code IS NULL;
--   -- Expected: 0
--
--   -- Распределение прав по ролям
--   SELECT u.role, up.permission, count(*)
--   FROM dashboard_users u
--   JOIN user_permissions up ON up.user_id = u.id
--   GROUP BY u.role, up.permission
--   ORDER BY u.role, up.permission;
--
--   -- Никаких старых ролей user?
--   SELECT DISTINCT role FROM dashboard_users;
--
-- ROLLBACK: this migration is not easily reversible. To undo:
--   1. UPDATE dashboard_users SET role = 'user' WHERE role = 'operator';
--   2. UPDATE dashboard_users SET ref_code = NULL, first_name = NULL, last_name = NULL;
--   3. TRUNCATE user_permissions;
--   (Original permissions jsonb is preserved, so old frontend keeps working.)
