# CRM Subplan 4 — Teams + кураторство · Design Spec

**Status:** Brainstormed · approved.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-25.
**Implements:** Domain model §3, §4.2 «Subplan 4 — Команды и кураторство», §6.4.

---

## 1. Goal & non-goals

**Goal:** Ввести структуру команд и кураторства как в [domain-model.md](../../domain-model.md) §4.2. Это структурный фундамент для Subplan 5 (Tasks): задачи назначаются по правилам команды/кураторства.

**В scope:**

- 4 реляционных таблицы (`teams`, `team_members`, `team_clients`, `moderator_operators`) + 2 activity log (`team_activity`, `staff_activity`).
- ~16 RPC-функций (CRUD + batch + scope-by-role + activity feed).
- Новая страница `/teams` с master-detail UI (список + детали с тремя tabs).
- Расширения карточки `/staff/:refCode` (блоки Команда / Куратор / Курируемые).
- Новая навигация: пункт «Команды» в Sidebar.

**Out of scope (отложено):**

- Tasks + reports → Subplan 5.
- Leaderboard / соревнование между командами по выручке → отдельный будущий Subplan (после Tasks).
- Concept «слот смены» (`team_members.shift_slot` `'day'|'evening'|'night'`) — стартуем без, миграция в shift-slot модель возможна позже одним добавлением колонки + UNIQUE constraint + backfill из `user_attributes.shift`.
- Полный визуальный pass под Claude Design — отложен до Subplan 6 (Design system) вместе с Clients и Tasks.
- Mobile-first дизайн `/teams` — defensive responsive (collapse master-detail на &lt;1024px), без отдельных мобильных макетов (как Subplan 3).
- Performance / virtualization (10-30 команд max — простой список без виртуализации).

---

## 2. Decisions log

Принятые решения из brainstorming-сессии. Каждый D-N имеет ссылку на rationale.

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Subplan 4 = Teams; Subplan 5 = Tasks (per `domain-model.md` §8). | Tasks по §6.2 ссылаются на team_members + moderator_operators для enforce'инга правил назначения. Без Teams сначала — мягкий permission model + рефактор позже. Решено: правильная очерёдность. |
| **D-2** | UI: отдельная страница `/teams` master-detail + кураторство inline в `/staff/:refCode`. | Команды — first-class сущность с собственным жизненным циклом. Кураторство — атрибут оператора (как роль), его место — в карточке staff. |
| **D-3** | Состав команды — гибкий 0-N операторов, без shift_slot. | Реалистично: при увольнении / перестановках команда временно неполная. UI badge «Неполная» если ≠3, но операции разрешены. UNIQUE(operator_id) сохраняется. Миграция к slot-модели feasibly через добавление колонки + backfill. |
| **D-4** | Назначение клиентов на команду — bi-directional. | Bulk из Team detail (типичный сценарий: новая команда, накидать 5 моделей). Single move из Client detail (типичный сценарий: «эту модель в другую команду»). UI переиспользует поиск/dropdown. |
| **D-5** | Видимость и edit rights: admin all/edit-all; TL/Mod see-all-readonly + edit-own; Operator sees-own-readonly. | Operator должен видеть свою команду (коллеги, лид, клиенты для контекста) — даже без задач. Sidebar пункт «Команды» виден operator'у только если он назначен в команду (lazy fetch). |
| **D-6** | Кураторство — manual + bulk-assign со стороны модератора. | Bulk нужен на bootstrapping (распределить 30 операторов по 5 модераторам). Auto-suggest по команде (`team.lead = moderator → авто-назначить кураторство`) отвергнут: implicit логика противоречит inv. 7 — кураторство ≠ команда. |
| **D-7** | Создание команды — минимальный slide-out (имя + лид). | Per D-3 (гибкий состав) команда естественно начинает пустой. Состав/клиенты добавляются на странице деталей — единый интерфейс редактирования. Slide-out минимальный, меньше кода, единая правда. |
| **D-8** | Move оператора между командами — atomic RPC `move_team_member(from_team, to_team, operator_id)`. | Транзакционность + единый event в audit. Альтернатива (две RPC remove + add) даёт inconsistent state при сбое между. |
| **D-9** | Куратор обязателен для оператора (`set_operator_curator(operator_id, null)` запрещён). | Domain inv. 2: оператор всегда имеет двух супервизоров (TL команды + куратор-модератор). Снятие куратора без замены = invalid state. UI: при попытке снять — modal требует выбор замены. |
| **D-10** | Без Claude Design loop'а на Subplan 4. | Teams — boring CRUD (списки, формы, релейшены). Дизайн-цикл — overengineering. Строим функционально на текущих DS-токенах, переиспользуем паттерны Clients (master-detail, EmptyZero/Filter, slide-out). Один self-review в конце. |
| **D-11** | Деактивация user'а каскадно очищает membership. | При `is_active=false` (operator или moderator) — автоматически удаляется из `team_members` и `moderator_operators`. Audit event: `member_removed_due_to_archival`. Реализуется trigger'ом или внутри `archive_user` RPC. |

**Открытые вопросы (для plan-time, не блокируют design):**

- **Q-A:** Audit log architecture — `team_activity` + `staff_activity` отдельно или общий `audit_log`? Решим при проектировании RPC: если 80% events — team-related, держим раздельно (locality + simpler queries). Если будет много cross-cutting — общий с `entity_type` discriminator.
- **Q-B:** Soft delete команды (`is_active=false`) vs hard delete. Принято: soft delete + cascade-освобождение membership/clients. Hard delete возможен superadmin'ом отдельной операцией (как `delete_user` в Subplan 2).
- **Q-C:** UI для archived команд — отдельный фильтр-чип «Архив» (как у Clients) или скрыты по умолчанию с toggle «Показать архив». Default: фильтр-чип, консистентно с Clients.

---

## 3. Database schema

### 3.1. New tables

```sql
-- Команда
CREATE TABLE teams (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  lead_user_id int NOT NULL REFERENCES dashboard_users(id) ON DELETE RESTRICT,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   int REFERENCES dashboard_users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX teams_lead_user_id_idx ON teams (lead_user_id);
CREATE INDEX teams_is_active_idx ON teams (is_active);

-- Состав команды (1 оператор = 1 команда; UNIQUE на operator_id)
CREATE TABLE team_members (
  team_id     int NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  operator_id int NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  added_by    int REFERENCES dashboard_users(id),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, operator_id),
  CONSTRAINT team_members_operator_unique UNIQUE (operator_id)
);

CREATE INDEX team_members_operator_id_idx ON team_members (operator_id);

-- Клиенты команды (1 клиент = 1 команда; UNIQUE на client_id)
CREATE TABLE team_clients (
  team_id     int NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  client_id   int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assigned_by int REFERENCES dashboard_users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, client_id),
  CONSTRAINT team_clients_client_unique UNIQUE (client_id)
);

CREATE INDEX team_clients_client_id_idx ON team_clients (client_id);

-- Кураторство (orthogonal к командам; 1 оператор = 1 куратор)
CREATE TABLE moderator_operators (
  moderator_id int NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  operator_id  int NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  assigned_by  int REFERENCES dashboard_users(id),
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moderator_id, operator_id),
  CONSTRAINT moderator_operators_operator_unique UNIQUE (operator_id)
);

CREATE INDEX moderator_operators_operator_id_idx ON moderator_operators (operator_id);

-- Activity log для команд (паттерн client_activity)
CREATE TABLE team_activity (
  id         serial PRIMARY KEY,
  team_id    int REFERENCES teams(id) ON DELETE CASCADE,
  actor_id   int REFERENCES dashboard_users(id),
  event_type text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX team_activity_team_id_created_at_idx ON team_activity (team_id, created_at DESC);

-- Activity log для staff (для событий кураторства)
CREATE TABLE staff_activity (
  id         serial PRIMARY KEY,
  user_id    int REFERENCES dashboard_users(id) ON DELETE CASCADE,
  actor_id   int REFERENCES dashboard_users(id),
  event_type text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_activity_user_id_created_at_idx ON staff_activity (user_id, created_at DESC);
```

### 3.2. Soft-delete cascade behavior

Архивирование команды (`update teams set is_active=false where id=N`) **не удаляет** записи из `team_members` / `team_clients` сразу. Вместо этого RPC `archive_team` явно делает:

```sql
DELETE FROM team_members WHERE team_id = p_team_id;
DELETE FROM team_clients WHERE team_id = p_team_id;
UPDATE teams SET is_active = false, updated_at = now() WHERE id = p_team_id;
INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (p_team_id, p_caller_id, 'team_archived', jsonb_build_object(
    'released_operators', ..., 'released_clients', ...
  ));
```

Это освобождает операторов/клиентов для назначения в другую команду. Восстановление команды (`restore_team`) ставит `is_active=true`, но **не восстанавливает** прежний состав (он уже мог быть назначен в другие команды).

### 3.3. Деактивация user'а — каскад

В существующий RPC `archive_user` (Subplan 2) добавляется блок:

```sql
-- Удалить из всех команд (если оператор)
DELETE FROM team_members WHERE operator_id = p_user_id;
-- Удалить из кураторства (если оператор)
DELETE FROM moderator_operators WHERE operator_id = p_user_id;
-- Если был куратором — sanity-check: операторы под его кураторством должны быть переназначены ДО архивирования
IF EXISTS (SELECT 1 FROM moderator_operators WHERE moderator_id = p_user_id) THEN
  RAISE EXCEPTION 'Cannot archive moderator with assigned operators. Reassign curatorship first.';
END IF;
-- Если вёл команду — блок (admin должен сменить лида сначала)
IF EXISTS (SELECT 1 FROM teams WHERE lead_user_id = p_user_id AND is_active = true) THEN
  RAISE EXCEPTION 'Cannot archive user leading active team(s). Change leadership first.';
END IF;
-- Audit
INSERT INTO staff_activity (user_id, actor_id, event_type, payload) ...
```

Таким образом invariant'ы (один куратор у оператора, один лид у активной команды) сохраняются.

### 3.4. New permissions

Уже есть в `src/lib/permissionGroups.js`: `manage_teams`. Достаточно — scope (admin all / TL-Mod own / operator nothing-edit) определяется в RPC через role + ownership.

Никаких новых permission keys не добавляем.

### 3.5. Default permissions

Уже корректно в `src/lib/defaultPermissions.js` (Foundation):

| Роль | Имеет `manage_teams` |
|---|---|
| superadmin | ✓ |
| admin | ✓ (расширим default — `manage_clients`, `assign_team_clients` уже есть после Subplan 3) |
| moderator | ✓ |
| teamlead | ✓ |
| operator | ✗ |

`manage_teams` уже распределён по умолчанию для admin/teamlead/moderator (Foundation `defaultPermissions.js`). Изменений в дефолтах не требуется — на этапе плана только верифицируем тестом.

---

## 4. RPC surface

Все RPC принимают `p_caller_id int` первым аргументом. Permission checks внутри. Возвращают friendly error через `RAISE EXCEPTION` с понятным текстом.

### 4.1. Teams CRUD

| RPC | Args | Returns | Permission |
|---|---|---|---|
| `list_teams(caller_id, p_active)` | active='active'\|'archived'\|'all' | rows: id, name, lead_user_id, lead_name, lead_role, members_count, clients_count, is_active, created_at | scope: admin → all; TL/Mod → all; operator → only own (через `team_members.operator_id`) |
| `get_team_detail(caller_id, team_id)` | team_id | row: + members[] + clients[] | scope same |
| `create_team(caller_id, name, lead_user_id)` | | new id | admin only |
| `update_team(caller_id, team_id, name?, lead_user_id?)` | | void | admin only |
| `archive_team(caller_id, team_id)` | | counts of released | admin only; cascade per §3.2 |
| `restore_team(caller_id, team_id)` | | void | admin only |

### 4.2. Team members

| RPC | Args | Returns | Permission |
|---|---|---|---|
| `add_team_member(caller_id, team_id, operator_id)` | | void | admin OR lead-of-team |
| `remove_team_member(caller_id, team_id, operator_id)` | | void | admin OR lead-of-team |
| `move_team_member(caller_id, from_team, to_team, operator_id)` | | void | admin OR lead-of-both (rare); atomic |

### 4.3. Team clients

| RPC | Args | Returns | Permission |
|---|---|---|---|
| `assign_team_clients(caller_id, team_id, client_ids[])` | | void | admin OR lead; **fail-all** atomic — если хоть один клиент уже назначен, возвращается error со списком конфликтов и ничего не пишется |
| `unassign_team_client(caller_id, team_id, client_id)` | | void | admin OR lead |
| `move_team_client(caller_id, from_team, to_team, client_id)` | | void | admin OR lead-of-both |

### 4.4. Curatorship

| RPC | Args | Returns | Permission |
|---|---|---|---|
| `list_curated_operators(caller_id, moderator_id)` | | rows: operator_id, name, ref_code, alias, team_name | admin OR self-moderator |
| `set_operator_curator(caller_id, operator_id, new_moderator_id)` | new_moderator_id NOT NULL (D-9) | void | admin OR current-curator OR new-moderator |
| `bulk_assign_curated_operators(caller_id, moderator_id, operator_ids[])` | | void; fail-all atomic | admin OR self-moderator |

### 4.5. Activity

| RPC | Args | Returns | Permission |
|---|---|---|---|
| `list_team_activity(caller_id, team_id, limit, offset)` | | rows: actor_name, event_type, payload, created_at | scope same as get_team_detail |

Всего: **16 RPC**.

---

## 5. UI surface

### 5.1. New page `/teams`

**Master panel (left, 360-400px):**

- Header: `Команды <count>` + `+ Создать команду` (admin only) → slide-out с минимумом (имя + лид-select).
- Search: по имени команды и имени лида.
- Filter chips: `Все · Активные · Архив` (паттерн Clients).
- List items: кружок-инициалы команды, имя, лид (имя + role-badge), counts «`3 оп. · 7 кл.`», status pill «Архив» если is_active=false.

**Detail panel (right, fluid):**

- Top bar: breadcrumb `Команды › <name>`, status toggle (admin), pagination ‹ N/M ›.
- Header: имя + лид (link to staff card) + role-badge + meta «Создана DD.MM.YYYY».
- Tabs: **`Состав` (default) · `Клиенты` · `Активность`**.

**Tab «Состав»:**

- Lead card сверху отдельно: avatar + имя + role-badge + change-link (admin).
- Operators list (0-N rows): avatar, имя, ref_code, alias, кнопка remove (admin/lead).
- Под списком: `+ Добавить оператора` → modal с поиском по unassigned operators + single-select.
- Empty state: «Команда без операторов · добавьте сотрудников».

**Tab «Клиенты»:**

- Toolbar: search по name/alias + `+ Добавить клиентов` → modal с multiselect по unassigned + batch assign.
- Grid из tile'ов: avatar клиента + name + alias + remove-кнопка (admin/lead).
- Empty: «Нет клиентов · назначьте моделей команде».

**Tab «Активность»:**

- Лента событий из `team_activity`. Паттерн `ActivityCard` из Subplan 3.
- Pagination через limit (initial 12 events, кнопка «Показать ещё»).

**Read-only mode:**

- Если caller не admin и не лид этой команды — все edit-кнопки скрыты, slide-out'ы недоступны, наверху pill «Только просмотр».
- Operator видит только свою команду в master (одна карточка), Detail в read-only.

### 5.2. Дополнения в `/staff/:refCode`

| В карточке сотрудника | Новый блок |
|---|---|
| **Operator** | `Команда: <name>` (link to /teams/:id) или «Не назначен» + change-link (admin/lead). `Куратор: <moderator name>` или «Не назначен» + change-link (admin/current-curator/new-moderator). |
| **Moderator** | `Курирует операторов: N` — collapsible list с avatar/name/team. Кнопка `Добавить операторов` → modal с multiselect (bulk-assign). Если ведёт команду — chip «Лид команды <name>» (link). |
| **Teamlead** | `Лид команды: <name>` (link). |

### 5.3. Sidebar nav

- Добавить пункт «Команды» (icon: users-group). Visible если:
  - User имеет `manage_teams` permission, ИЛИ
  - Role='operator' AND есть запись в `team_members` (lazy fetch на уровне `useAuth` или отдельный hook `useUserTeamMembership`).

### 5.4. Components структура

```
src/pages/
  TeamListPage.jsx                    — master-detail wrapper

src/components/teams/
  TeamList.jsx, TeamListItem.jsx      — master list
  TeamFilterChips.jsx                 — Все / Активные / Архив
  TeamDetailPanel.jsx                 — header + tabs
  TeamMembersTab.jsx                  — состав (lead card + operators list + add)
  TeamClientsTab.jsx                  — grid клиентов + add modal
  TeamActivityTab.jsx                 — лента событий
  CreateTeamSlideOut.jsx              — минимальная форма создания
  AddMemberModal.jsx                  — поиск unassigned operators
  AddClientsModal.jsx                 — multiselect unassigned clients
  ChangeLeadModal.jsx                 — выбор нового лида (admin)
  ArchiveTeamConfirmDialog.jsx        — confirm с counts освобождения
  EmptyZero.jsx, EmptyFilter.jsx      — empty states (паттерн Clients)
  ReadOnlyBadge.jsx                   — pill «Только просмотр»

src/components/staff/                 — расширить существующие
  CuratorBlock.jsx                    — для operator: показать/сменить куратора
  CuratedOperatorsBlock.jsx           — для moderator: список + bulk-add
  TeamMembershipBlock.jsx             — для operator: показать команду
  ChangeCuratorModal.jsx              — выбор нового куратора (required)
  AddCuratedOperatorsModal.jsx        — multiselect для bulk-assign

src/hooks/
  useTeamList.js, useTeam.js, useTeamMembers.js, useTeamClients.js
  useTeamActivity.js, useTeamActions.js
  useUnassignedOperators.js, useUnassignedClients.js
  useCuratorship.js, useUserTeamMembership.js

src/lib/
  teams.js                            — pluralize, formatLeadRole, validators, permission helpers
  teams.test.js
```

---

## 6. Бизнес-инварианты + error handling

| # | Правило | Где проверяется | UI message |
|---|---|---|---|
| **I-1** | `lead_user_id` имеет role IN ('teamlead','moderator') | `create_team`, `update_team` RPC pre-check | «Лидом может быть только тимлид или модератор» |
| **I-2** | `team_members.operator_id` имеет role='operator' | `add_team_member` | «Сотрудник не является оператором» |
| **I-3** | `team_members.operator_id` UNIQUE | DB constraint + RPC pre-check для friendly error | «Оператор уже в команде «<name>». Откройте её, чтобы перевести.» (с deep-link) |
| **I-4** | `team_clients.client_id` UNIQUE | DB + RPC | «Клиенты уже назначены: A, B, C. Снимите их сначала.» (с deep-links) |
| **I-5** | `moderator_operators.operator_id` UNIQUE | DB + RPC | «У оператора уже есть куратор: <name>» |
| **I-6** | `moderator_operators.moderator_id` имеет role='moderator' | RPC | «Куратором может быть только модератор» |
| **I-7** | Archive команды → cascade-освобождение members/clients | `archive_team` RPC body | UI confirm: «Архивировать команду? 3 оператора и 7 клиентов будут освобождены» |
| **I-8** | Permission scope per RPC (admin/lead/operator) | каждый RPC через `has_permission()` + ownership check | 403: «Недостаточно прав» |
| **I-9** | Деактивация user'а блокируется если ведёт команду или курирует операторов | `archive_user` RPC extension | «Нельзя архивировать: ведёт команду «X». Смените лида сначала.» |
| **I-10** | Move оператора между командами — atomic | `move_team_member` транзакция | На fail — rollback, error message |
| **I-11** | Куратор обязателен — `set_operator_curator(operator_id, NULL)` запрещён | RPC (NOT NULL on argument) | UI: при попытке снять — modal требует выбора замены |

### 6.1. Error states в UI

- **403** → toast «Недостаточно прав» + auto-redirect назад.
- **Conflict (UNIQUE)** → inline modal с explainable error + actionable links («Открыть команду где он сейчас»).
- **Network errors** → toast + retry button.
- **Empty/loading** → паттерны Clients: `EmptyZero / EmptyFilter / GridSkeleton / DetailSkeleton`.
- **Slow-load (>2 сек)** → подпись «Загружается…» (паттерн `useSlowFlag` из Clients).

---

## 7. Тестирование

### 7.1. Unit (Vitest)

| File | Coverage |
|---|---|
| `src/lib/teams.test.js` | `pluralizeTeamMembers`, `pluralizeOperators`, `formatLeadRole`, `canEditTeam(user, team)`, `canManageCuratorship(user, operator)`, `validateTeamName` |
| `src/lib/defaultPermissions.test.js` | Расширить под `manage_teams` распределение по ролям |

### 7.2. Hooks

| File | Cases |
|---|---|
| `src/hooks/useTeamList.test.js` | Scope-by-role фильтрация, search, filter chips, loading/error |
| `src/hooks/useTeam.test.js` | Reload after mutations |
| `src/hooks/useCuratorship.test.js` | Bulk assign, single move, обязательность куратора при снятии |

### 7.3. SQL/RPC smoke-checklist в плане

| Сценарий | Ожидаемое |
|---|---|
| `create_team` с лидом-operator | Error «Лидом может быть только тимлид или модератор» (I-1) |
| `add_team_member` с уже-в-команде оператором | Friendly error со ссылкой «Открыть команду» (I-3) |
| `assign_team_clients([id1, id2_already_assigned])` | Fail-all, error «Клиенты уже назначены» (I-4) |
| `move_team_member` с rollback в середине | Транзакция rollback, ничего не записано (I-10) |
| `archive_team` | Каскад освобождения членов/клиентов; они доступны для другой команды (I-7) |
| `set_operator_curator(operator, NULL)` | Error: required argument (I-11) |
| Operator вызывает `update_team` | 403 (I-8) |
| TL чужой команды вызывает `add_team_member` | 403 ownership check (I-8) |
| Деактивация user'а активного лида | Error «Нельзя архивировать: ведёт команду» (I-9) |

### 7.4. Smoke flow через preview

1. Admin создаёт команду «Test Squad», лид — известный TL.
2. Добавляет 2 операторов (один уже в команде → проверка conflict UI).
3. Назначает 3 клиентов через multiselect.
4. Открывает Staff карточку оператора → меняет куратора (modal с required-select).
5. Логин под этим оператором → видит только эту команду в `/teams`, всё read-only.
6. Admin архивирует команду → проверяет освобождение операторов/клиентов.

### 7.5. Что НЕ тестируем

- UI snapshot'ы (как Subplan 3).
- E2E (нет инфры; preview smoke — наш контракт).
- Performance / virtualization.

---

## 8. Migration order

Все миграции с префиксом даты, sequential nums (продолжаем за `_18` Subplan 3):

```
db/migrations/
  20260425_19_teams_schema.sql            -- 4 таблицы + 2 activity log
  20260425_20_rpc_teams_crud.sql          -- list/get/create/update/archive/restore
  20260425_21_rpc_teams_members.sql       -- add/remove/move
  20260425_22_rpc_teams_clients.sql       -- assign/unassign/move
  20260425_23_rpc_curatorship.sql         -- list/set/bulk
  20260425_24_archive_user_extension.sql  -- расширить archive_user блокировками I-9 + cascade очистка
  20260425_25_seed_dev_teams.sql          -- (dev only) 2-3 команды + кураторство для seed-операторов
```

7 миграций.

---

## 9. Acceptance criteria

После всех stages плана:

- Полный CRUD команд через UI (`/teams`).
- Назначение операторов и клиентов работает с обеих сторон (Team detail + Client detail).
- Кураторство — manual + bulk через Staff карточку модератора; обязательность при смене.
- Operator в Sidebar видит «Команды» только если назначен; на странице видит только свою.
- Деактивация user'а с ролью лида/куратора блокируется до replacement.
- Activity log записывает все mutations.
- Всё на DS-токенах (паттерны Clients).
- `npm test` passes.
- `npx vite build` без ошибок.
- Smoke через preview проходит сценарий §7.4.

---

## 10. Файлы для контекста (next session)

При начале plan'а / implementation'а:

- `docs/domain-model.md` (§3, §4.2, §6.4) — авторитет на схему и flow'ы.
- `docs/superpowers/specs/2026-04-25-crm-subplan-4-teams-design.md` (этот файл) — все решения.
- `docs/superpowers/plans/2026-04-25-crm-subplan-3-clients.md` — паттерны для нового плана (структура stages, formatting).
- `src/components/clients/` + `src/hooks/` — образец: master-detail, slide-out, activity card, empty states.
