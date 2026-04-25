# CRM Subplan 4 — Teams + кураторство Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan stage-by-stage.

**Goal:** Implement teams (composition + lead) + кураторство (moderator ↔ operator) per [domain-model.md](../../domain-model.md) §3, §4.2 and [Subplan 4 Design Spec](../specs/2026-04-25-crm-subplan-4-teams-design.md). Add `/teams` master-detail page, extend `/staff/:refCode` with curator/team blocks, add Sidebar nav «Команды».

**Architecture:** master-detail UI вторит Subplan 3 Clients (переиспользуем паттерны: list/empty/filter/skeleton/slide-out/activity-card). 4 реляционные таблицы + 2 activity log. 16 RPC с scope-by-role permissions. Soft delete с cascade-освобождением members/clients. Кураторство — orthogonal к командам, обязательное для оператора.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, Supabase (PostgreSQL + RPC), Vitest, react-router-dom v7. **Без Claude Design loop'а — строим на существующих DS-токенах** ([D-10 в spec](../specs/2026-04-25-crm-subplan-4-teams-design.md)).

**Source of truth:**
- [docs/superpowers/specs/2026-04-25-crm-subplan-4-teams-design.md](../specs/2026-04-25-crm-subplan-4-teams-design.md) — все decisions, schema, RPC signatures, invariants.
- [docs/domain-model.md](../../domain-model.md) §3, §4.2, §6.4 — авторитет.
- [docs/superpowers/plans/2026-04-25-crm-subplan-3-clients.md](2026-04-25-crm-subplan-3-clients.md) — паттерны (структура plan'а, формат миграций, RPC stub'ы).

**Prerequisites:**
- Subplan 3 (Clients) merged в `main` ✓ (PR #16 squashed).
- Branch `feat/subplan-4-teams` будет создан в Stage 1.
- `.env.local` с `VITE_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_KEY` для применения миграций.

---

## File structure

### Create — DB

```
db/migrations/
  20260425_19_teams_schema.sql              # 4 relational + 2 activity log tables
  20260425_20_rpc_teams_crud.sql            # list/get/create/update/archive/restore + list_team_activity
  20260425_21_rpc_teams_members.sql         # add/remove/move + list_unassigned_operators
  20260425_22_rpc_teams_clients.sql         # assign/unassign/move + list_unassigned_clients
  20260425_23_rpc_curatorship.sql           # list_curated/set/bulk
  20260425_24_archive_user_extension.sql    # extend archive_user with cascade + lead/curator block
  20260425_25_seed_dev_teams.sql            # dev seed: 2 команды + кураторство
```

### Create — Lib

```
src/lib/
  teams.js                                  # pluralize, formatLeadRole, validators, permission helpers
  teams.test.js
```

### Create — Hooks

```
src/hooks/
  useTeamList.js            # filtered list with scope-by-role
  useTeam.js                # single team detail
  useTeamMembers.js         # composition mutations (add/remove/move)
  useTeamClients.js         # client assignments mutations
  useTeamActivity.js        # paginated activity feed
  useTeamActions.js         # create/update/archive/restore
  useUnassignedOperators.js # for AddMemberModal
  useUnassignedClients.js   # for AddClientsModal
  useCuratorship.js         # set/bulk for moderator_operators
  useUserTeamMembership.js  # для оператора — есть ли запись в team_members (Sidebar visibility)
```

### Create — Components (`src/components/teams/`)

```
TeamListPage.jsx                          # на самом деле в src/pages/, but listed here for context
TeamList.jsx, TeamListItem.jsx
TeamFilterChips.jsx
TeamDetailPanel.jsx
TeamMembersTab.jsx
TeamClientsTab.jsx
TeamActivityTab.jsx
CreateTeamSlideOut.jsx
AddMemberModal.jsx
AddClientsModal.jsx
ChangeLeadModal.jsx
ArchiveTeamConfirmDialog.jsx
EmptyZero.jsx, EmptyFilter.jsx
ReadOnlyBadge.jsx
```

### Create — Components (`src/components/staff/`)

```
CuratorBlock.jsx                          # для operator: показать/сменить куратора
CuratedOperatorsBlock.jsx                 # для moderator: список + bulk-add
TeamMembershipBlock.jsx                   # для operator: показать команду
ChangeCuratorModal.jsx                    # required-select при смене (D-9)
AddCuratedOperatorsModal.jsx              # multiselect bulk
```

### Modify — existing

```
src/App.jsx                               # add route /teams + /teams/:teamId
src/components/Sidebar.jsx                # add «Команды» link с visibility logic
src/lib/defaultPermissions.test.js        # verify manage_teams distribution
src/lib/permissionGroups.js               # noop (manage_teams уже есть)
src/pages/StaffDetailPage.jsx             # mount new blocks (Curator / CuratedOperators / TeamMembership)
```

---

## Stages

План разбит на 8 этапов. После каждого — рабочий коммит и smoke-test через preview server / psql. Не двигаемся к следующему пока текущий не зелёный.

### Stage 1 — Setup + DB schema + permissions

**Цель:** Создать ветку, накатить таблицы, проверить permissions wiring.

- Создать ветку `feat/subplan-4-teams` from `main`.
- Написать миграцию `20260425_19_teams_schema.sql` (точная схема — см. [spec §3.1](../specs/2026-04-25-crm-subplan-4-teams-design.md#31-new-tables)). 6 таблиц: `teams`, `team_members`, `team_clients`, `moderator_operators`, `team_activity`, `staff_activity`. Все индексы, UNIQUE constraints, ON DELETE rules.
- Применить через `supabase db push` (или вручную через psql connection string из `.env.local`).
- Проверить через psql: `\dt teams team_members team_clients moderator_operators team_activity staff_activity` — 6 таблиц.
- Проверить UNIQUE: `INSERT INTO team_members ... duplicate operator_id` → должна быть ошибка.
- Расширить `src/lib/defaultPermissions.test.js`: добавить кейсы что admin/teamlead/moderator имеют `manage_teams`, operator — не имеет.
- `npm test` — все existing + новые passes.

**Definition of done:**
- Ветка создана.
- Все 6 таблиц + индексы существуют в Supabase.
- DB constraints (UNIQUE, FK, CHECK) verified через manual psql.
- `npm test` зелёный.
- Commit: `feat(teams): add db schema for teams + curatorship (Subplan 4 Stage 1)`.

---

### Stage 2 — RPCs: Teams CRUD + activity feed

**Цель:** Базовые RPC для list/detail/create/update/archive/restore + activity log.

- Миграция `20260425_20_rpc_teams_crud.sql`. Реализовать функции:

  | RPC | Behavior |
  |---|---|
  | `list_teams(p_caller_id, p_active text DEFAULT 'active')` | Returns rows: `id, name, lead_user_id, lead_name, lead_role, members_count, clients_count, is_active, created_at`. Scope: admin/superadmin → все; teamlead/moderator → все (read-only кроме своей; в RPC возвращаем `editable bool` колонку); operator → только команды где он в `team_members`. Filter by `p_active`: `'active'` (default), `'archived'`, `'all'`. |
  | `get_team_detail(p_caller_id, p_team_id)` | Returns single row: + `members JSON ARRAY` ({operator_id, name, ref_code, alias, avatar_url}) + `clients JSON ARRAY` ({client_id, name, alias, avatar_url}). Same scope. |
  | `create_team(p_caller_id, p_name, p_lead_user_id)` | Pre-check: caller is admin OR superadmin (per [I-8](../specs/2026-04-25-crm-subplan-4-teams-design.md#6-бизнес-инварианты--error-handling)). Pre-check: lead has role IN ('teamlead','moderator') (I-1). INSERT teams. Audit: `team_activity (event_type='team_created', payload={name, lead_user_id})`. Returns new id. |
  | `update_team(p_caller_id, p_team_id, p_name text DEFAULT NULL, p_lead_user_id int DEFAULT NULL)` | Permission: admin only. Pre-check lead role if changing. UPDATE; audit events `team_renamed` / `lead_changed` separately. |
  | `archive_team(p_caller_id, p_team_id)` | Permission: admin only. Per [§3.2 cascade](../specs/2026-04-25-crm-subplan-4-teams-design.md#32-soft-delete-cascade-behavior): delete from team_members + team_clients, set is_active=false. Audit `team_archived` с counts. Returns `{released_operators int, released_clients int}`. |
  | `restore_team(p_caller_id, p_team_id)` | Permission: admin only. UPDATE is_active=true. Audit `team_restored`. State не восстанавливается. |
  | `list_team_activity(p_caller_id, p_team_id, p_limit int DEFAULT 12, p_offset int DEFAULT 0)` | Returns rows: `id, actor_id, actor_name, event_type, payload, created_at`. Same scope as get_team_detail. |

- В каждой RPC использовать helper `has_permission(p_caller_id, 'manage_teams')` (если ещё нет — создать в этой миграции inline; см. паттерн из `db/migrations/20260425_14_rpc_client_crud.sql`).
- Применить миграцию.
- Smoke psql:

  ```sql
  -- Создание
  SELECT create_team(1, 'Test Squad', 12);  -- 1=admin, 12=teamlead
  -- list_teams возвращает row
  SELECT * FROM list_teams(1, 'active');
  -- update_team renaming
  SELECT update_team(1, 1, 'Renamed', NULL);
  -- archive
  SELECT archive_team(1, 1);
  -- list_teams active=archived → видим
  -- restore
  SELECT restore_team(1, 1);
  -- audit
  SELECT * FROM list_team_activity(1, 1, 20, 0);
  ```

  Каждый сценарий должен дать ожидаемое поведение + audit event.

- Negative test: `SELECT create_team(1, '', 12)` → constraint violation на `name`. `SELECT create_team(1, 'X', 999)` (operator role) → exception «Лидом может быть только тимлид или модератор».

**Definition of done:**
- 7 RPC применены.
- Smoke psql сценарии работают.
- Audit events записаны.
- Commit: `feat(teams): add CRUD RPCs + activity feed (Stage 2)`.

---

### Stage 3 — RPCs: members + clients + curatorship

**Цель:** Mutations для состава, клиентов, кураторства.

- Миграция `20260425_21_rpc_teams_members.sql`:

  | RPC | Behavior |
  |---|---|
  | `add_team_member(p_caller_id, p_team_id, p_operator_id)` | Permission: admin OR caller==team.lead_user_id. Pre-check: operator имеет role='operator' (I-2). Pre-check: operator не в другой команде (I-3 friendly error: `RAISE EXCEPTION 'Оператор % уже в команде "%"', op_name, team_name USING DETAIL=team_id::text` — для frontend deep-link). INSERT. Audit `member_added`. |
  | `remove_team_member(p_caller_id, p_team_id, p_operator_id)` | Permission same. DELETE. Audit `member_removed`. |
  | `move_team_member(p_caller_id, p_from_team, p_to_team, p_operator_id)` | Permission: admin OR (lead-of-from AND lead-of-to). Atomic: BEGIN; DELETE from team_members WHERE team_id=from; INSERT INTO team_members (team_id=to, ...); COMMIT. Audit двумя events `member_removed` + `member_added` или один `member_moved`? Решение: один `member_moved` с payload {from_team, to_team}. |
  | `list_unassigned_operators(p_caller_id, p_search text DEFAULT NULL)` | Returns operators (role='operator', is_active=true) WHERE NOT IN (SELECT operator_id FROM team_members). Search по имени + alias + ref_code. Limit 50. |

- Миграция `20260425_22_rpc_teams_clients.sql`:

  | RPC | Behavior |
  |---|---|
  | `assign_team_clients(p_caller_id, p_team_id, p_client_ids int[])` | Permission: admin OR lead. Pre-check: ВСЕ client_ids не назначены (I-4 fail-all atomic). Если хоть один в team_clients — exception `RAISE 'Клиенты уже назначены: %', conflict_names USING DETAIL=conflict_team_ids::text`. Иначе batch INSERT. Audit single event `clients_assigned` с array of client_ids. |
  | `unassign_team_client(p_caller_id, p_team_id, p_client_id)` | Permission same. DELETE. Audit `client_unassigned`. |
  | `move_team_client(p_caller_id, p_from_team, p_to_team, p_client_id)` | Permission: admin OR (lead-of-from AND lead-of-to). Atomic. Audit `client_moved`. |
  | `list_unassigned_clients(p_caller_id, p_search text DEFAULT NULL)` | Returns clients (is_active=true) WHERE NOT IN (SELECT client_id FROM team_clients). Search по name + alias. Limit 50. |

- Миграция `20260425_23_rpc_curatorship.sql`:

  | RPC | Behavior |
  |---|---|
  | `list_curated_operators(p_caller_id, p_moderator_id)` | Permission: admin OR caller==moderator_id. Returns rows: `operator_id, name, ref_code, alias, avatar_url, team_id, team_name`. |
  | `set_operator_curator(p_caller_id, p_operator_id, p_new_moderator_id int)` | Permission: admin OR caller==current_curator OR caller==new_moderator. NOT NULL constraint on `p_new_moderator_id` (D-9). Pre-check: new_moderator role='moderator'. Pre-check: operator role='operator'. Atomic: DELETE FROM moderator_operators WHERE operator_id=p_operator_id; INSERT INTO moderator_operators VALUES (p_new_moderator_id, p_operator_id, p_caller_id, now()). Audit в `staff_activity`: `curator_changed` с payload {from_moderator_id, to_moderator_id} (или `curator_assigned` если был NULL — но per D-9 такого не бывает в нормальном flow; только при первом assignment'е). |
  | `bulk_assign_curated_operators(p_caller_id, p_moderator_id, p_operator_ids int[])` | Permission: admin OR caller==moderator_id. Fail-all: ВСЕ operator_ids должны быть без куратора (или иметь callerself как текущего). Iterate set_operator_curator. Atomic. |

- Применить все 3 миграции.
- Smoke psql полный сценарий:

  ```sql
  -- Setup: создаём команду
  SELECT create_team(1, 'Squad A', 12);  -- admin=1, TL=12
  -- Add operator
  SELECT add_team_member(1, 1, 20);  -- operator id=20
  -- Try add him again → conflict
  SELECT add_team_member(1, 2, 20);  -- error: «Оператор уже в команде ...»
  -- Move to other team
  SELECT create_team(1, 'Squad B', 13);
  SELECT move_team_member(1, 1, 2, 20);
  -- Assign clients
  SELECT assign_team_clients(1, 2, ARRAY[5, 6, 7]::int[]);
  -- Try assign one already assigned → fail-all
  SELECT assign_team_clients(1, 1, ARRAY[5]::int[]);  -- error: «Клиенты уже назначены: ...»
  -- Curatorship
  SELECT set_operator_curator(1, 20, 11);  -- mod=11
  -- Try NULL curator → error (NOT NULL argument)
  SELECT set_operator_curator(1, 20, NULL);  -- type error
  -- Bulk
  SELECT bulk_assign_curated_operators(1, 11, ARRAY[20, 21, 22]::int[]);  -- 21,22 без куратора
  ```

**Definition of done:**
- 11 RPC применены (members 4: add/remove/move + list_unassigned_operators; clients 4: assign/unassign/move + list_unassigned_clients; curatorship 3).
- Smoke psql проходит все позитивные и negative сценарии.
- Audit events корректны.
- Commit: `feat(teams): add member/client/curatorship RPCs (Stage 3)`.

---

### Stage 4 — archive_user extension + dev seed

**Цель:** Деактивация user'а каскадно очищает membership, блокируется на лидере/кураторе. Seed для dev.

- Миграция `20260425_24_archive_user_extension.sql`. Расширить существующий RPC `archive_user` (Subplan 2):

  ```sql
  CREATE OR REPLACE FUNCTION archive_user(p_caller_id int, p_user_id int)
  RETURNS void AS $$
  DECLARE
    user_role text;
    leading_team text;
  BEGIN
    -- existing permission checks ...

    SELECT role INTO user_role FROM dashboard_users WHERE id = p_user_id;

    -- I-9: блок если ведёт активную команду
    SELECT name INTO leading_team FROM teams WHERE lead_user_id = p_user_id AND is_active = true LIMIT 1;
    IF leading_team IS NOT NULL THEN
      RAISE EXCEPTION 'Нельзя архивировать: ведёт команду "%". Смените лида сначала.', leading_team;
    END IF;

    -- I-9: блок если курирует операторов
    IF user_role = 'moderator' AND EXISTS (SELECT 1 FROM moderator_operators WHERE moderator_id = p_user_id) THEN
      RAISE EXCEPTION 'Нельзя архивировать модератора с курируемыми операторами. Переназначьте кураторство сначала.';
    END IF;

    -- Cascade очистка
    DELETE FROM team_members WHERE operator_id = p_user_id;
    DELETE FROM moderator_operators WHERE operator_id = p_user_id;

    -- existing UPDATE is_active=false ...

    -- Audit
    INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
      VALUES (p_user_id, p_caller_id, 'user_archived_with_cascade', jsonb_build_object('role', user_role));
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```

  > Перед изменением — прочитать текущее тело `archive_user` в Subplan 2 миграции, сохранить остальную логику (deletion_requests, etc.).

- Запустить existing Subplan 2 тесты вокруг archive_user — они должны passes (мы только расширяем).
- Миграция `20260425_25_seed_dev_teams.sql` (DEV ONLY — guard `IF current_database() LIKE '%dev%' OR ...`):

  ```sql
  -- Команда A: лид TL Анна, операторы Иван/Мария/Алекс, клиенты Sofia + Mia
  INSERT INTO teams (id, name, lead_user_id, created_by) VALUES (1, 'Команда А (день)', <TL_ANNA_ID>, 1);
  INSERT INTO team_members (team_id, operator_id, added_by) VALUES (1, <IVAN_ID>, 1), (1, <MARIA_ID>, 1), (1, <ALEX_ID>, 1);
  INSERT INTO team_clients (team_id, client_id, assigned_by) VALUES (1, <SOFIA_ID>, 1), (1, <MIA_ID>, 1);

  -- Команда B: лид модератор Дмитрий (одновременно лид + курирует), операторы Олег/Полина, клиенты Luna+Ines
  INSERT INTO teams (id, name, lead_user_id, created_by) VALUES (2, 'Команда B (вечер)', <MOD_DMITRY_ID>, 1);
  ...

  -- Кураторство: модератор Дмитрий курирует Олега + Полину + Ивана (incl. оператора из команды A — кураторство ≠ команда)
  INSERT INTO moderator_operators (moderator_id, operator_id, assigned_by) VALUES
    (<MOD_DMITRY_ID>, <OLEG_ID>, 1), (<MOD_DMITRY_ID>, <POLINA_ID>, 1), (<MOD_DMITRY_ID>, <IVAN_ID>, 1);

  -- Sanity: остальные операторы без куратора (потом покроем через UI или второй модератор seed)
  ```

  > Использовать существующих seed users из Subplan 2 (`SELECT id FROM dashboard_users WHERE alias='Анна.М'`). Не хардкодить ID — использовать subqueries.

- Применить миграции.
- Smoke psql:

  ```sql
  -- Попытка архивировать TL команды A
  SELECT archive_user(1, <TL_ANNA_ID>);  -- error: «ведёт команду»
  -- Попытка архивировать модератора Дмитрия
  SELECT archive_user(1, <MOD_DMITRY_ID>);  -- error: «курирует»
  -- Архивировать оператора без supervisor роли
  SELECT archive_user(1, <IVAN_ID>);  -- ok; cascade удаляет из team_members + moderator_operators
  -- Verify
  SELECT * FROM team_members WHERE operator_id = <IVAN_ID>;  -- empty
  SELECT * FROM moderator_operators WHERE operator_id = <IVAN_ID>;  -- empty
  -- Restore manual для следующих stages (нам Иван нужен живой)
  UPDATE dashboard_users SET is_active = true WHERE id = <IVAN_ID>;
  -- Re-add в команду
  INSERT INTO team_members ...;
  INSERT INTO moderator_operators ...;
  ```

**Definition of done:**
- archive_user блокирует лидеров/кураторов, каскадно чистит operator membership.
- Seed создаёт 2 команды + кураторство.
- `npm test` зелёный (Subplan 2 archive_user тесты).
- Commit: `feat(teams): extend archive_user + dev seed (Stage 4)`.

---

### Stage 5 — Lib helpers + hooks

**Цель:** JS layer для фронтенда: helpers + 10 hooks.

- Создать `src/lib/teams.js`:

  ```javascript
  import { pluralRu } from './clients.js' // переиспользуем

  export const pluralizeOperators = (n) =>
    `${n} ${pluralRu(n, { one: 'оператор', few: 'оператора', many: 'операторов' })}`

  export const pluralizeTeams = (n) =>
    `${n} ${pluralRu(n, { one: 'команда', few: 'команды', many: 'команд' })}`

  export function formatLeadRole(role) {
    if (role === 'teamlead') return 'Тимлид'
    if (role === 'moderator') return 'Модератор'
    return role
  }

  export function validateTeamName(value) {
    if (value == null || String(value).trim() === '')
      return { valid: false, error: 'Имя команды обязательно' }
    if (String(value).trim().length > 80)
      return { valid: false, error: 'Слишком длинное имя (макс 80 симв.)' }
    return { valid: true }
  }

  /** Может ли user редактировать team? Admin или сам лид. */
  export function canEditTeam(user, team) {
    if (!user || !team) return false
    if (user.role === 'admin' || user.role === 'superadmin') return true
    return team.lead_user_id === user.id
  }

  /** Может ли user менять кураторство operator'а? Admin / current curator / new moderator. */
  export function canManageCuratorship(user, operator, currentCuratorId, newModeratorId) {
    if (!user) return false
    if (user.role === 'admin' || user.role === 'superadmin') return true
    if (user.id === currentCuratorId) return true
    if (user.id === newModeratorId) return true
    return false
  }

  /** Может ли user видеть `/teams` в Sidebar. */
  export function canSeeTeamsNav(user, hasTeamMembership) {
    if (!user) return false
    if (['admin','superadmin','teamlead','moderator'].includes(user.role)) return true
    if (user.role === 'operator' && hasTeamMembership) return true
    return false
  }
  ```

- Тесты `src/lib/teams.test.js`: покрытие каждой функции (минимум 3 кейса на функцию).
- Создать 10 hooks по образцу `src/hooks/useClientList.js` / `useClient.js`. Шаблон одного:

  ```javascript
  // src/hooks/useTeamList.js
  import { useEffect, useState, useCallback } from 'react'
  import { supabase } from '../supabaseClient'

  /** @param {{ active: 'active'|'archived'|'all', search: string }} opts */
  export function useTeamList(callerId, opts = {}) {
    const { active = 'active', search = '' } = opts
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
      if (!callerId) return
      let cancelled = false
      setLoading(true)
      setError(null)
      supabase.rpc('list_teams', { p_caller_id: callerId, p_active: active })
        .then(({ data, error: err }) => {
          if (cancelled) return
          if (err) { setError(err.message); setRows([]) }
          else {
            // Client-side search filter
            const q = search.trim().toLowerCase()
            const filtered = q
              ? (data ?? []).filter(t =>
                  t.name.toLowerCase().includes(q) ||
                  t.lead_name?.toLowerCase().includes(q))
              : (data ?? [])
            setRows(filtered)
          }
        })
        .finally(() => { if (!cancelled) setLoading(false) })
      return () => { cancelled = true }
    }, [callerId, active, search, reloadKey])

    const reload = useCallback(() => setReloadKey(k => k + 1), [])
    return { rows, loading, error, reload }
  }
  ```

  Аналогично остальные:
  - `useTeam(callerId, teamId)` → wraps `get_team_detail`
  - `useTeamMembers(callerId, teamId)` → возвращает members[] + actions {addMember, removeMember, moveMember}
  - `useTeamClients(callerId, teamId)` → clients[] + actions {assignClients, unassignClient, moveClient}
  - `useTeamActivity(callerId, teamId, limit)` → wraps `list_team_activity` с pagination
  - `useTeamActions(callerId)` → {createTeam, updateTeam, archiveTeam, restoreTeam}
  - `useUnassignedOperators(callerId, search)` → wraps `list_unassigned_operators`
  - `useUnassignedClients(callerId, search)` → wraps `list_unassigned_clients`
  - `useCuratorship(callerId, moderatorId)` → curatedOperators[] + actions {setCurator, bulkAssign}
  - `useUserTeamMembership(userId)` → boolean (есть ли запись в team_members) + cached в module-level Map для Sidebar (без re-fetch на каждом mount)

- `npm test` — все passes.

**Definition of done:**
- `teams.js` + tests passes.
- 10 hooks создано.
- `npm test` зелёный.
- Commit: `feat(teams): add lib helpers and hooks (Stage 5)`.

---

### Stage 6 — TeamListPage + master + slide-out create

**Цель:** Страница `/teams`, master-список, фильтры, slide-out создания.

- Добавить route в `src/App.jsx`:

  ```jsx
  <Route path="/teams" element={<TeamListPage />}>
    <Route path=":teamId" element={<TeamListPage />} />
  </Route>
  ```

- Создать `src/pages/TeamListPage.jsx` по образцу `ClientListPage.jsx`:
  - Master section (440px / fluid на zero/empty) — `<TeamList>`, `<TeamFilterChips>`, search.
  - Detail section — placeholder `<DetailEmptyHint>` (создадим в Stage 7).
  - Sidebar visibility check: `canSeeTeamsNav(user, useUserTeamMembership(user.id).has)`.
  - 1024px breakpoint master/detail collapse (как в ClientListPage).

- `src/components/teams/TeamList.jsx` + `TeamListItem.jsx` (паттерн ClientList/ClientListItem):
  - List item: avatar-инициалы команды (D-13: deterministic color от hash), имя (truncate + title), лид (имя + role-badge), counts «3 оп. · 7 кл.» (tabular).
  - Active state: vertical accent bar (border-l-primary).
  - Read-only badge: если `!canEditTeam(user, team)` — pill «Только просмотр» в углу элемента.

- `src/components/teams/TeamFilterChips.jsx` (паттерн ClientFilterChips): чипы `Все / Активные / Архив`.

- `src/components/teams/EmptyZero.jsx` + `EmptyFilter.jsx`:
  - Zero: «Команд пока нет / + Создать первую команду» (admin only).
  - Filter: «Под фильтр ничего не подходит / Сбросить».

- `src/components/teams/CreateTeamSlideOut.jsx` (минимум по D-7):
  - Поля: «Имя команды» (text, required, validateTeamName), «Лид» (select из всех TL и Moderator с role-badge).
  - На submit — `useTeamActions().createTeam` → redirect на `/teams/:newId`.
  - Hotkeys Esc + Cmd+Enter (паттерн CreateClientSlideOut).
  - Confirm dialog при close с dirty form — **skip** (форма всего 2 поля, потеря не критична; YAGNI).

- Sidebar nav: пункт «Команды» (icon: Users), visibility per `canSeeTeamsNav`.
- `npm run dev` + smoke в preview:
  1. Залогиниться admin'ом → видим «Команды» в sidebar.
  2. Открыть `/teams` → 2 команды из seed.
  3. Создать новую → появляется в списке + redirect на detail (placeholder).
  4. Залогиниться оператором (из seed) → видим «Команды», только своя команда в списке.
  5. Залогиниться оператором без команды → пункт «Команды» не показан.

**Definition of done:**
- `/teams` страница работает с list + filter + search + slide-out create.
- Master-detail collapses на mobile.
- Sidebar visibility работает per role.
- Read-only badge виден где надо.
- Smoke прошёл.
- Commit: `feat(teams): add /teams page with list and create (Stage 6)`.

---

### Stage 7 — TeamDetailPanel + tabs + member/client modals

**Цель:** Полный detail UI: header, 3 tabs, modals для добавления.

- `src/components/teams/TeamDetailPanel.jsx` (паттерн ClientDetailPanel):
  - Top bar: breadcrumb + status toggle (admin) + pagination ‹ N/M ›.
  - Header: имя команды (truncate + title) + лид с link to `/staff/:refCode` + role-badge + meta «Создана DD.MM.YYYY @ <admin>».
  - Tabs: `Состав` (default) / `Клиенты` / `Активность` (с count badges).
  - Body: grid 1col + xl:[main, 320px sidebar] — но sidebar здесь не нужен (Activity отдельный tab). Просто 1col.
  - DetailSkeleton (паттерн Subplan 3).

- `src/components/teams/TeamMembersTab.jsx`:
  - Lid card: avatar лида + имя + role-badge + change-link (admin → opens ChangeLeadModal).
  - Operators list (table-style): rows {avatar, name, ref_code, alias} + remove-кнопка (admin/lead).
  - Под списком: `+ Добавить оператора` (admin/lead) → AddMemberModal.
  - Empty: «Команда без операторов» + CTA.

- `src/components/teams/AddMemberModal.jsx`:
  - Modal с поиском (`useUnassignedOperators(callerId, search)`).
  - Single-select из списка (avatar + name + ref_code + alias).
  - Submit → `useTeamMembers().addMember(teamId, operatorId)` → close + refresh.
  - Conflict (I-3) — error inline в modal с deep-link «Открыть команду «X»».

- `src/components/teams/TeamClientsTab.jsx`:
  - Toolbar: search + `+ Добавить клиентов` (admin/lead) → AddClientsModal.
  - Grid (паттерн PhotoGalleryTab grid но без DnD): tile {avatar клиента + name + alias + remove-кнопка}.
  - Empty: «Нет клиентов» + CTA.

- `src/components/teams/AddClientsModal.jsx`:
  - Modal с multiselect (`useUnassignedClients(callerId, search)`).
  - Checkbox-list + count «Выбрано: N» внизу.
  - Submit → `assignTeamClients(teamId, selectedIds)` (batch).
  - Conflict (I-4) — error inline с deep-links.

- `src/components/teams/TeamActivityTab.jsx`:
  - Reuse `ActivityCard` структуры из `src/components/clients/ActivityCard.jsx` (или extract в shared).
  - `useTeamActivity` с pagination «Показать ещё».
  - humanizeEvent для team event types: `team_created`, `team_renamed`, `lead_changed`, `member_added`, `member_removed`, `member_moved`, `clients_assigned`, `client_unassigned`, `client_moved`, `team_archived`, `team_restored`.

- `src/components/teams/ChangeLeadModal.jsx`:
  - Select из всех TL + Moderator (excluding current lead).
  - Submit → `useTeamActions().updateTeam(teamId, { leadUserId })`.

- `src/components/teams/ArchiveTeamConfirmDialog.jsx`:
  - Confirm с counts: «Архивировать команду «X»? 3 оператора и 7 клиентов будут освобождены».
  - Кнопка «Архивировать» (danger-ghost) + «Отмена».

- `src/components/teams/ReadOnlyBadge.jsx`:
  - Pill «Только просмотр» с info-icon, рядом с заголовком detail если `!canEditTeam(user, team)`.

- Smoke в preview:
  1. Открыть seeded команду → видим лида, 3 операторов, 2 клиентов.
  2. Добавить ещё оператора через modal — работает.
  3. Попытаться добавить уже-в-команде → conflict modal с deep-link.
  4. Удалить оператора → исчезает + audit event в Активность.
  5. Назначить ещё клиентов через multiselect → batch assign.
  6. Сменить лида admin'ом → audit event.
  7. Архивировать → confirm с counts → команда освобождает membership.
  8. Восстановить из «Архив» фильтра.
  9. Залогиниться оператором → видим detail в read-only, edit-кнопок нет.

**Definition of done:**
- Все 3 tabs работают.
- Modals (Add member / Add clients / Change lead / Archive confirm) работают.
- Audit events записываются корректно.
- Read-only mode применяется.
- Smoke прошёл.
- Commit: `feat(teams): add detail panel with tabs and modals (Stage 7)`.

---

### Stage 8 — Staff card extensions + curatorship UI + polish

**Цель:** Блоки в `/staff/:refCode` для команды и кураторства; финальный pass.

- `src/components/staff/TeamMembershipBlock.jsx` (mount в StaffDetailPage для operator):
  - Блок «Команда»: показывает team name + lead + link to `/teams/:teamId` или «Не назначен в команду» + change-link (admin/lead).
  - Кнопка change → опционально: дёргает `useTeamMembers().moveMember` через wizard «выбрать новую команду».

- `src/components/staff/CuratorBlock.jsx` (mount для operator):
  - Блок «Куратор»: показывает moderator name + role-badge + link to `/staff/:moderatorRefCode` или «Не назначен куратор».
  - Change-link → ChangeCuratorModal (admin/current-curator/new-moderator).

- `src/components/staff/ChangeCuratorModal.jsx`:
  - Required-select (D-9): no «Не назначен» опции.
  - Список модераторов (excluding current).
  - Submit → `useCuratorship().setCurator(operatorId, newModeratorId)`.
  - Audit event записывается.

- `src/components/staff/CuratedOperatorsBlock.jsx` (mount для moderator):
  - Заголовок «Курирует операторов: N» + кнопка `+ Добавить` (admin/self).
  - Collapsible list: avatar + name + ref_code + team_name + remove-link (delegate to ChangeCuratorModal с required-select).
  - Кнопка `+ Добавить` → AddCuratedOperatorsModal.

- `src/components/staff/AddCuratedOperatorsModal.jsx`:
  - Multiselect среди операторов БЕЗ куратора (отдельный helper `useUnassignedCuratedOperators` или re-use `list_unassigned_operators` с extra filter).
  - Submit → `useCuratorship().bulkAssign(moderatorId, operatorIds)`.

- Опциональный `LeaderTeamChip.jsx` для moderator/teamlead carded (показывает «Лид команды X» как chip с link).

- Mount всех блоков в `src/pages/StaffDetailPage.jsx`. Conditional render по роли:
  ```jsx
  {staff.role === 'operator' && (
    <>
      <TeamMembershipBlock callerId={user.id} operator={staff} />
      <CuratorBlock callerId={user.id} operator={staff} />
    </>
  )}
  {staff.role === 'moderator' && (
    <CuratedOperatorsBlock callerId={user.id} moderator={staff} />
  )}
  {(staff.role === 'teamlead' || staff.role === 'moderator') && (
    <LeaderTeamChip leadUserId={staff.id} />
  )}
  ```

- **Polish pass** (по образцу Subplan 3 Stage 8):
  - Realistic skeletons для team list / detail / activity (avatar+rows+grid).
  - Slow-loading hint (>2 сек) для list/detail.
  - `role="alert"` на error states; `role="status" + aria-live` на upload/mutation банеры.
  - Focus management в modals (focus first input, restore on close, Esc to close).
  - aria-labels на icon-buttons.
  - Mobile responsive: master-detail collapse <1024px (паттерн ClientListPage).

- Final smoke flow (полный per [§7.4 spec](../specs/2026-04-25-crm-subplan-4-teams-design.md#74-smoke-flow-через-preview)):
  1. Admin создаёт «Test Squad», лид — TL.
  2. Добавляет 2 операторов (один уже в команде → conflict UI).
  3. Назначает 3 клиентов через multiselect.
  4. Открывает Staff карточку оператора → меняет куратора (modal с required-select).
  5. Логин под этим оператором → видит только эту команду в `/teams`, всё read-only.
  6. Admin архивирует команду → освобождение операторов/клиентов.

- Запустить `npm test` (должны пройти все: lib + hooks + Subplan 3 unchanged).
- Запустить `npx vite build` — без warnings/errors.

**Definition of done:**
- Все блоки в Staff карточке работают.
- Кураторство — set/bulk/required-select работают.
- Polishing pass завершён.
- Smoke flow §7.4 проходит.
- `npm test` + `npx vite build` зелёные.
- Commit: `feat(teams): add staff curatorship blocks + polish (Stage 8)`.

---

## Open questions (могут возникнуть в plan-time / implementation-time)

Из [spec §2 Open questions](../specs/2026-04-25-crm-subplan-4-teams-design.md#2-decisions-log):

- **Q-A** (audit log architecture) — пока решено: отдельные `team_activity` + `staff_activity`. Если в Stage 7 окажется что events часто cross-cutting, переразмысляем.
- **Q-B** (soft delete vs hard delete) — soft delete + cascade-освобождение. Hard delete — отдельный admin-only flow в будущем.
- **Q-C** (UI для archived команд) — фильтр-чип «Архив» в master, как у Clients.

Если в реализации возникнут новые архитектурные вопросы — фиксируем в `docs/design-feedback/_decisions.md` или inline в spec.

---

## Acceptance criteria

После всех 8 stages (per [spec §9](../specs/2026-04-25-crm-subplan-4-teams-design.md#9-acceptance-criteria)):

- Полный CRUD команд через UI (`/teams`).
- Назначение операторов и клиентов работает с обеих сторон (Team detail + Client detail — последнее не реализуем здесь, отметка в backlog: добавить «Команда» блок в `/clients/:id` ProfileTab — отдельная задача после Stage 8).
- Кураторство — manual + bulk через Staff карточку модератора; обязательность при смене.
- Operator в Sidebar видит «Команды» только если назначен; на странице видит только свою.
- Деактивация user'а с ролью лида/куратора блокируется до replacement.
- Activity log записывает все mutations.
- Всё на DS-токенах (паттерны Clients).
- `npm test` passes.
- `npx vite build` без ошибок.
- Smoke через preview проходит сценарий.

> **Backlog (после Subplan 4):** добавить «Команда» блок в `/clients/:id` ProfileTab (single-client move через `move_team_client`). Это Q-D4 из spec — bidirectional assignment. Не блокирует Subplan 4, но завершает D-4 решение.

---

## Notes для исполнителя

- **Не оптимизируй преждевременно.** 10-30 команд max — простой список без virtualize.
- **Не пиши хелперов «на будущее».** Только то что нужно для текущей задачи.
- **Hardcoded Tailwind classes разрешены** в режиме UI, но **DS-токены (`text-foreground`, `bg-card`, `bg-primary` etc.) — приоритет** — переиспользуем `.btn-primary`, `.btn-ghost`, `.surface-card`, `.focus-ds`, `.label-caps` из `src/index.css` (Subplan 3 Stage 8).
- **Memo / useCallback** — только если профайлер показывает реальный bottleneck.
- **Тесты** — пишем для logic-helpers (lib/teams.js) и hooks. UI snapshot не пишем.
- **Reuse паттернов Subplan 3** — `EmptyZero`, `EmptyFilter`, `DetailSkeleton`, `useSlowFlag`, `BulkActionBar` (если нужен).
- **При сомнениях по схеме / RPC** — авторитет [spec §3, §4](../specs/2026-04-25-crm-subplan-4-teams-design.md), затем `domain-model.md`.
- **Dev seed** — НЕ применять на production, guard через `current_database()` или env.
