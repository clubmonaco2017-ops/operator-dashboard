-- Migration 54: dashboard_users.agency_id + CHECK constraint
--
-- agency_id обязателен для operator/moderator/teamlead, NULL для admin/superadmin.
-- На момент применения этой миграции тестовые non-superadmin пользователи удалены
-- миграцией 53 (cleanup), поэтому пишем строгий CHECK сразу.

BEGIN;

ALTER TABLE dashboard_users
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_dashboard_users_agency
  ON dashboard_users(agency_id) WHERE agency_id IS NOT NULL;

-- CHECK constraint: agency_id обязателен для не-admin ролей
ALTER TABLE dashboard_users
  DROP CONSTRAINT IF EXISTS dashboard_users_agency_required;

ALTER TABLE dashboard_users
  ADD CONSTRAINT dashboard_users_agency_required
  CHECK (
    (role IN ('admin', 'superadmin') AND agency_id IS NULL)
    OR (role IN ('operator', 'moderator', 'teamlead') AND agency_id IS NOT NULL)
    OR (role = 'user')  -- legacy, без agency
  );

COMMIT;

-- VERIFY:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'dashboard_users' AND column_name = 'agency_id';
--   -- Expected: 1 row, data_type = uuid.
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'dashboard_users'::regclass AND conname = 'dashboard_users_agency_required';
--   -- Expected: 1 row.
--
-- ROLLBACK:
--   ALTER TABLE dashboard_users DROP CONSTRAINT dashboard_users_agency_required;
--   DROP INDEX idx_dashboard_users_agency;
--   ALTER TABLE dashboard_users DROP COLUMN agency_id;
