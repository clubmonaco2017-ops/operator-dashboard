-- Migration 03: Create user_permissions table
-- Granular permission flags, independent from role.
-- FK user_id is integer to match dashboard_users.id type.

BEGIN;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  permission  text NOT NULL,
  granted_by  integer REFERENCES dashboard_users(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id
  ON user_permissions(user_id);

-- RLS: direct access blocked; reads/writes go through SECURITY DEFINER RPC
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_permissions IS
  'Valid permissions (CRM spec):
     create_users, manage_roles, create_tasks, view_all_tasks,
     view_own_tasks, view_all_revenue, view_own_revenue, view_team_revenue,
     send_reminders, manage_teams, use_chat
   Legacy permissions (preserved during migration from old permissions jsonb):
     view_chart, view_top';

COMMIT;

-- VERIFY:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public' AND table_name='user_permissions';
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--     WHERE table_name='user_permissions' ORDER BY ordinal_position;
--   -- Expected: 4 columns: user_id integer, permission text, granted_by integer, granted_at timestamptz.
--
-- ROLLBACK:
--   DROP TABLE user_permissions;
