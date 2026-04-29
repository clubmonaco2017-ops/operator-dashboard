# Multi-Agency Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Изолировать данные CRM по агентствам — admin может вести несколько агентств (через junction table), operator/moderator/teamlead принадлежат строго одному. Только superadmin создаёт агентства и назначает в них админов.

**Architecture:** Новая таблица `admin_agencies` (admin → agencies many-to-many) + nullable `agency_id` на `dashboard_users` с CHECK constraint (NOT NULL для не-admin ролей) + `agency_id NOT NULL` на `teams`. Каждый scoped RPC получает `p_agency_id uuid` параметр; helper `assert_agency_access(user, agency)` валидирует доступ. Для combined view на списочных страницах `p_agency_id IS NULL` возвращает данные всех доступных вызывающему агентств. Активный agency context живёт в React `AgencyContext` с `localStorage` персистентностью. Тестовые данные wiped перед миграцией.

**Tech Stack:** PostgreSQL 15 + Supabase Auth, React 19, Vite, Vitest 4.x + JSDOM, Tailwind CSS 4 + shadcn/@base-ui/react, React Router DOM v7, lucide-react.

**Spec:** [`docs/superpowers/specs/2026-04-29-multi-agency-scoping-design.md`](../specs/2026-04-29-multi-agency-scoping-design.md). Read it before executing — план ссылается на разделы спеки.

---

## Stages overview

| Stage | What | PR boundary |
|---|---|---|
| 0 | Branch + baseline | — |
| 1 | DB foundation: `admin_agencies`, `agency_id` columns, CHECK constraints, helper `assert_agency_access` | combined |
| 2 | Cleanup миграция тестовых данных | with Stage 1 |
| 3 | Расширить `get_current_user_profile` (+ `available_agencies`); новые RPC superadmin (CRUD agencies + admin assignments) | own PR |
| 4 | Frontend: `AgencyContext` + persistence + интеграция с `AuthContext` | own PR |
| 5 | Frontend: `AgencySwitcher` компонент (dashboard top-right) | with Stage 4 |
| 6 | Bucket: clients RPC scoping refactor + UI updates | own PR |
| 7 | Bucket: teams (add `agency_id`) + RPC refactor + member/curatorship invariants | own PR |
| 8 | Bucket: staff/users RPC (operator/moderator/teamlead с `agency_id`) | own PR |
| 9 | Bucket: tasks RPC scoping | own PR |
| 10 | UI: combined view + agency column на списочных страницах | own PR |
| 11 | UI: agency dropdown в формах создания (user/client/team) | with Stage 10 |
| 12 | UI: `/admin/agencies` страница (CRUD + admin assignments) | own PR |
| 13 | Manual QA + cutover playbook | — |

---

## Conventions used by every task

**Migration filenames** используют префикс `2026MMDD_NN_` совпадающий с существующими файлами в `db/migrations/`. NN продолжается с последнего существующего индекса (на момент написания плана: `20260429_50_revoke_anon_table_access.sql`). Первая новая — `20260429_51_*`.

**Apply migrations on dev:** через Supabase Studio SQL editor (см. memory `feedback_inline_sql.md` — все миграции/диагностические запросы выдаются прямо в чат для копирования в Studio, не через CLI).

**Run unit tests:** `npm test` (watch) или `npm run test:run` (CI). Vitest, JSDOM. Базовая линия — текущее состояние ветки `main`.

**Commit messages** следуют существующей конвенции: `feat(rpc):`, `feat(ui):`, `chore(migrate):`, `feat(auth):`. Каждый коммит подписывается:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Permission codes:**
- `42501` (insufficient_privilege) — отказ доступа (`assert_agency_access` failure, `has_permission` failure)
- `28000` (invalid_authorization_specification) — неавторизован (`current_dashboard_user_id() IS NULL`)

**Уже существующее:**
- `current_dashboard_user_id()` (Stage 14 auth migration completed) — везде используем его, никаких `p_caller_id`
- `has_permission(user_id, perm_text)` — проверка прав
- `agencies.id` и `platforms.id` — `uuid` (legacy from main)
- `dashboard_users.id` — `integer`
- `clients.agency_id` — уже существует (`uuid REFERENCES agencies`)
- `list_clients(p_filter_active, p_filter_platform, p_filter_agency, p_search)` — уже принимает `p_filter_agency`, но это просто фильтр без enforcement; превратим в scoping

**Defense in depth:**
1. `assert_agency_access` в каждом scoped RPC — БД-уровень
2. INSERT/UPDATE принудительно ставят `agency_id = p_agency_id`, не из тела
3. На клиенте `useAgencyContext()` throws если `activeAgencyId === null` для контекстных операций (формы создания)

---

## Bucket Refactor Template

Stages 6, 7, 8, 9 применяют этот шаблон к каждому RPC в своём bucket. Прочитай раз; bucket-стадии ссылаются на него.

### T.1 Pattern: scoped read RPC (existing list_*, get_*)

Текущий вид (пример `list_clients`):
```sql
CREATE FUNCTION list_clients(p_filter_active text, p_filter_platform uuid, p_filter_agency uuid, p_search text)
RETURNS TABLE (...) AS $$
DECLARE v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION '...' USING errcode = '42501';
  END IF;
  RETURN QUERY SELECT ... WHERE (p_filter_agency IS NULL OR c.agency_id = p_filter_agency);
END; $$;
```

Новый вид:
```sql
DROP FUNCTION IF EXISTS public.list_clients(text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.list_clients(
  p_filter_active   text DEFAULT 'active',
  p_filter_platform uuid DEFAULT NULL,
  p_agency_id       uuid DEFAULT NULL,    -- renamed from p_filter_agency
  p_search          text DEFAULT NULL
) RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  SELECT ... FROM clients c
  WHERE
    (p_filter_active = 'all' OR ...) -- existing
    AND (p_filter_platform IS NULL OR c.platform_id = p_filter_platform)
    AND (
      p_agency_id IS NOT NULL AND c.agency_id = p_agency_id
      OR p_agency_id IS NULL AND c.agency_id IN (
        SELECT agency_id FROM accessible_agencies(v_caller_id)
      )
    )
    AND (p_search IS NULL OR ...);
END;
$$;

REVOKE ALL ON FUNCTION public.list_clients(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_clients(text, uuid, uuid, text) TO authenticated;
```

`accessible_agencies(user_id)` — set-returning helper, см. Stage 1 Task 5.

### T.2 Pattern: scoped write RPC (create_*)

Текущий `create_client(p_name, p_alias, ..., p_agency_id, ...)`:
```sql
-- existing already takes p_agency_id; добавляем assert
CREATE OR REPLACE FUNCTION public.create_client(...) AS $$
DECLARE v_caller_id integer := current_dashboard_user_id();
BEGIN
  -- existing checks
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION '...' USING errcode = '42501';
  END IF;

  -- NEW: assert agency access
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'agency_id is required';
  END IF;
  PERFORM assert_agency_access(v_caller_id, p_agency_id);

  INSERT INTO clients (..., agency_id, ...) VALUES (..., p_agency_id, ...);
  ...
END; $$;
```

### T.3 Pattern: scoped update/delete RPC (update_*, archive_*, restore_*)

Resource уже привязан к агентству; resolve agency_id из таблицы и assert:
```sql
CREATE OR REPLACE FUNCTION public.update_client(p_client_id integer, ...)
RETURNS void AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_agency_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  SELECT agency_id INTO v_agency_id FROM clients WHERE id = p_client_id;
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency_id);

  UPDATE clients SET ... WHERE id = p_client_id;
END; $$;
```

### T.4 Pattern: cross-agency invariant assertion

Когда RPC связывает две сущности (например `add_team_member(team_id, operator_id)`) — обе должны быть в одном агентстве:
```sql
DECLARE
  v_team_agency uuid;
  v_user_agency uuid;
BEGIN
  SELECT agency_id INTO v_team_agency FROM teams WHERE id = p_team_id;
  SELECT agency_id INTO v_user_agency FROM dashboard_users WHERE id = p_operator_id;

  IF v_team_agency IS NULL THEN RAISE EXCEPTION 'team not found' USING errcode = 'P0002'; END IF;
  IF v_user_agency IS NULL THEN RAISE EXCEPTION 'user has no agency' USING errcode = '23503'; END IF;
  IF v_team_agency != v_user_agency THEN
    RAISE EXCEPTION 'team % (agency %) and operator % (agency %) belong to different agencies',
      p_team_id, v_team_agency, p_operator_id, v_user_agency
      USING errcode = '23514';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_team_agency);
  -- existing logic
END;
```

### T.5 Pattern: frontend RPC callsite update

Каждый файл, вызывающий scoped RPC:
```diff
- supabase.rpc('list_clients', { p_filter_active: 'active', p_search })
+ supabase.rpc('list_clients', { p_filter_active: 'active', p_agency_id: activeAgencyId, p_search })
```

`activeAgencyId` приходит из `useAgencyContext()`. Если switcher на странице есть — это его значение; если страница combined-view (`/clients`, `/teams`, etc.), и активный агентство = "Все агентства" → `activeAgencyId === null`, и в RPC передаём `null` (combined view).

---

## Stage 0 — Branch + baseline

**Files:** —

- [ ] **Step 1: Create worktree branch**

```bash
git checkout main && git pull origin main
git worktree add ../operator-dashboard-multi-agency -b feat/multi-agency-scoping
cd ../operator-dashboard-multi-agency
```

- [ ] **Step 2: Verify baseline tests pass**

Run: `npm test -- --run`
Expected: all tests pass (current baseline). Note count for later regression check.

- [ ] **Step 3: Verify dev DB connectivity**

В Supabase Studio (project URL из `.env.local`) открыть SQL editor. Выполнить:
```sql
SELECT COUNT(*) FROM agencies;
SELECT COUNT(*) FROM platforms;
SELECT COUNT(*) FROM dashboard_users WHERE role = 'superadmin';
SELECT email FROM dashboard_users WHERE email = 'vedvoy@gmail.com';
```

Expected: agencies > 0, platforms > 0, superadmin row для `vedvoy@gmail.com` найден.

---

## Stage 1 — DB foundation

**Files:**
- Create: `db/migrations/20260429_51_admin_agencies_table.sql`
- Create: `db/migrations/20260429_52_user_agency_column.sql`
- Create: `db/migrations/20260429_53_team_agency_column.sql`
- Create: `db/migrations/20260429_54_assert_agency_access.sql`
- Create: `db/migrations/20260429_55_accessible_agencies_helper.sql`

### Task 1.1: Create `admin_agencies` table

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_51_admin_agencies_table.sql`:
```sql
-- Migration 51: admin_agencies junction table (admin → agencies many-to-many)
--
-- Один admin может быть привязан к нескольким агентствам. Заполняется superadmin-ом
-- через UI /admin/agencies. См. spec docs/superpowers/specs/2026-04-29-multi-agency-scoping-design.md.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_agencies (
  admin_id     integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  agency_id    uuid        NOT NULL REFERENCES agencies(id)        ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  integer     NOT NULL REFERENCES dashboard_users(id),
  PRIMARY KEY (admin_id, agency_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_agencies_agency
  ON admin_agencies(agency_id);

ALTER TABLE admin_agencies ENABLE ROW LEVEL SECURITY;

-- RLS: anon видит ничего; authenticated читает через RPC. Прямые SELECT не используются.
REVOKE ALL ON admin_agencies FROM PUBLIC;
REVOKE ALL ON admin_agencies FROM anon;

COMMIT;

-- VERIFY:
--   SELECT relname FROM pg_class WHERE relname = 'admin_agencies';
--   -- Expected: 1 row.
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'admin_agencies';
--   -- Expected: at least PRIMARY KEY index + idx_admin_agencies_agency.
--
-- ROLLBACK:
--   DROP TABLE admin_agencies;
```

- [ ] **Step 2: Apply migration in Supabase Studio SQL editor**

Скопировать содержимое файла, выполнить. Проверить VERIFY-блок.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/20260429_51_admin_agencies_table.sql
git commit -m "$(cat <<'EOF'
feat(db): add admin_agencies junction table for multi-agency admin model

Stage 1.1 of multi-agency scoping. Allows one admin to be assigned to
multiple agencies. Superadmin manages assignments via /admin/agencies UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.2: Add `agency_id` column to `dashboard_users` with CHECK constraint

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_52_user_agency_column.sql`:
```sql
-- Migration 52: dashboard_users.agency_id + CHECK constraint
--
-- agency_id обязателен для operator/moderator/teamlead, NULL для admin/superadmin.
-- На момент применения этой миграции тестовые non-superadmin пользователи будут
-- удалены Stage 2 (cleanup), поэтому ALTER ... NOT VALID не нужен — пишем строгий
-- CHECK сразу.

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
```

> **Внимание:** на момент применения этой миграции в БД ещё могут быть тестовые operator/moderator/teamlead **без** `agency_id`. Они нарушат CHECK. Cleanup (Stage 2) удалит их, но тогда — Stage 2 должен быть применён до этой миграции. **Перепорядочить:** сначала применить Stage 2 (cleanup), потом Stage 1.2.
>
> Решение: либо изменить порядок применения миграций (см. ниже), либо временно создать CHECK как `NOT VALID`, удалить тестовых, потом `VALIDATE`. Здесь идём первым путём — Stage 2 применяется ДО Stage 1.2.

- [ ] **Step 2: НЕ применять пока — переходим к Stage 2 (cleanup), вернёмся после**

### Task 1.3: Add `agency_id NOT NULL` to `teams`

> Применяется ПОСЛЕ Stage 2 (когда нет тестовых teams).

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_53_team_agency_column.sql`:
```sql
-- Migration 53: teams.agency_id NOT NULL
--
-- Каждая команда принадлежит одному агентству. Применяется ПОСЛЕ Stage 2 (cleanup
-- удаляет тестовые teams), поэтому сразу NOT NULL без backfill.

BEGIN;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE RESTRICT;

-- После cleanup в teams 0 строк, поэтому SET NOT NULL пройдёт мгновенно.
ALTER TABLE teams
  ALTER COLUMN agency_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_agency ON teams(agency_id);

COMMIT;

-- VERIFY:
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'teams' AND column_name = 'agency_id';
--   -- Expected: data_type = uuid, is_nullable = NO.
--
-- ROLLBACK:
--   DROP INDEX idx_teams_agency;
--   ALTER TABLE teams DROP COLUMN agency_id;
```

- [ ] **Step 2: НЕ применять пока — после Stage 2.**

### Task 1.4: Create `assert_agency_access` helper

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_54_assert_agency_access.sql`:
```sql
-- Migration 54: assert_agency_access(user_id, agency_id) helper
--
-- Bouncer для всех scoped RPC. RAISE 42501 если пользователь не имеет доступа к
-- указанному агентству. superadmin видит всё; admin — через admin_agencies;
-- operator/moderator/teamlead — через dashboard_users.agency_id.

CREATE OR REPLACE FUNCTION public.assert_agency_access(
  p_user_id   integer,
  p_agency_id uuid
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'assert_agency_access: agency_id required';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT role INTO v_role FROM public.dashboard_users WHERE id = p_user_id AND is_active = true;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  -- superadmin sees everything
  IF v_role = 'superadmin' THEN
    RETURN;
  END IF;

  -- admin: check admin_agencies junction
  IF v_role = 'admin' THEN
    IF EXISTS (
      SELECT 1 FROM public.admin_agencies
      WHERE admin_id = p_user_id AND agency_id = p_agency_id
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'admin % has no access to agency %', p_user_id, p_agency_id
      USING errcode = '42501';
  END IF;

  -- operator/moderator/teamlead: check dashboard_users.agency_id
  IF EXISTS (
    SELECT 1 FROM public.dashboard_users
    WHERE id = p_user_id AND agency_id = p_agency_id
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'user % has no access to agency %', p_user_id, p_agency_id
    USING errcode = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_agency_access(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_agency_access(integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.assert_agency_access(integer, uuid) IS
  'Bouncer for scoped RPCs. Raises 42501 if user has no access to agency. superadmin: all; admin: admin_agencies; non-admin: dashboard_users.agency_id.';
```

- [ ] **Step 2: НЕ применять пока — после Stage 2 + 1.2/1.3.**

### Task 1.5: Create `accessible_agencies` set-returning helper

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_55_accessible_agencies_helper.sql`:
```sql
-- Migration 55: accessible_agencies(user_id) set-returning helper
--
-- Возвращает agency_id для всех агентств, доступных пользователю.
-- Используется в combined-view RPC (когда p_agency_id IS NULL):
--   SELECT * FROM clients WHERE agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id));

CREATE OR REPLACE FUNCTION public.accessible_agencies(p_user_id integer)
RETURNS TABLE (agency_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.dashboard_users WHERE id = p_user_id AND is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF v_role = 'superadmin' THEN
    RETURN QUERY SELECT a.id FROM public.agencies a;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT aa.agency_id FROM public.admin_agencies aa WHERE aa.admin_id = p_user_id;
    RETURN;
  END IF;

  -- operator/moderator/teamlead
  RETURN QUERY
    SELECT u.agency_id
      FROM public.dashboard_users u
     WHERE u.id = p_user_id AND u.agency_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.accessible_agencies(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accessible_agencies(integer) TO authenticated;

COMMENT ON FUNCTION public.accessible_agencies(integer) IS
  'Returns agency_ids accessible to user. Used by combined-view RPCs (p_agency_id IS NULL).';
```

- [ ] **Step 2: НЕ применять пока — после Stage 2.**

---

## Stage 2 — Cleanup test data

**Files:**
- Create: `db/migrations/20260429_56_cleanup_test_data.sql`

### Task 2.1: Wipe test users, clients, teams (preserve superadmin + agencies + platforms)

- [ ] **Step 1: Confirm in Supabase Studio what will be deleted**

Перед миграцией выполнить diagnostic query:
```sql
SELECT 'dashboard_users to delete' AS what, COUNT(*) AS n
  FROM dashboard_users WHERE email != 'vedvoy@gmail.com'
UNION ALL SELECT 'dashboard_users to keep', COUNT(*) FROM dashboard_users WHERE email = 'vedvoy@gmail.com'
UNION ALL SELECT 'clients to delete',       COUNT(*) FROM clients
UNION ALL SELECT 'teams to delete',         COUNT(*) FROM teams
UNION ALL SELECT 'agencies to keep',        COUNT(*) FROM agencies
UNION ALL SELECT 'platforms to keep',       COUNT(*) FROM platforms;
```

Записать результат для лога. Если суперадмин не найден (`vedvoy@gmail.com` keep = 0) — STOP, исправить email вручную перед продолжением.

- [ ] **Step 2: Create migration file**

`db/migrations/20260429_56_cleanup_test_data.sql`:
```sql
-- Migration 56: Cleanup test data перед multi-agency rollout
--
-- Система ещё не в проде, все non-superadmin данные тестовые. Чистим всё, кроме:
--   - superadmin vedvoy@gmail.com
--   - agencies (заведены через legacy admin)
--   - platforms (заведены через legacy admin)
--
-- ВНИМАНИЕ: необратимая операция. Запускать только после Stage 0 baseline и
-- diagnostic query из Step 1.

BEGIN;

-- 1. Активити-логи (зависят от users и clients)
DELETE FROM client_activity;
DELETE FROM team_activity;

-- 2. Tasks-related
DELETE FROM task_reports;
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
  WHERE target_user_id IN (SELECT id FROM dashboard_users WHERE email != 'vedvoy@gmail.com')
     OR requested_by  IN (SELECT id FROM dashboard_users WHERE email != 'vedvoy@gmail.com');

-- 8. Auth users — удаляем auth.users для всех кроме superadmin
-- ВНИМАНИЕ: auth.users очищается через Supabase Auth API, не SQL. Если использовать
-- DELETE напрямую — на dev-окружении ОК; на проде это нарушит integrity. Здесь
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
```

- [ ] **Step 3: Take Supabase project snapshot via dashboard**

В Supabase Studio → Database → Backups — создать manual snapshot. Только после этого применять миграцию.

- [ ] **Step 4: Apply migration**

В SQL editor выполнить файл. Проверить VERIFY-блок.

- [ ] **Step 5: Apply Stage 1 migrations 1.2, 1.3, 1.4, 1.5**

В правильном порядке: `52_user_agency_column.sql` → `53_team_agency_column.sql` → `54_assert_agency_access.sql` → `55_accessible_agencies_helper.sql`.

После каждой — выполнить её VERIFY-блок.

- [ ] **Step 6: Backfill superadmin (агентства не нужны, но перепроверить роль)**

```sql
SELECT id, email, role, is_active, agency_id FROM dashboard_users WHERE email = 'vedvoy@gmail.com';
```
Expected: role = 'superadmin', is_active = true, agency_id = NULL.

- [ ] **Step 7: Commit all migrations together**

```bash
git add db/migrations/20260429_5{1,2,3,4,5,6}_*.sql
git commit -m "$(cat <<'EOF'
feat(db): multi-agency scoping foundation (admin_agencies, agency_id columns, helpers)

Stage 1+2 of multi-agency scoping:
- admin_agencies junction table (admin → many agencies)
- dashboard_users.agency_id with CHECK constraint (non-admin roles require it)
- teams.agency_id NOT NULL
- assert_agency_access(user, agency) helper for RPC bouncers
- accessible_agencies(user) set-returning helper for combined-view queries
- Wipe test data (kept superadmin vedvoy@gmail.com, agencies, platforms)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 3 — Superadmin agency RPC + extended profile

**Files:**
- Create: `db/migrations/20260429_57_get_current_user_profile_v2.sql`
- Create: `db/migrations/20260429_58_rpc_agencies_crud.sql`
- Create: `db/migrations/20260429_59_rpc_admin_agency_assignments.sql`
- Modify: `src/useAuth.jsx` (read `available_agencies` from profile)

### Task 3.1: Extend `get_current_user_profile` to return `available_agencies`

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_57_get_current_user_profile_v2.sql`:
```sql
-- Migration 57: get_current_user_profile() v2 — добавляем available_agencies
--
-- Возвращает дополнительное поле available_agencies (jsonb array of {id, name})
-- — список агентств, доступных пользователю. Используется AgencyContext на клиенте.

DROP FUNCTION IF EXISTS public.get_current_user_profile();

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (
  id integer,
  email text,
  first_name text,
  last_name text,
  role text,
  is_active boolean,
  permissions text[],
  attributes jsonb,
  timezone text,
  ref_code text,
  alias text,
  available_agencies jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.is_active,
    COALESCE(
      (SELECT array_agg(p.permission ORDER BY p.permission)
       FROM public.user_permissions p
       WHERE p.user_id = u.id),
      ARRAY[]::text[]
    ),
    COALESCE(
      (SELECT jsonb_object_agg(a.key, a.value)
       FROM public.user_attributes a
       WHERE a.user_id = u.id),
      '{}'::jsonb
    ),
    COALESCE(u.timezone, 'Europe/Kiev'),
    u.ref_code,
    u.alias,
    -- available_agencies: jsonb array [{id, name}]
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', ag.id, 'name', ag.name) ORDER BY ag.name)
         FROM public.agencies ag
        WHERE ag.id IN (SELECT agency_id FROM public.accessible_agencies(u.id))),
      '[]'::jsonb
    )
  FROM public.dashboard_users u
  WHERE u.id = v_caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_profile() TO authenticated;
```

- [ ] **Step 2: Apply migration in Studio + verify**

```sql
-- Sanity check (выполнить под superadmin sessions):
SELECT * FROM get_current_user_profile();
-- Expected: 1 row, available_agencies — массив всех agencies (для superadmin).
```

### Task 3.2: Create RPC `create_agency`, `update_agency`, `archive_agency`, `list_all_agencies`

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_58_rpc_agencies_crud.sql`:
```sql
-- Migration 58: RPC CRUD agencies (только superadmin)

BEGIN;

-- ============================================================
-- create_agency(p_name, p_admin_ids)
-- Создаёт агентство и опционально привязывает админов.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_agency(
  p_name      text,
  p_platform_id uuid,
  p_admin_ids integer[] DEFAULT ARRAY[]::integer[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_new_id    uuid;
  v_admin_id  integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can create agencies' USING errcode = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF p_platform_id IS NULL THEN
    RAISE EXCEPTION 'platform_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platforms WHERE id = p_platform_id) THEN
    RAISE EXCEPTION 'platform % not found', p_platform_id USING errcode = 'P0002';
  END IF;

  INSERT INTO agencies (name, platform_id)
  VALUES (trim(p_name), p_platform_id)
  RETURNING id INTO v_new_id;

  -- Привязать админов
  IF array_length(p_admin_ids, 1) > 0 THEN
    FOREACH v_admin_id IN ARRAY p_admin_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'user % is not an admin', v_admin_id USING errcode = '23514';
      END IF;
      INSERT INTO admin_agencies (admin_id, agency_id, assigned_by)
        VALUES (v_admin_id, v_new_id, v_caller_id);
    END LOOP;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_agency(text, uuid, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agency(text, uuid, integer[]) TO authenticated;

-- ============================================================
-- update_agency(p_agency_id, p_name)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_agency(
  p_agency_id uuid,
  p_name      text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can update agencies' USING errcode = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  UPDATE agencies SET name = trim(p_name) WHERE id = p_agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agency % not found', p_agency_id USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agency(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_agency(uuid, text) TO authenticated;

-- ============================================================
-- archive_agency(p_agency_id) — мягкое удаление через флаг is_active
-- ============================================================
-- ВНИМАНИЕ: agencies legacy table может не иметь is_active. Сначала добавим:
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_agencies_active ON agencies(is_active) WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.archive_agency(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
  v_active_users integer;
  v_active_clients integer;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can archive agencies' USING errcode = '42501';
  END IF;

  -- Проверка: нет активных пользователей и клиентов в агентстве
  SELECT COUNT(*) INTO v_active_users
    FROM dashboard_users WHERE agency_id = p_agency_id AND is_active = true;
  SELECT COUNT(*) INTO v_active_clients
    FROM clients WHERE agency_id = p_agency_id AND is_active = true;

  IF v_active_users > 0 OR v_active_clients > 0 THEN
    RAISE EXCEPTION 'agency has % active users and % active clients; deactivate them first',
      v_active_users, v_active_clients USING errcode = '23514';
  END IF;

  UPDATE agencies SET is_active = false WHERE id = p_agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agency % not found', p_agency_id USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_agency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_agency(uuid) TO authenticated;

-- ============================================================
-- list_all_agencies() — возвращает все агентства с метаданными (только superadmin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_all_agencies()
RETURNS TABLE (
  id              uuid,
  name            text,
  platform_id     uuid,
  platform_name   text,
  is_active       boolean,
  admin_count     integer,
  user_count      integer,
  client_count    integer,
  team_count      integer,
  created_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can list all agencies' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.platform_id,
    p.name AS platform_name,
    a.is_active,
    (SELECT COUNT(*)::int FROM admin_agencies aa WHERE aa.agency_id = a.id),
    (SELECT COUNT(*)::int FROM dashboard_users u WHERE u.agency_id = a.id AND u.is_active = true),
    (SELECT COUNT(*)::int FROM clients c WHERE c.agency_id = a.id AND c.is_active = true),
    (SELECT COUNT(*)::int FROM teams t WHERE t.agency_id = a.id AND t.is_active = true),
    a.created_at
  FROM agencies a
  LEFT JOIN platforms p ON p.id = a.platform_id
  ORDER BY a.is_active DESC, lower(a.name) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_agencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_all_agencies() TO authenticated;

COMMIT;
```

> **Замечание про `agencies.created_at`:** если в legacy таблице agencies нет `created_at` — добавить через `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();` в начале миграции. Перед коммитом проверить через `\d agencies` в SQL editor.

- [ ] **Step 2: Apply migration in Studio**

Перед apply — проверить структуру agencies:
```sql
\d agencies
-- Если нет created_at — добавить:
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
```

После — выполнить файл миграции.

- [ ] **Step 3: Sanity check**

Под superadmin session:
```sql
SELECT * FROM list_all_agencies();
-- Expected: одна строка на каждое существующее агентство.

-- Тестовое создание (потом удалить):
SELECT create_agency('Test Agency', (SELECT id FROM platforms LIMIT 1), ARRAY[]::integer[]);
SELECT update_agency((SELECT id FROM agencies WHERE name = 'Test Agency'), 'Test Agency Renamed');
SELECT archive_agency((SELECT id FROM agencies WHERE name = 'Test Agency Renamed'));
DELETE FROM agencies WHERE name = 'Test Agency Renamed';
```

### Task 3.3: Create RPC `assign_admin_to_agency`, `remove_admin_from_agency`

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_59_rpc_admin_agency_assignments.sql`:
```sql
-- Migration 59: RPC для управления назначениями admin → agency

BEGIN;

CREATE OR REPLACE FUNCTION public.assign_admin_to_agency(
  p_admin_id  integer,
  p_agency_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
  v_target_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can assign admins to agencies' USING errcode = '42501';
  END IF;

  SELECT role INTO v_target_role FROM dashboard_users WHERE id = p_admin_id AND is_active = true;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'user % not found or inactive', p_admin_id USING errcode = 'P0002';
  END IF;
  IF v_target_role != 'admin' THEN
    RAISE EXCEPTION 'user % is not an admin (role: %)', p_admin_id, v_target_role USING errcode = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agencies WHERE id = p_agency_id AND is_active = true) THEN
    RAISE EXCEPTION 'agency % not found or archived', p_agency_id USING errcode = 'P0002';
  END IF;

  INSERT INTO admin_agencies (admin_id, agency_id, assigned_by)
    VALUES (p_admin_id, p_agency_id, v_caller_id)
    ON CONFLICT (admin_id, agency_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_admin_to_agency(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_admin_to_agency(integer, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_admin_from_agency(
  p_admin_id  integer,
  p_agency_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can remove admin assignments' USING errcode = '42501';
  END IF;

  DELETE FROM admin_agencies WHERE admin_id = p_admin_id AND agency_id = p_agency_id;
  -- NOT FOUND OK — idempotent.
END;
$$;

REVOKE ALL ON FUNCTION public.remove_admin_from_agency(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_admin_from_agency(integer, uuid) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply in Studio.**

- [ ] **Step 3: Commit Stage 3**

```bash
git add db/migrations/20260429_57_*.sql db/migrations/20260429_58_*.sql db/migrations/20260429_59_*.sql
git commit -m "$(cat <<'EOF'
feat(rpc): superadmin agency CRUD + admin assignment RPCs + extended profile

Stage 3 of multi-agency scoping:
- get_current_user_profile() returns available_agencies jsonb array
- create_agency / update_agency / archive_agency (superadmin only)
- list_all_agencies() with admin/user/client/team counts
- assign_admin_to_agency / remove_admin_from_agency (idempotent)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 4 — Frontend AgencyContext

**Files:**
- Create: `src/lib/agencyContext.jsx`
- Modify: `src/useAuth.jsx` (read available_agencies from profile and expose via context)
- Modify: `src/main.jsx` (wrap with AgencyProvider after AuthProvider)
- Create: `src/lib/agencyContext.test.jsx`

### Task 4.1: Create `AgencyContext` with persistence

- [ ] **Step 1: Write failing test**

`src/lib/agencyContext.test.jsx`:
```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AgencyProvider, useAgencyContext } from './agencyContext';

const fakeAuth = (agencies) => ({
  user: { id: 1, role: 'admin', availableAgencies: agencies },
  loading: false,
});

vi.mock('../useAuth', () => ({
  useAuth: () => fakeAuth(window.__agencies__ ?? []),
}));

const wrapper = ({ children }) => <AgencyProvider>{children}</AgencyProvider>;

describe('AgencyContext', () => {
  beforeEach(() => {
    localStorage.clear();
    window.__agencies__ = [];
  });

  it('returns empty available list and null active when user has no agencies', () => {
    window.__agencies__ = [];
    const { result } = renderHook(() => useAgencyContext(), { wrapper });
    expect(result.current.availableAgencies).toEqual([]);
    expect(result.current.activeAgencyId).toBeNull();
    expect(result.current.isMultiAgency).toBe(false);
  });

  it('auto-selects single agency without showing switcher', () => {
    window.__agencies__ = [{ id: 'a1', name: 'Agency 1' }];
    const { result } = renderHook(() => useAgencyContext(), { wrapper });
    expect(result.current.activeAgencyId).toBe('a1');
    expect(result.current.isMultiAgency).toBe(false);
  });

  it('marks multi-agency when user has 2+ agencies and persists choice', () => {
    window.__agencies__ = [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ];
    const { result } = renderHook(() => useAgencyContext(), { wrapper });
    expect(result.current.isMultiAgency).toBe(true);
    expect(result.current.activeAgencyId).toBe('a1'); // first

    act(() => result.current.setActiveAgency('a2'));
    expect(result.current.activeAgencyId).toBe('a2');
    expect(localStorage.getItem('activeAgencyId')).toBe('a2');
  });

  it('restores activeAgencyId from localStorage if still in available list', () => {
    localStorage.setItem('activeAgencyId', 'a2');
    window.__agencies__ = [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ];
    const { result } = renderHook(() => useAgencyContext(), { wrapper });
    expect(result.current.activeAgencyId).toBe('a2');
  });

  it('falls back to first when localStorage value is no longer available', () => {
    localStorage.setItem('activeAgencyId', 'stale');
    window.__agencies__ = [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }];
    const { result } = renderHook(() => useAgencyContext(), { wrapper });
    expect(result.current.activeAgencyId).toBe('a1');
    expect(localStorage.getItem('activeAgencyId')).toBe('a1');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/lib/agencyContext.test.jsx --run`
Expected: FAIL — "Cannot find module './agencyContext'".

- [ ] **Step 3: Implement AgencyContext**

`src/lib/agencyContext.jsx`:
```jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../useAuth';

const AgencyContext = createContext(null);
const STORAGE_KEY = 'activeAgencyId';

export function AgencyProvider({ children }) {
  const { user } = useAuth();
  const availableAgencies = user?.availableAgencies ?? [];
  const [activeAgencyId, setActiveAgencyIdState] = useState(null);

  useEffect(() => {
    if (availableAgencies.length === 0) {
      setActiveAgencyIdState(null);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = stored && availableAgencies.some((a) => a.id === stored);
    const next = valid ? stored : availableAgencies[0].id;
    setActiveAgencyIdState(next);
    if (!valid) localStorage.setItem(STORAGE_KEY, next);
  }, [availableAgencies]);

  const setActiveAgency = (id) => {
    if (!availableAgencies.some((a) => a.id === id)) return;
    setActiveAgencyIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo(
    () => ({
      availableAgencies,
      activeAgencyId,
      setActiveAgency,
      isMultiAgency: availableAgencies.length > 1,
      activeAgency: availableAgencies.find((a) => a.id === activeAgencyId) ?? null,
    }),
    [availableAgencies, activeAgencyId]
  );

  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>;
}

export function useAgencyContext() {
  const ctx = useContext(AgencyContext);
  if (!ctx) throw new Error('useAgencyContext must be used inside AgencyProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/lib/agencyContext.test.jsx --run`
Expected: 5 tests pass.

### Task 4.2: Update `useAuth` to expose `availableAgencies` on user object

- [ ] **Step 1: Read current useAuth.jsx**

Открыть `src/useAuth.jsx`, найти место где hydrate-ит profile через `get_current_user_profile()` (около `:80` по recon). Текущий код выставляет `setUser({ id, email, role, permissions, attributes, ... })`.

- [ ] **Step 2: Add `availableAgencies` to setUser payload**

Найти строки где profile mapping происходит, добавить `availableAgencies: data.available_agencies ?? []`. Точные строки зависят от текущего кода — после загрузки профиля прокинуть поле дальше.

Например:
```diff
 const profile = data?.[0] ?? null;
 if (profile) {
   setUser({
     id: profile.id,
     email: profile.email,
     role: profile.role,
     permissions: profile.permissions ?? [],
     attributes: profile.attributes ?? {},
+    availableAgencies: profile.available_agencies ?? [],
     timezone: profile.timezone,
     refCode: profile.ref_code,
   });
 }
```

- [ ] **Step 3: Wrap App with AgencyProvider in main.jsx**

`src/main.jsx`:
```diff
 import { AuthProvider } from './useAuth';
+import { AgencyProvider } from './lib/agencyContext';

 <AuthProvider>
+  <AgencyProvider>
     <BrowserRouter>
       <App />
     </BrowserRouter>
+  </AgencyProvider>
 </AuthProvider>
```

- [ ] **Step 4: Run all tests**

Run: `npm test -- --run`
Expected: full suite passes; new agencyContext tests included.

- [ ] **Step 5: Commit Stage 4**

```bash
git add src/lib/agencyContext.jsx src/lib/agencyContext.test.jsx src/useAuth.jsx src/main.jsx
git commit -m "$(cat <<'EOF'
feat(ui): AgencyContext for active-agency state with localStorage persistence

Stage 4 of multi-agency scoping. Reads available_agencies from
get_current_user_profile() v2; auto-selects first agency or restores
from localStorage; throws if used outside provider.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 5 — Agency switcher UI

**Files:**
- Create: `src/components/AgencySwitcher.jsx`
- Create: `src/components/AgencySwitcher.test.jsx`
- Modify: страница дашборда (вероятно `src/pages/DashboardPage.jsx` или аналог) — встроить switcher справа вверху

### Task 5.1: AgencySwitcher component

- [ ] **Step 1: Find dashboard page file**

```bash
grep -rln "Dashboard" src/pages/ | head -5
```

Зафиксировать точный путь (обычно `src/pages/DashboardPage.jsx` либо аналог из Subplan 6A3).

- [ ] **Step 2: Write component test**

`src/components/AgencySwitcher.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgencySwitcher from './AgencySwitcher';

const mockCtx = vi.fn();
vi.mock('../lib/agencyContext', () => ({
  useAgencyContext: () => mockCtx(),
}));

describe('AgencySwitcher', () => {
  it('renders nothing when user has 0 or 1 agencies', () => {
    mockCtx.mockReturnValue({ availableAgencies: [], activeAgencyId: null, isMultiAgency: false });
    const { container } = render(<AgencySwitcher />);
    expect(container.firstChild).toBeNull();

    mockCtx.mockReturnValue({
      availableAgencies: [{ id: 'a1', name: 'A' }],
      activeAgencyId: 'a1',
      isMultiAgency: false,
    });
    const r2 = render(<AgencySwitcher />);
    expect(r2.container.firstChild).toBeNull();
  });

  it('renders dropdown with active agency name when isMultiAgency', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Agency Alpha' },
        { id: 'a2', name: 'Agency Beta' },
      ],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Agency Alpha' },
      isMultiAgency: true,
      setActiveAgency: vi.fn(),
    });
    render(<AgencySwitcher />);
    expect(screen.getByRole('button', { name: /Agency Alpha/i })).toBeInTheDocument();
  });

  it('calls setActiveAgency when option clicked', () => {
    const setActive = vi.fn();
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Agency Alpha' },
        { id: 'a2', name: 'Agency Beta' },
      ],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Agency Alpha' },
      isMultiAgency: true,
      setActiveAgency: setActive,
    });
    render(<AgencySwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /Agency Alpha/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Agency Beta/i }));
    expect(setActive).toHaveBeenCalledWith('a2');
  });
});
```

- [ ] **Step 3: Run test (will fail)**

Run: `npm test -- src/components/AgencySwitcher.test.jsx --run`
Expected: FAIL — "Cannot find module"

- [ ] **Step 4: Implement AgencySwitcher**

`src/components/AgencySwitcher.jsx`:
```jsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useAgencyContext } from '../lib/agencyContext';

export default function AgencySwitcher() {
  const { availableAgencies, activeAgencyId, activeAgency, setActiveAgency, isMultiAgency } =
    useAgencyContext();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!isMultiAgency) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        {activeAgency?.name ?? 'Выбрать агентство'}
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 min-w-[200px] rounded-md border border-border bg-popover shadow-md py-1 z-50"
        >
          {availableAgencies.map((agency) => (
            <button
              key={agency.id}
              role="menuitem"
              type="button"
              onClick={() => {
                setActiveAgency(agency.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent"
            >
              <span>{agency.name}</span>
              {agency.id === activeAgencyId && <Check className="h-4 w-4" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/components/AgencySwitcher.test.jsx --run`
Expected: 3 tests pass.

### Task 5.2: Embed switcher on dashboard

- [ ] **Step 1: Add to dashboard page header**

Открыть файл дашборда (из 5.1 Step 1). В верхней правой части основной контентной области добавить:
```jsx
import AgencySwitcher from '../components/AgencySwitcher';
// ...
<div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-semibold">Дашборд</h1>
  <AgencySwitcher />
</div>
```

Точное место зависит от текущей структуры — найди header/title зону, добавь рядом.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev` (если dev-сервер работает локально), залогиниться superadmin-ом → дашборд → проверить что switcher показывается с двумя+ агентствами и переключается.

Если dev-сервер не настроен у тебя — проверь хотя бы что компонент рендерится без ошибок в тестах. Полный e2e — Stage 13.

- [ ] **Step 3: Commit Stage 5**

```bash
git add src/components/AgencySwitcher.jsx src/components/AgencySwitcher.test.jsx src/pages/<dashboard-file>.jsx
git commit -m "$(cat <<'EOF'
feat(ui): AgencySwitcher dropdown on dashboard for multi-agency admins

Stage 5 of multi-agency scoping. Switcher hidden when user has 0 or 1
agencies; otherwise renders dropdown with check mark on active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 6 — Bucket: Clients RPC scoping

**Files:**
- Create: `db/migrations/20260429_60_rpc_clients_agency_scoping.sql`
- Modify: каждый файл в `src/` который вызывает clients RPC (см. T.5 в template)
- Modify: tests under `src/` для clients-related компонентов

**RPCs in this bucket:**
- `create_client` — apply T.2
- `list_clients` — apply T.1 (rename `p_filter_agency` → `p_agency_id` — ломающее изменение, требует frontend sweep)
- `update_client` — apply T.3
- `archive_client` — apply T.3
- `restore_client` — apply T.3
- `get_client_detail` — apply T.3
- `list_client_activity` — apply T.3
- `list_unassigned_clients` (lives in migration 22, refactored in 40) — apply T.1

### Task 6.1: SQL migration for all 8 client RPCs

- [ ] **Step 1: Create migration file**

`db/migrations/20260429_60_rpc_clients_agency_scoping.sql`:

Файл содержит 8 секций — по одной на каждый RPC. Используй template T.1/T.2/T.3. Текущие сигнатуры брать из `db/migrations/20260428_40_rpc_clients_crud_auth.sql` (читай его перед написанием каждой секции).

Пример секции для `list_clients` (применение T.1):
```sql
-- ============================================================
-- list_clients: rename p_filter_agency → p_agency_id, add scoping
-- ============================================================
DROP FUNCTION IF EXISTS public.list_clients(text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.list_clients(
  p_filter_active   text DEFAULT 'active',
  p_filter_platform uuid DEFAULT NULL,
  p_agency_id       uuid DEFAULT NULL,
  p_search          text DEFAULT NULL
) RETURNS TABLE (
  id integer, name text, alias text, description text, avatar_url text,
  platform_id uuid, platform_name text, agency_id uuid, agency_name text,
  tableau_id text, is_active boolean,
  photos_count integer, videos_count integer, files_count integer,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  WITH media_counts AS (
    SELECT m.client_id,
      COUNT(*) FILTER (WHERE m.type = 'photo' AND m.status = 'ready')::int AS photos,
      COUNT(*) FILTER (WHERE m.type = 'video' AND m.status = 'ready')::int AS videos
    FROM client_media m GROUP BY m.client_id
  )
  SELECT c.id, c.name, c.alias, c.description, c.avatar_url,
         c.platform_id, p.name AS platform_name,
         c.agency_id, a.name AS agency_name,
         c.tableau_id, c.is_active,
         COALESCE(mc.photos,0), COALESCE(mc.videos,0), COALESCE(mc.photos,0)+COALESCE(mc.videos,0),
         c.created_at, c.updated_at
  FROM clients c
  LEFT JOIN platforms p ON p.id = c.platform_id
  LEFT JOIN agencies  a ON a.id = c.agency_id
  LEFT JOIN media_counts mc ON mc.client_id = c.id
  WHERE
    (p_filter_active = 'all'
       OR (p_filter_active = 'active'   AND c.is_active = true)
       OR (p_filter_active = 'archived' AND c.is_active = false))
    AND (p_filter_platform IS NULL OR c.platform_id = p_filter_platform)
    AND (
      (p_agency_id IS NOT NULL AND c.agency_id = p_agency_id)
      OR
      (p_agency_id IS NULL AND c.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id)))
    )
    AND (p_search IS NULL OR length(trim(p_search)) = 0
         OR lower(c.name) LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(COALESCE(c.alias, '')) LIKE '%' || lower(trim(p_search)) || '%')
  ORDER BY c.is_active DESC, lower(c.name) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_clients(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_clients(text, uuid, uuid, text) TO authenticated;
```

Аналогично сгенерировать секции для:
- `create_client` — добавить `PERFORM assert_agency_access(v_caller_id, p_agency_id);` после has_permission check (T.2)
- `update_client(p_client_id, p_name, p_alias, p_description, p_avatar_url, p_platform_id, p_agency_id, p_tableau_id)` — derive existing agency через `SELECT agency_id INTO v_existing_agency FROM clients WHERE id = p_client_id;` + assert на v_existing_agency. Если в `p_agency_id` приходит **другое** агентство (move client) — assert на p_agency_id тоже. Это допустимый сценарий только для admin/superadmin.
- `archive_client(p_client_id)` — T.3, assert на agency_id клиента
- `restore_client(p_client_id)` — T.3
- `get_client_detail(p_client_id)` — T.3 (read), без mutation
- `list_client_activity(p_client_id, p_limit)` — T.3 (read)
- `list_unassigned_clients(p_team_id)` — T.1 (combined view by accessible_agencies)

> **Где брать существующие тела RPC:** для каждой функции сначала прочитай определение в `db/migrations/20260428_40_rpc_clients_crud_auth.sql` (clients CRUD) и `db/migrations/20260425_22_rpc_teams_clients.sql` (list_unassigned_clients). Скопируй existing body, добавь assert/scoping, не меняй прочую логику.

- [ ] **Step 2: Apply migration in Studio.**

После apply — выполнить sanity check:
```sql
-- Должна работать без agency (combined view возвращает []):
SELECT * FROM list_clients() LIMIT 5;
-- Должна работать с конкретным agency (под superadmin):
SELECT * FROM list_clients(p_agency_id := (SELECT id FROM agencies LIMIT 1));
-- Должна упасть 42501 если agency не доступен (тест под обычным admin без attribute):
-- SELECT * FROM list_clients(p_agency_id := 'unknown-agency-uuid');
```

### Task 6.2: Frontend callsite sweep — clients RPC

- [ ] **Step 1: Find all clients RPC callsites**

```bash
grep -rln "rpc('\(create_client\|list_clients\|update_client\|archive_client\|restore_client\|get_client_detail\|list_client_activity\|list_unassigned_clients\)" src/
```

- [ ] **Step 2: Update each callsite to pass `p_agency_id`**

Для каждого найденного файла:
- Добавить `import { useAgencyContext } from '../lib/agencyContext';`
- В компоненте: `const { activeAgencyId } = useAgencyContext();`
- В rpc-вызове: добавить `p_agency_id: activeAgencyId` (для list/read где допустим NULL → combined view)
- Для `create_client` форм — agency_id берётся из формы, не из контекста (см. Stage 11)

Пример:
```diff
+ import { useAgencyContext } from '../lib/agencyContext';
  ...
+ const { activeAgencyId } = useAgencyContext();
  ...
  const { data, error } = await supabase.rpc('list_clients', {
    p_filter_active: 'active',
+   p_agency_id: activeAgencyId,
    p_search,
  });
```

- [ ] **Step 3: Find and update mocks in tests**

```bash
grep -rln "list_clients\|create_client\|update_client" src/**/*.test.{js,jsx}
```

Для каждого теста — обновить mock RPC payload (добавить `p_agency_id` в expected args, если тест на это assert-ит).

- [ ] **Step 4: Run all tests**

Run: `npm test -- --run`
Expected: full suite passes.

- [ ] **Step 5: Commit Stage 6**

```bash
git add db/migrations/20260429_60_*.sql src/
git commit -m "$(cat <<'EOF'
feat(rpc): scope clients bucket to agency context

Stage 6 of multi-agency scoping. All clients RPCs now require/respect
p_agency_id; combined view returns clients across user's accessible
agencies. Frontend callsites pass activeAgencyId from AgencyContext.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 7 — Bucket: Teams + members + curatorship

**Files:**
- Create: `db/migrations/20260429_61_rpc_teams_agency_scoping.sql`
- Modify: соответствующие frontend файлы (teams pages/components, tests)

**RPCs in bucket:**
- `create_team(p_name, p_lead_user_id)` → добавить `p_agency_id`, T.2 + T.4 (lead должен быть из этого же agency)
- `list_teams(p_active)` → T.1, добавить `p_agency_id` parameter
- `update_team`, `archive_team`, `restore_team` → T.3
- `add_team_member(p_team_id, p_operator_id)` → T.4 (team.agency = operator.agency)
- `remove_team_member(p_team_id, p_operator_id)` → T.3 (assert по team)
- `assign_team_clients(p_team_id, p_client_ids)` → T.4 (team.agency = each client.agency)
- `set_team_lead(p_team_id, p_lead_user_id)` → T.4
- `assign_moderator_to_operator(p_moderator_id, p_operator_id)` → T.4 (оба из одного agency)
- `remove_moderator_from_operator(p_moderator_id, p_operator_id)` → T.3
- `list_active_teams_for_assignment()` → T.1
- `list_assignable_users(p_role)` → T.1 (фильтр по accessible_agencies)

### Task 7.1: SQL migration for teams bucket

- [ ] **Step 1: Read existing definitions**

Прочитать:
- `db/migrations/20260428_43_rpc_teams_crud_auth.sql` (teams CRUD post-Stage 14)
- `db/migrations/20260425_21_rpc_teams_members.sql` (members)
- `db/migrations/20260425_22_rpc_teams_clients.sql` (clients)
- `db/migrations/20260425_23_rpc_curatorship.sql` (moderator-operator)
- `db/migrations/20260425_26_rpc_staff_views.sql` (list_assignable_users, list_active_teams_for_assignment)

- [ ] **Step 2: Create migration file**

`db/migrations/20260429_61_rpc_teams_agency_scoping.sql`:

Структура: 12 секций по числу RPC. Каждая — DROP старой сигнатуры (где нужно), CREATE новой с assert/scoping.

Особенности:
- `create_team`: p_agency_id NOT NULL; assert; lead user (`p_lead_user_id`) — проверь что `agency_id` совпадает (T.4)
- `add_team_member`, `assign_team_clients`, `set_team_lead`, `assign_moderator_to_operator` — все через T.4 (cross-resource invariant)
- `list_assignable_users` — фильтрует по accessible_agencies для caller (combined-view-aware)

Полный код по образцу `list_clients` из Stage 6.

- [ ] **Step 3: Apply + sanity check.**

```sql
-- Под superadmin создать тестовое агентство и команду:
WITH ag AS (INSERT INTO agencies (name, platform_id) VALUES ('TestT', (SELECT id FROM platforms LIMIT 1)) RETURNING id)
SELECT create_team('Команда 1', NULL, (SELECT id FROM ag));
SELECT * FROM list_teams(p_agency_id := (SELECT id FROM agencies WHERE name = 'TestT'));
```

### Task 7.2: Frontend callsite sweep — teams RPC

- [ ] **Step 1: Find callsites**

```bash
grep -rln "rpc('\(create_team\|list_teams\|update_team\|archive_team\|restore_team\|add_team_member\|remove_team_member\|assign_team_clients\|set_team_lead\|assign_moderator_to_operator\|remove_moderator_from_operator\|list_active_teams_for_assignment\|list_assignable_users\)" src/
```

- [ ] **Step 2: Update each — добавить `p_agency_id: activeAgencyId` где RPC scoped.**

- [ ] **Step 3: Update test mocks.**

- [ ] **Step 4: Run tests + commit**

```bash
npm test -- --run
git add db/migrations/20260429_61_*.sql src/
git commit -m "$(cat <<'EOF'
feat(rpc): scope teams/members/curatorship bucket to agency context

Stage 7 of multi-agency scoping. Teams require agency_id at creation;
all team-member and team-client invariants enforce same-agency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 8 — Bucket: Staff/users RPC

**Files:**
- Create: `db/migrations/20260429_62_rpc_staff_agency_scoping.sql`
- Modify: соответствующие frontend файлы (StaffListPage, StaffDetailPanel, etc.)

**RPCs in bucket:**
- `create_user_admin(p_email, p_first_name, p_last_name, p_alias, p_timezone, p_admin_agencies uuid[])` → новый параметр agency_ids; insert + populate admin_agencies
- `create_user_operator/moderator/teamlead(...)` → добавить `p_agency_id` NOT NULL; assert
- `list_staff(p_role_filter, p_active)` → T.1 + `p_agency_id` (combined-view)
- `update_user_*` → T.3 (resolve agency via dashboard_users.agency_id; admin сменить agency не может, только superadmin)
- `deactivate_staff(p_user_id)` → T.3
- (Если будет добавлен `activate_staff` — отдельная задача в follow-up bug, см. spec Open Items)

### Task 8.1: SQL migration for staff bucket

- [ ] **Step 1: Read existing definitions**

`db/migrations/20260428_44_rpc_staff_auth.sql` (полный список текущих staff RPC).

- [ ] **Step 2: Create migration file**

`db/migrations/20260429_62_rpc_staff_agency_scoping.sql`:

Особенности:
- `create_user_admin` — теперь принимает массив `p_admin_agencies uuid[]` (минимум одно агентство при создании). После INSERT в dashboard_users — INSERT в admin_agencies для каждого id.
- `create_user_operator/moderator/teamlead` — теперь принимают `p_agency_id uuid NOT NULL`. assert(caller, p_agency_id). INSERT с этим agency_id.
- `update_user_*` (для не-admin ролей) — agency_id readonly, change запрещён. Если RPC принимает `p_agency_id` и он отличается от текущего → 23514 (или allow только для superadmin).
- `list_staff` — добавить `p_agency_id` (combined view), вернуть колонку agency_id и agency_name в TABLE.

```sql
-- Пример секции для create_user_operator:
DROP FUNCTION IF EXISTS public.create_user_operator(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_user_operator(
  p_email      text,
  p_first_name text,
  p_last_name  text,
  p_alias      text,
  p_timezone   text,
  p_agency_id  uuid           -- NEW required
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_new_id    integer;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id USING errcode = '42501';
  END IF;
  IF p_agency_id IS NULL THEN RAISE EXCEPTION 'agency_id is required'; END IF;
  PERFORM assert_agency_access(v_caller_id, p_agency_id);

  INSERT INTO dashboard_users (email, first_name, last_name, alias, role, timezone, agency_id, created_by, is_active)
  VALUES (lower(trim(p_email)), trim(p_first_name), trim(p_last_name),
          NULLIF(trim(p_alias), ''), 'operator', COALESCE(p_timezone, 'Europe/Kiev'),
          p_agency_id, v_caller_id, true)
  RETURNING id INTO v_new_id;

  -- existing post-create logic (refcode, default permissions): копируется из старого определения
  -- ...

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_operator(text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_operator(text, text, text, text, text, uuid) TO authenticated;
```

Аналогично для `create_user_moderator`, `create_user_teamlead`, `create_user_admin` (с массивом agencies).

- [ ] **Step 3: Apply + sanity check.**

### Task 8.2: Frontend callsite sweep — staff RPC

Аналогично Stage 6/7 Task X.2 — найти, обновить, тесты, коммит.

```bash
git add db/migrations/20260429_62_*.sql src/
git commit -m "$(cat <<'EOF'
feat(rpc): scope staff/user-CRUD bucket to agency context

Stage 8 of multi-agency scoping. create_user_operator/moderator/teamlead
require p_agency_id; create_user_admin takes array of agency_ids and
populates admin_agencies. list_staff combined-view aware.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 9 — Bucket: Tasks RPC

**Files:**
- Create: `db/migrations/20260429_63_rpc_tasks_agency_scoping.sql`
- Modify: соответствующие frontend файлы.

**RPCs in bucket:**
- `create_task(...)` → задача связана с client (tasks.client_id?) или просто с user. Прочитать `db/migrations/20260426_27_tasks_schema.sql` чтобы понять связь.
- `list_tasks(...)` → T.1 (combined view)
- `take_task_in_progress`, `cancel_task`, `delete_task`, `submit_task_report`, `count_overdue_tasks` → T.3 / T.1

> **Domain check before writing:** прочитать `db/migrations/20260426_27_tasks_schema.sql` и определить, через какую сущность task привязан к agency:
> - Если task → client → agency → используем `clients.agency_id` для derive
> - Если task → user (assignee/creator) → используем `dashboard_users.agency_id`
> - Если task свободен от agency (cross-agency) — нужна архитектурная поправка: добавить `tasks.agency_id` напрямую

Базовое предположение: tasks привязан к assignee (`tasks.assigned_to`) → его agency_id определяет agency задачи. Это значит: для admin (multi-agency) видим задачи всех его agencies (combined view), для operator — только свои.

### Task 9.1: SQL migration for tasks bucket

- [ ] **Step 1: Read tasks schema** (`db/migrations/20260426_27_tasks_schema.sql`).

- [ ] **Step 2: Решить как scoping реализовать**

Если task имеет `client_id` → use `clients.agency_id`. Если только `assigned_to` → use `dashboard_users.agency_id`. Если оба — выбрать первое (через client) и в RPC проверять оба.

> **Если нужен `tasks.agency_id`** — добавить в эту миграцию ALTER TABLE + backfill (на момент Stage 9 в `tasks` уже 0 строк после Stage 2 cleanup → backfill не нужен, просто `NOT NULL`).

- [ ] **Step 3: Create migration file** аналогично Stage 6/7/8.

- [ ] **Step 4: Apply + sanity check.**

### Task 9.2: Frontend callsite sweep — tasks RPC

Аналогично прочим bucket стадиям.

```bash
git add db/migrations/20260429_63_*.sql src/
git commit -m "$(cat <<'EOF'
feat(rpc): scope tasks bucket to agency context

Stage 9 of multi-agency scoping. Tasks scoped via assignee (or client)
agency. Combined-view aware list_tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 10 — UI: combined view + agency column on list pages

**Files:**
- Modify: `src/pages/ClientListPage.jsx` (или эквивалент) — добавить колонку Agency, фильтр
- Modify: `src/pages/TeamListPage.jsx`
- Modify: `src/pages/StaffListPage.jsx`
- Modify: `src/pages/TaskListPage.jsx`
- Update tests для каждой страницы

### Task 10.1: ClientListPage — agency column + filter

- [ ] **Step 1: Open file, identify table structure**

`src/pages/ClientListPage.jsx` (точное имя из Subplan 6A4 / 6B4).

- [ ] **Step 2: Add agency column to table**

В заголовке таблицы:
```jsx
<th>Агентство</th>
```

В строке (где `client.agency_name` уже приходит из RPC):
```jsx
<td>{client.agency_name}</td>
```

- [ ] **Step 3: Conditional rendering — show only for multi-agency users**

```jsx
import { useAgencyContext } from '../lib/agencyContext';
const { isMultiAgency } = useAgencyContext();
// ...
{isMultiAgency && <th>Агентство</th>}
{isMultiAgency && <td>{client.agency_name}</td>}
```

- [ ] **Step 4: Add agency filter dropdown above table (multi-agency only)**

```jsx
{isMultiAgency && (
  <select
    value={agencyFilter ?? ''}
    onChange={(e) => setAgencyFilter(e.target.value || null)}
    className="..."
  >
    <option value="">Все агентства</option>
    {availableAgencies.map((a) => (
      <option key={a.id} value={a.id}>{a.name}</option>
    ))}
  </select>
)}
```

- [ ] **Step 5: RPC call respects filter**

```jsx
const agencyForRpc = agencyFilter ?? activeAgencyId; // если фильтр выбран — он; иначе context (combined view = null)
const { data } = await supabase.rpc('list_clients', { ..., p_agency_id: agencyForRpc });
```

> Для combined view логика: если `agencyFilter === ''` (Все) → `null` → RPC возвращает все доступные. Если выбран конкретный → передаём его id.

- [ ] **Step 6: Tests update + run.**

### Task 10.2-10.4: Apply same pattern to TeamListPage, StaffListPage, TaskListPage

Каждый аналогично 10.1 — добавить column + filter + RPC param. Skip column для single-agency users.

- [ ] **Step Final: Commit Stage 10**

```bash
git add src/pages/
git commit -m "$(cat <<'EOF'
feat(ui): combined-view list pages with agency column + filter

Stage 10 of multi-agency scoping. Clients, teams, staff, tasks lists
show agency column and filter dropdown for multi-agency users; hidden
for single-agency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 11 — UI: agency dropdown in create forms

**Files:**
- Modify: `src/components/clients/ClientCreateForm.jsx` (или эквивалент) — agency dropdown
- Modify: `src/components/teams/TeamCreateForm.jsx`
- Modify: `src/components/staff/StaffCreateForm.jsx` (для operator/moderator/teamlead)
- Modify: `src/components/staff/AdminCreateForm.jsx` (для admin — multi-select agencies)
- Update tests

### Task 11.1: AgencySelect reusable component

- [ ] **Step 1: Write component test**

`src/components/AgencySelect.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgencySelect from './AgencySelect';

const mockCtx = vi.fn();
vi.mock('../lib/agencyContext', () => ({ useAgencyContext: () => mockCtx() }));

describe('AgencySelect', () => {
  it('hides itself when user has only one agency and uses that id', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [{ id: 'a1', name: 'A' }],
      isMultiAgency: false,
    });
    const onChange = vi.fn();
    const { container } = render(<AgencySelect value={null} onChange={onChange} />);
    expect(container.querySelector('select')).toBeNull();
    expect(onChange).toHaveBeenCalledWith('a1'); // auto-set
  });

  it('renders dropdown when multi-agency', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'A' },
        { id: 'a2', name: 'B' },
      ],
      isMultiAgency: true,
    });
    render(<AgencySelect value="a1" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'A' })).toBeInTheDocument();
  });

  it('calls onChange with selected agency id', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }],
      isMultiAgency: true,
    });
    const onChange = vi.fn();
    render(<AgencySelect value="a1" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a2' } });
    expect(onChange).toHaveBeenCalledWith('a2');
  });
});
```

- [ ] **Step 2: Run (fail), implement, run (pass)**

`src/components/AgencySelect.jsx`:
```jsx
import { useEffect } from 'react';
import { useAgencyContext } from '../lib/agencyContext';

export default function AgencySelect({ value, onChange, disabled, required = true }) {
  const { availableAgencies, isMultiAgency } = useAgencyContext();

  useEffect(() => {
    if (!isMultiAgency && availableAgencies.length === 1 && value !== availableAgencies[0].id) {
      onChange(availableAgencies[0].id);
    }
  }, [availableAgencies, isMultiAgency, value, onChange]);

  if (!isMultiAgency) return null;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">Агентство{required && <span className="text-destructive">*</span>}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        required={required}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      >
        <option value="" disabled>Выберите агентство</option>
        {availableAgencies.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}
```

### Task 11.2: Embed `AgencySelect` in client/team/staff create forms

- [ ] **Step 1: ClientCreateForm**

```jsx
import AgencySelect from '../AgencySelect';
const [agencyId, setAgencyId] = useState(null);
// в форме:
<AgencySelect value={agencyId} onChange={setAgencyId} />
// в submit:
await supabase.rpc('create_client', { ..., p_agency_id: agencyId });
```

- [ ] **Step 2: TeamCreateForm** — аналогично.

- [ ] **Step 3: StaffCreateForm (operator/moderator/teamlead)** — аналогично.

- [ ] **Step 4: AdminCreateForm — multi-select**

Для роли `admin` нужен **multi-select** (несколько агентств за раз). Использовать `<select multiple>` или checkbox-list. Передавать массив:
```jsx
await supabase.rpc('create_user_admin', { ..., p_admin_agencies: selectedAgencyIds });
```

- [ ] **Step 5: Run all tests + commit**

```bash
git add src/components/
git commit -m "$(cat <<'EOF'
feat(ui): agency dropdown in create forms (AgencySelect + admin multi-select)

Stage 11 of multi-agency scoping. Forms hide selector for single-agency
users (auto-set value); admin creation accepts multiple agencies.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 12 — UI: /admin/agencies page

**Files:**
- Create: `src/pages/AdminAgenciesPage.jsx`
- Create: `src/components/agencies/AgencyTable.jsx`
- Create: `src/components/agencies/AgencyCreateModal.jsx`
- Create: `src/components/agencies/AgencyAdminAssignmentModal.jsx`
- Modify: `src/AdminLayout.jsx` (добавить ссылку на /admin/agencies в superadmin nav)
- Modify: `src/App.jsx` (добавить route)

### Task 12.1: AdminAgenciesPage — table + create modal

- [ ] **Step 1: Write page**

`src/pages/AdminAgenciesPage.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../useAuth';
import AgencyTable from '../components/agencies/AgencyTable';
import AgencyCreateModal from '../components/agencies/AgencyCreateModal';

export default function AdminAgenciesPage() {
  const { user } = useAuth();
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  if (user?.role !== 'superadmin') {
    return <div className="p-6 text-destructive">Доступ только для superadmin</div>;
  }

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_all_agencies');
    if (error) console.error(error);
    setAgencies(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Агентства</h1>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">+ Новое агентство</button>
      </div>
      {loading ? <p>Загрузка...</p> : <AgencyTable agencies={agencies} onChange={reload} />}
      {createOpen && (
        <AgencyCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reload(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: AgencyTable component**

`src/components/agencies/AgencyTable.jsx`:
```jsx
import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import AgencyAdminAssignmentModal from './AgencyAdminAssignmentModal';

export default function AgencyTable({ agencies, onChange }) {
  const [editing, setEditing] = useState(null);

  const archive = async (id) => {
    if (!confirm('Архивировать агентство? У него не должно быть активных пользователей или клиентов.')) return;
    const { error } = await supabase.rpc('archive_agency', { p_agency_id: id });
    if (error) { alert(error.message); return; }
    onChange();
  };

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Название</th>
            <th>Платформа</th>
            <th>Админы</th>
            <th>Сотрудники</th>
            <th>Клиенты</th>
            <th>Команды</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {agencies.map((a) => (
            <tr key={a.id} className="border-b hover:bg-accent/50">
              <td className="py-2">{a.name}</td>
              <td>{a.platform_name}</td>
              <td>{a.admin_count}</td>
              <td>{a.user_count}</td>
              <td>{a.client_count}</td>
              <td>{a.team_count}</td>
              <td>{a.is_active ? 'Активно' : 'Архив'}</td>
              <td className="space-x-2">
                <button onClick={() => setEditing(a)} className="text-primary text-xs">Админы</button>
                {a.is_active && <button onClick={() => archive(a.id)} className="text-destructive text-xs">Архивировать</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <AgencyAdminAssignmentModal
          agency={editing}
          onClose={() => setEditing(null)}
          onChanged={() => { setEditing(null); onChange(); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: AgencyCreateModal**

`src/components/agencies/AgencyCreateModal.jsx`:
```jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

export default function AgencyCreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('platforms').select('id, name').order('name');
      setPlatforms(p ?? []);
      // list admins (через list_staff с фильтром role=admin — потребует scope-aware RPC; для simplicity SELECT прямо)
      const { data: a } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin').eq('is_active', true).order('email');
      setAdmins(a ?? []);
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    const { error } = await supabase.rpc('create_agency', {
      p_name: name,
      p_platform_id: platformId,
      p_admin_ids: selectedAdminIds,
    });
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    onCreated();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Новое агентство</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Название*</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
                   className="w-full rounded-md border px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium">Платформа*</label>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} required
                    className="w-full rounded-md border px-3 py-1.5 text-sm">
              <option value="" disabled>—</option>
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Админы (опционально)</label>
            <select multiple value={selectedAdminIds.map(String)}
                    onChange={(e) => setSelectedAdminIds([...e.target.selectedOptions].map((o) => parseInt(o.value, 10)))}
                    className="w-full rounded-md border px-3 py-1.5 text-sm h-24">
              {admins.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm">Отмена</button>
            <button type="submit" disabled={submitting} className="btn-primary">Создать</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: AgencyAdminAssignmentModal** — список текущих админов агентства + add/remove.

`src/components/agencies/AgencyAdminAssignmentModal.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function AgencyAdminAssignmentModal({ agency, onClose, onChanged }) {
  const [allAdmins, setAllAdmins] = useState([]);
  const [assigned, setAssigned] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: admins } = await supabase
        .from('dashboard_users').select('id, email')
        .eq('role', 'admin').eq('is_active', true).order('email');
      setAllAdmins(admins ?? []);

      const { data: links } = await supabase
        .from('admin_agencies').select('admin_id').eq('agency_id', agency.id);
      setAssigned(new Set((links ?? []).map((l) => l.admin_id)));
    })();
  }, [agency.id]);

  const toggle = async (adminId) => {
    if (busy) return;
    setBusy(true);
    if (assigned.has(adminId)) {
      const { error } = await supabase.rpc('remove_admin_from_agency',
        { p_admin_id: adminId, p_agency_id: agency.id });
      if (!error) {
        const next = new Set(assigned); next.delete(adminId); setAssigned(next);
      }
    } else {
      const { error } = await supabase.rpc('assign_admin_to_agency',
        { p_admin_id: adminId, p_agency_id: agency.id });
      if (!error) setAssigned(new Set(assigned).add(adminId));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Админы агентства «{agency.name}»</h2>
        <ul className="space-y-1 max-h-64 overflow-auto">
          {allAdmins.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-1 px-2 hover:bg-accent rounded">
              <span className="text-sm">{a.email}</span>
              <input type="checkbox" checked={assigned.has(a.id)} onChange={() => toggle(a.id)} disabled={busy}/>
            </li>
          ))}
        </ul>
        <div className="flex justify-end pt-4">
          <button onClick={() => { onChanged(); onClose(); }} className="btn-primary">Готово</button>
        </div>
      </div>
    </div>
  );
}
```

> Note: используем прямой `from('admin_agencies').select('admin_id')` — таблица доступна authenticated через RLS (но revoked PUBLIC). Если RLS заблокирует — заменить на RPC `list_agency_admins(p_agency_id)`. Решить во время implementation: проверить ошибку, при необходимости добавить RPC.

### Task 12.2: Add route and nav link

- [ ] **Step 1: Add route in App.jsx**

```diff
+ const AdminAgenciesPage = lazy(() => import('./pages/AdminAgenciesPage'));
  ...
+ <Route path="/admin/agencies" element={<AdminAgenciesPage />} />
```

- [ ] **Step 2: Add link in AdminLayout.jsx**

```diff
  <NavLink to="/admin/platforms">Платформы</NavLink>
+ <NavLink to="/admin/agencies">Агентства</NavLink>
```

> Внимание: в `AdminLayout.jsx` уже может быть `AgenciesSection` (legacy) — заменить ссылку или удалить старый компонент. Проверить во время implementation.

- [ ] **Step 3: Manual smoke test in dev**

Залогиниться superadmin → `/admin/agencies` → создать тестовое агентство → назначить admin → выйти и зайти под admin → проверить что агентство появилось в `availableAgencies` (через DevTools/console.log в AgencyContext).

- [ ] **Step 4: Commit Stage 12**

```bash
git add src/pages/AdminAgenciesPage.jsx src/components/agencies/ src/AdminLayout.jsx src/App.jsx
git commit -m "$(cat <<'EOF'
feat(ui): /admin/agencies page for superadmin agency CRUD + admin assignment

Stage 12 of multi-agency scoping. Superadmin can create, archive
agencies and toggle admin assignments via checkbox modal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 13 — Manual QA + cutover

### Task 13.1: Smoke matrix

Run dev server (`npm run dev`). Залогиниться по очереди под разными ролями и пройти:

| Роль | Сценарий | Ожидаемое |
|---|---|---|
| superadmin | `/admin/agencies` — create, rename, archive | Видит список, операции работают |
| superadmin | Создать admin, привязать к 2 агентствам | В `dashboard_users` + `admin_agencies` 2 записи |
| superadmin | `/clients` (combined view) | Видит клиентов всех агентств; колонка Agency |
| admin (1 agency) | Логин | switcher невидим, agency column невидима |
| admin (1 agency) | `/clients` create | agency dropdown скрыт, agency_id auto-set |
| admin (multi) | Switcher на dashboard | Переключение работает, статистика обновляется |
| admin (multi) | `/clients` filter по agency | Список фильтруется |
| admin (multi) | Create client → выбрать agency | Клиент создан в правильном agency |
| operator | Логин | Switcher и filter невидимы |
| operator | Попытка вызвать list_clients другого agency через DevTools | RPC возвращает 42501 |

### Task 13.2: Security regression

Под каждой ролью попробовать через DevTools:
```js
await supabase.rpc('list_clients', { p_agency_id: '<id чужого agency>' })
// Expected: error 42501

await supabase.rpc('create_client', {
  p_name: 'X', p_platform_id: '...', p_agency_id: '<id чужого agency>', ...
})
// Expected: error 42501
```

### Task 13.3: Update memory + ROADMAP

- [ ] **Step 1: Update memory entry**

Дополнить `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_db_schema.md` (или соответствующий файл) — что появилась изоляция по agency, agency_id колонки, admin_agencies junction.

- [ ] **Step 2: Add roadmap entry**

В соответствующем roadmap memory зафиксировать что multi-agency scoping завершён.

### Task 13.4: Open PR

```bash
gh auth switch --user clubmonaco2017-ops  # см. memory project_gh_auth.md
gh pr create --title "feat: multi-agency scoping (admin many-to-many, operator/moderator/teamlead pinned)" --body "$(cat <<'EOF'
## Summary
- Admin → many agencies (junction table admin_agencies)
- Operator/moderator/teamlead → strictly one agency (FK + CHECK)
- Superadmin owns agency CRUD via /admin/agencies
- Combined view on list pages (clients/teams/staff/tasks) for multi-agency users
- Agency switcher on dashboard for multi-agency users
- Test data wiped (kept superadmin vedvoy@gmail.com + agencies + platforms)

## Test plan
- [ ] Superadmin: create/rename/archive agency
- [ ] Superadmin: assign/remove admins to agencies
- [ ] Admin (multi-agency): switcher works on dashboard, statistics filter
- [ ] Admin (multi-agency): combined view + filter on list pages
- [ ] Admin (1 agency): no switcher, no agency column, no agency dropdown
- [ ] Operator: cannot access other agency's data (DevTools probe)
- [ ] CHECK constraint: cannot create operator without agency_id
- [ ] cross-agency invariant: cannot add operator to team of different agency

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 13.5: Merge

После approve в PR — merge через GitHub UI. Затем `git checkout main && git pull origin main && git worktree remove ../operator-dashboard-multi-agency`.

---

## Self-Review Checklist (для автора плана — выполнить после написания)

**Spec coverage:**
- [x] Roles & agency relationships (Stages 1, 2, 8) — admin many-to-many, non-admin pinned
- [x] DB schema: admin_agencies, agency_id columns, CHECK (Stage 1)
- [x] assert_agency_access helper (Stage 1)
- [x] accessible_agencies helper (Stage 1)
- [x] Agency context model: client (Stage 4) + RPC parameter (Stages 6-9)
- [x] RPC categories 1-4 (scoped/user-scoped/user-creation/superadmin) — Stages 3, 6, 7, 8, 9
- [x] get_current_user_profile extended (Stage 3)
- [x] UI: switcher (Stage 5), combined view (Stage 10), agency dropdown forms (Stage 11), /admin/agencies (Stage 12)
- [x] Visual indicators only for multi-agency (Stage 5: switcher hidden, Stage 10: column hidden)
- [x] Permission model — admin perms scoped via assert_agency_access (covered implicitly in T templates)
- [x] Defense in depth: assert_agency_access in RPC, INSERT pins agency_id, useAgencyContext throws — covered in templates
- [x] Migration: cleanup test data (Stage 2)
- [x] Testing strategy: pgTAP — нет в проекте; sanity SQL queries в каждой stage; unit/component tests в Stages 4, 5, 11; manual QA matrix Stage 13

**Open Items не покрытые планом (явно отложены спекой):**
- /staff activate toggle bug — отдельная задача (already spawned)
- Совместная статистика «все мои агентства» для admin — будущая итерация
- Архивация агентства — done (Stage 3 archive_agency с проверкой что нет активных users/clients)
- CSV/экспорт статистики — текущий план не покрывает (нет упоминания в spec бизнес-фичей)

**Type/signature consistency:**
- `accessible_agencies(integer) RETURNS TABLE(agency_id uuid)` — used consistently across Stages 1-9
- `assert_agency_access(integer, uuid) RETURNS void` — used consistently
- `p_agency_id uuid` — naming consistent across all bucket stages
- `availableAgencies` (jsonb in DB → array in TypeScript) — consistent
- `useAgencyContext()` returns `{ availableAgencies, activeAgencyId, setActiveAgency, isMultiAgency, activeAgency }` — consistent across Stages 4, 5, 10, 11

**Placeholder scan:** план содержит явные команды Stage 9 ("прочитать tasks schema перед написанием") — это **не TBD**, это требование сделать домен-чек, поскольку schema tasks может варьироваться (через client_id или assigned_to). Допустимо как осознанная развилка.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-multi-agency-scoping.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Я диспатчу свежий subagent на каждую таску, делаю review между шагами, быстрая итерация

**2. Inline Execution** — Выполняем таски в этой сессии через executing-plans, batch execution с checkpoint-ами для review

**Какой подход выбираешь?**
