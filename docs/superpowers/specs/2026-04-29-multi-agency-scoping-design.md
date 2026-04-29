# Multi-Agency Scoping — Design

**Date:** 2026-04-29
**Status:** Approved (pending user review)
**Author:** Brainstorm session, Artem + Claude

## Problem

CRM сейчас работает в едином глобальном пространстве: один `superadmin`, несколько глобальных `admin`-ов, все видят всех клиентов, все команды, всех сотрудников. Бизнес-модель меняется — каждое агентство должно быть изолировано: у агентства свои сотрудники (operator/moderator/teamlead), свои команды, свои клиенты, своя статистика. Один реальный администратор может вести **несколько агентств**, поэтому admin-ы привязываются к агентствам через many-to-many. Operators/moderators/teamleads привязаны строго к одному агентству.

## Goals

- Полная изоляция данных между агентствами (clients, teams, statistics, tasks)
- Admin может управлять несколькими агентствами под одним аккаунтом
- Operator/moderator/teamlead принадлежит ровно одному агентству
- Только superadmin создаёт агентства и назначает в них админов
- Минимум визуального шума: пользователи с одним агентством не видят никаких UI-элементов для переключения

## Non-Goals

- Мультиагентность для operator/moderator/teamlead (если человек работает в двух — два аккаунта)
- Иерархия агентств (parent/child) — каждое агентство плоское
- Cross-agency аналитика для admin-а — только superadmin может видеть все агентства разом

## Roles & Agency Relationships

| Роль | Связь с агентством |
|---|---|
| `superadmin` | Глобальная, видит всё, единственная роль которая создаёт агентства и назначает админов |
| `admin` | Many-to-many через `admin_agencies`. `dashboard_users.agency_id = NULL` |
| `teamlead` | Ровно одно агентство, FK `dashboard_users.agency_id NOT NULL` |
| `moderator` | Ровно одно агентство, FK `dashboard_users.agency_id NOT NULL` |
| `operator` | Ровно одно агентство, FK `dashboard_users.agency_id NOT NULL` |

Если один реальный сотрудник работает в двух агентствах — заводится два отдельных аккаунта.

## Database Schema

### Новая таблица: `admin_agencies`

```sql
CREATE TABLE admin_agencies (
  admin_id     integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  agency_id    uuid    NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  integer NOT NULL REFERENCES dashboard_users(id),
  PRIMARY KEY (admin_id, agency_id)
);

CREATE INDEX admin_agencies_agency_idx ON admin_agencies(agency_id);
```

### Изменения существующих таблиц

```sql
-- dashboard_users: nullable agency_id (NULL для admin/superadmin)
ALTER TABLE dashboard_users
  ADD COLUMN agency_id uuid REFERENCES agencies(id);

-- Условный NOT NULL: agency_id обязателен для всех ролей кроме admin/superadmin
ALTER TABLE dashboard_users
  ADD CONSTRAINT dashboard_users_agency_required
  CHECK (
    (role IN ('admin', 'superadmin') AND agency_id IS NULL)
    OR (role IN ('operator', 'moderator', 'teamlead') AND agency_id IS NOT NULL)
  );

CREATE INDEX dashboard_users_agency_idx ON dashboard_users(agency_id);

-- teams: NOT NULL agency_id
ALTER TABLE teams
  ADD COLUMN agency_id uuid NOT NULL REFERENCES agencies(id);

CREATE INDEX teams_agency_idx ON teams(agency_id);
```

`clients.agency_id` уже существует — без изменений.

### Инварианты

- Команда (`teams`) и её участники (`team_members.operator_id`) должны быть из одного агентства — проверка в RPC `assign_operator_to_team`
- Команда и её клиенты (`team_clients.client_id`) должны быть из одного агентства — проверка в RPC `assign_client_to_team`
- Modemoderator-operator связь (`moderator_operators`) — оба из одного агентства

## Agency Context Model

### Клиент (React)

- **`AgencyContext`** обёртка поверх `AuthContext`:
  - `availableAgencies: Array<{id, name}>` — список агентств, доступных пользователю
  - `activeAgencyId: string | null` — текущее активное (для статистики и форм создания)
  - `setActiveAgency(id)` — переключение
  - `isMultiAgency: boolean` — `availableAgencies.length > 1`
- **Источник `availableAgencies`:**
  - superadmin → все активные агентства
  - admin → агентства из `admin_agencies` (приходят в `get_current_user_profile`)
  - operator/moderator/teamlead → массив из одного агентства (своё)
- **Персистентность:** `activeAgencyId` в `localStorage`. При логине проверяется, что значение всё ещё в `availableAgencies`; если нет — берётся первое.

### Сервер (PostgreSQL)

- **Активное агентство НЕ хранится в JWT** (JWT долгоживущий, переключение должно быть мгновенным).
- Передаётся явным параметром `p_agency_id` в каждый scoped RPC.
- Хелпер `assert_agency_access(user_id, agency_id)` валидирует доступ:

```sql
CREATE FUNCTION assert_agency_access(p_user_id int, p_agency_id uuid)
RETURNS void AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM dashboard_users WHERE id = p_user_id;

  IF v_role = 'superadmin' THEN RETURN; END IF;

  IF v_role = 'admin' THEN
    IF EXISTS (SELECT 1 FROM admin_agencies
               WHERE admin_id = p_user_id AND agency_id = p_agency_id)
      THEN RETURN; END IF;
    RAISE EXCEPTION 'admin % has no access to agency %', p_user_id, p_agency_id
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM dashboard_users
             WHERE id = p_user_id AND agency_id = p_agency_id)
    THEN RETURN; END IF;

  RAISE EXCEPTION 'user % has no access to agency %', p_user_id, p_agency_id
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## RPC Changes

### Категории RPC

**1. Scoped RPC** (большинство — clients, teams, members, statistics, tasks, etc.):
- Добавляется первый параметр `p_agency_id uuid DEFAULT NULL`
- Если `p_agency_id IS NOT NULL` → `PERFORM assert_agency_access(...)` + `WHERE agency_id = p_agency_id`
- Если `p_agency_id IS NULL` → возвращает данные **всех агентств доступных вызывающему** (для combined view на списочных страницах)
- INSERT/UPDATE — `agency_id` принудительно ставится из `p_agency_id` (не из тела запроса), чтобы клиент не мог подсунуть чужое

**2. User-scoped RPC** (без агентства):
- `get_current_user_profile`, `update_own_profile`, `change_password`, `signin`, `signout` — без изменений
- `get_current_user_profile` расширяется: возвращает `available_agencies: [{id, name}]`

**3. RPC создания пользователей** (admin создаёт operator/moderator/teamlead):
- Добавляется `p_agency_id uuid NOT NULL`
- `assert_agency_access(caller, p_agency_id)`
- `INSERT INTO dashboard_users (..., agency_id) VALUES (..., p_agency_id)`

**4. Новые RPC для superadmin** (управление агентствами):
- `create_agency(p_name text, p_admin_ids int[])`
- `update_agency(p_agency_id uuid, p_name text)`
- `archive_agency(p_agency_id uuid)`
- `assign_admin_to_agency(p_admin_id int, p_agency_id uuid)`
- `remove_admin_from_agency(p_admin_id int, p_agency_id uuid)`
- `list_all_agencies()` — superadmin only

Все эти RPC — `SECURITY DEFINER`, проверка `caller_role = 'superadmin'` в начале.

### Шаблон scoped RPC

```sql
CREATE OR REPLACE FUNCTION list_clients(p_agency_id uuid DEFAULT NULL)
RETURNS SETOF clients AS $$
DECLARE
  v_caller int := current_dashboard_user_id();
BEGIN
  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller, p_agency_id);

    IF NOT has_permission(v_caller, 'manage_clients')
       AND NOT EXISTS (
         SELECT 1 FROM team_clients tc
         JOIN team_members tm ON tm.team_id = tc.team_id
         WHERE tm.operator_id = v_caller AND tc.agency_id = p_agency_id
       ) THEN
      RAISE EXCEPTION 'no permission' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT * FROM clients WHERE agency_id = p_agency_id;
  ELSE
    -- Combined view: возвращаем данные всех агентств доступных caller
    RETURN QUERY
      SELECT c.* FROM clients c
      WHERE c.agency_id IN (
        SELECT agency_id FROM admin_agencies WHERE admin_id = v_caller
        UNION
        SELECT agency_id FROM dashboard_users WHERE id = v_caller
        UNION
        -- superadmin видит всё
        SELECT id FROM agencies WHERE EXISTS (
          SELECT 1 FROM dashboard_users WHERE id = v_caller AND role = 'superadmin'
        )
      );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Объём работы

- ~30-40 существующих RPC переписать (механический refactor: добавить параметр + assert + WHERE)
- 6-8 новых RPC для управления агентствами
- 1 новый хелпер `assert_agency_access`

## UI Changes

### 4.1. Переключатель агентства (admin с несколькими агентствами)

- Расположение: **в правом верхнем углу основной контентной области** (над содержимым страницы), не в шапке/сайдбаре
- Виден только если `availableAgencies.length > 1`
- Если одно агентство — никакого переключателя
- Используется в первую очередь на дашборде (для статистики); на списочных страницах — см. ниже

### 4.2. Поведение по типу страницы

| Страница | Admin (multi-agency) | Admin (single) / operator / moderator / teamlead |
|---|---|---|
| Дашборд | Switcher справа вверху → статистика по выбранному агентству | Без switcher, статистика по своему/единственному |
| /clients, /teams, /operators, /tasks | **Combined view**: список всех агентств, колонка «Агентство», фильтр сверху | Без колонки «Агентство», без фильтра |
| Формы создания (user, client, team) | Обязательный dropdown «Агентство» | Поле скрыто, агентство = свое/единственное |

### 4.3. Раздел superadmin: управление агентствами

**Новая страница `/admin/agencies`** (только для superadmin):
- Таблица: название, кол-во пользователей, кол-во клиентов, кол-во команд, дата создания, статус
- Создать / редактировать / архивировать агентство
- В детали: список админов агентства, добавление/удаление админов через `admin_agencies`

**Создание admin-а** (через тот же экран `/staff` или специальный) — superadmin при создании выбирает множество агентств (multi-select), к которым admin получит доступ.

### 4.4. Superadmin — работа с данными

- Гибрид: context switcher с опцией «Все агентства» (для глобального обзора)
- На дашборде «Все агентства» = агрегированная статистика
- На списочных страницах «Все агентства» = combined view без фильтра

### 4.5. Визуальные индикаторы (только для admin с несколькими агентствами)

- Имя текущего агентства в шапке/breadcrumb (`Агентство X / Команды`) — только когда контекст релевантен (дашборд, формы создания)
- Toast при переключении: «Переключено на агентство X»
- Для всех остальных пользователей — никаких agency-индикаторов

## Permissions Model

Существующие permissions (`manage_clients`, `manage_teams`, `manage_roles`, etc.) остаются у admin без изменений, но **действуют только в рамках агентств, к которым у admin есть доступ через `admin_agencies`**. Дополнительных проверок не нужно — это автоматически обеспечивается через `assert_agency_access` + scoping по `agency_id` во всех scoped RPC.

Defense in depth:
- БД: `assert_agency_access` в каждом scoped RPC
- БД: INSERT/UPDATE принудительно ставят `agency_id` из `p_agency_id`
- Клиент: хук `useAgencyContext()` throws если `activeAgencyId === null` для контекстных операций

## Data Migration

Поскольку система ещё не в проде и все данные тестовые:

**Шаг 1.** Очистка тестовых данных одной миграцией:
- Удалить всех `dashboard_users` кроме `vedvoy@gmail.com` (superadmin)
- Удалить всех `clients`, `teams`, `team_members`, `team_clients`, `moderator_operators`
- Сохранить `agencies` и `platforms` (валидны, заведены через админку)

**Шаг 2.** Применить новую схему (admin_agencies, agency_id колонки) сразу с финальными `NOT NULL`/`CHECK` constraint-ами.

**Шаг 3.** Переписать RPC прямо, без `_v2` шимов — single deployment, обратная совместимость не нужна.

**Шаг 4.** Выкатить новый UI (switcher, combined view, agency dropdown в формах).

**Шаг 5.** Superadmin через новый UI:
- Проверяет существующие agencies/platforms
- Создаёт админов и назначает им агентства
- Дальше уже админы создают своих сотрудников и клиентов

Без backfill, без старых данных.

## Open Items / Follow-ups

1. **Bug `/staff` activate toggle** (отдельная задача): RPC `activate_staff` не существует, тоггл `disabled={!is_active}` блокирует реактивацию. Фикс: добавить `activate_staff` RPC и убрать disabled. Не часть этого spec.
2. **Совместная статистика для multi-agency admin** — по умолчанию switcher показывает по одному; в будущем можно добавить «Все мои агентства» как опцию (как у superadmin). Пока не делаем.
3. **Архивация агентства** — поведение для активных пользователей/клиентов внутри: deactivate cascade или запрет архивации при наличии активных сущностей? Решить в плане.
4. **CSV/экспорт статистики** — должен учитывать активный agency context. Уточнить в плане.

## Testing Strategy

- **DB unit tests** (pgTAP): `assert_agency_access` для каждой комбинации (superadmin/admin/non-admin × accessible/non-accessible agency)
- **RPC tests:** для каждого scoped RPC проверить:
  1. Доступ к разрешённому агентству — успех
  2. Доступ к чужому — `42501`
  3. `p_agency_id = NULL` для admin → возвращает только его агентства
  4. INSERT не позволяет передать `agency_id` отличный от `p_agency_id`
- **E2E:** admin с двумя агентствами — переключение, формы создания, изоляция данных
- **E2E:** operator из агентства A не видит данных агентства B даже если каким-то образом получит ID

## Implementation Order

1. Schema migration (admin_agencies, agency_id columns, constraints)
2. `assert_agency_access` helper
3. Cleanup миграция тестовых данных
4. Новые RPC для superadmin (CRUD agencies, admin assignments)
5. Расширение `get_current_user_profile` (available_agencies)
6. Refactor existing RPC (по разделам: clients → teams → users → tasks → statistics)
7. UI: AgencyContext + switcher
8. UI: combined view на списочных страницах
9. UI: agency dropdown в формах создания
10. UI: страница `/admin/agencies` для superadmin
11. E2E тесты, ручной QA
