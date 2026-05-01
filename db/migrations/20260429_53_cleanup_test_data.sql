-- Migration 53: Cleanup test data перед multi-agency rollout
--
-- Система ещё не в проде, все non-superadmin данные тестовые. Чистим всё, кроме:
--   - superadmin vedvoy@gmail.com
--   - agencies (заведены через legacy admin)
--   - platforms (заведены через legacy admin)
--
-- ВНИМАНИЕ: НЕОБРАТИМАЯ ОПЕРАЦИЯ. Запускать только после Supabase snapshot.
--
-- Применяется ДО миграций 54/55 (CHECK constraint и teams.agency_id NOT NULL),
-- которые сломают валидацию при наличии тестовых non-superadmin пользователей
-- и строк teams без agency_id.

BEGIN;

-- 1. Активити-логи (зависят от users и clients)
DELETE FROM client_activity;
DELETE FROM team_activity;
DELETE FROM staff_activity;

-- 2. Tasks-related
DELETE FROM task_reports;
DELETE FROM task_activity;
DELETE FROM tasks;

-- 3. Team relations
DELETE FROM team_clients;
DELETE FROM team_members;
DELETE FROM moderator_operators;

-- 4. Teams
DELETE FROM teams;

-- 5. Client media + clients
DELETE FROM client_media;
DELETE FROM clients;

-- 6. User permissions/attributes для не-superadmin
DELETE FROM user_permissions
  WHERE user_id IN (SELECT id FROM dashboard_users WHERE email != 'vedvoy@gmail.com');
DELETE FROM user_attributes
  WHERE user_id IN (SELECT id FROM dashboard_users WHERE email != 'vedvoy@gmail.com');

-- 7. Deletion requests (если есть)
DELETE FROM deletion_requests
  WHERE target_user  IN (SELECT id FROM dashboard_users WHERE email != 'vedvoy@gmail.com')
     OR requested_by IN (SELECT id FROM dashboard_users WHERE email != 'vedvoy@gmail.com');

-- 8. Auth users — удаляем auth.users для всех кроме superadmin
-- ВНИМАНИЕ: на dev-окружении ОК; на проде это нарушит integrity. Здесь
-- проект ещё не в проде, делаем напрямую.
DELETE FROM auth.users
  WHERE id IN (
    SELECT auth_user_id FROM dashboard_users
     WHERE email != 'vedvoy@gmail.com' AND auth_user_id IS NOT NULL
  );

-- 9. dashboard_users (не-superadmin)
DELETE FROM dashboard_users WHERE email != 'vedvoy@gmail.com';

COMMIT;

-- VERIFY:
--   SELECT 'users' AS what, COUNT(*) FROM dashboard_users
--   UNION ALL SELECT 'clients',  COUNT(*) FROM clients
--   UNION ALL SELECT 'teams',    COUNT(*) FROM teams
--   UNION ALL SELECT 'tasks',    COUNT(*) FROM tasks
--   UNION ALL SELECT 'agencies', COUNT(*) FROM agencies
--   UNION ALL SELECT 'platforms',COUNT(*) FROM platforms;
--   -- Expected: users = 1, clients = 0, teams = 0, tasks = 0, agencies > 0, platforms > 0.
--
-- ROLLBACK: невозможен без backup. Перед запуском — pg_dump или Supabase backup snapshot.
