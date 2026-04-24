-- Migration 01: Extend dashboard_users table with CRM fields
-- Adds: ref_code, first_name, last_name, alias, tableau_id, created_by
-- Backwards compatible: all new columns are nullable
--
-- Note: the app's user table is named `dashboard_users` (not `users` —
-- that's Supabase Auth's built-in table which we don't use).

BEGIN;

ALTER TABLE dashboard_users
  ADD COLUMN IF NOT EXISTS ref_code     text UNIQUE,
  ADD COLUMN IF NOT EXISTS first_name   text,
  ADD COLUMN IF NOT EXISTS last_name    text,
  ADD COLUMN IF NOT EXISTS alias        text,
  ADD COLUMN IF NOT EXISTS tableau_id   text,
  ADD COLUMN IF NOT EXISTS created_by   integer REFERENCES dashboard_users(id);

CREATE INDEX IF NOT EXISTS idx_dashboard_users_ref_code    ON dashboard_users(ref_code);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_tableau_id  ON dashboard_users(tableau_id);

COMMIT;

-- VERIFY:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'dashboard_users'
--   ORDER BY ordinal_position;
--
-- ROLLBACK:
--   ALTER TABLE dashboard_users
--     DROP COLUMN ref_code, DROP COLUMN first_name, DROP COLUMN last_name,
--     DROP COLUMN alias, DROP COLUMN tableau_id, DROP COLUMN created_by;
