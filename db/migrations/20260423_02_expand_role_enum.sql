-- Migration 02: Allow new role values on dashboard_users
-- Before: role text NOT NULL DEFAULT 'user' (no CHECK)
-- After:  role text NOT NULL DEFAULT 'user' with CHECK
--         role IN (superadmin, admin, moderator, teamlead, operator, user)
--
-- 'user' stays in the allowed set temporarily for backwards compatibility.
-- Migration 05 (backfill) converts all 'user' rows to 'operator', after
-- which 'user' can be dropped from the CHECK in a future migration.

BEGIN;

-- Drop any prior CHECK if present (safe no-op otherwise)
ALTER TABLE dashboard_users DROP CONSTRAINT IF EXISTS dashboard_users_role_check;

-- Add CHECK covering all valid role values
ALTER TABLE dashboard_users ADD CONSTRAINT dashboard_users_role_check
  CHECK (role IN ('superadmin','admin','moderator','teamlead','operator','user'));

COMMIT;

-- VERIFY:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'dashboard_users_role_check';
--   -- Expected: CHECK (role IN (...)) with all 6 values.
--
--   SELECT DISTINCT role FROM dashboard_users;
--   -- Expected: all existing role values are still valid.
--
-- ROLLBACK:
--   ALTER TABLE dashboard_users DROP CONSTRAINT dashboard_users_role_check;
