-- Migration 13: New permissions for Subplan 3 (Clients) and Subplan 4 (Teams)
--   manage_clients       — CRUD клиентов (create_client, update_client, archive_client, etc.)
--   assign_team_clients  — назначать клиентов на команду (Subplan 4, зарезервировано сейчас)
--
-- Backfill: grant both permissions to all active admin/superadmin users.

BEGIN;

-- Update COMMENT on user_permissions table to include new permission keys
COMMENT ON TABLE user_permissions IS
  'Valid permissions (CRM spec):
     create_users, manage_roles, create_tasks, view_all_tasks,
     view_own_tasks, view_all_revenue, view_own_revenue, view_team_revenue,
     send_reminders, manage_teams, use_chat,
     manage_clients, assign_team_clients
   Legacy permissions (preserved during migration from old permissions jsonb):
     view_chart, view_top';

-- Backfill: grant manage_clients + assign_team_clients to admin and superadmin users.
-- Idempotent via ON CONFLICT (PK is user_id+permission).
INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT
  u.id,
  perm,
  NULL,                  -- system grant (no user)
  now()
FROM dashboard_users u
CROSS JOIN (VALUES ('manage_clients'), ('assign_team_clients')) AS p(perm)
WHERE u.is_active = true
  AND u.role IN ('admin','superadmin')
ON CONFLICT (user_id, permission) DO NOTHING;

COMMIT;

-- VERIFY:
--   SELECT u.email, u.role, p.permission
--     FROM dashboard_users u
--     JOIN user_permissions p ON p.user_id = u.id
--     WHERE p.permission IN ('manage_clients','assign_team_clients')
--     ORDER BY u.role, u.email;
--   -- Expected: each active admin/superadmin × 2 rows.
--
-- ROLLBACK:
--   DELETE FROM user_permissions
--     WHERE permission IN ('manage_clients','assign_team_clients');
--   -- Restore original COMMENT manually if needed.
