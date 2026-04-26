# CRM Subplan 5 — Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan stage-by-stage.

**Goal:** Implement tasks (поручения) + reports per [domain-model.md](../../domain-model.md) §3, §4.2, §6.2-6.3 and [Subplan 5 Design Spec](../specs/2026-04-26-crm-subplan-5-tasks-design.md). Add `/tasks` master-detail page with box-tabs (Входящие/Исходящие/Все), Sidebar nav with overdue badge, and report submission flow with media upload.

**Architecture:** master-detail UI mirrors Subplans 3-4 (paths, slide-out create, ActivityCard, EmptyZero/Filter). 2 relational tables + 1 activity log. 11 RPC + 1 internal helper with strict assignment validation (D-2). Pure on-read computed `overdue` (no pg_cron). Single report per task (UNIQUE on task_id, idempotent re-submit). Public Storage bucket `task-reports` with `uploadWithRetry` from Subplan 3. Sidebar badge via `count_overdue_tasks` (cached hook pattern).

**Tech Stack:** React 19, Vite, Tailwind CSS v4, Supabase (PostgreSQL + RPC + Storage), Vitest, react-router-dom v7. **Без Claude Design loop'а** — строим на DS-токенах из Subplan 3 Stage 8 (`.btn-primary`, `.surface-card`, `.focus-ds`, etc.).

**Source of truth:**
- [docs/superpowers/specs/2026-04-26-crm-subplan-5-tasks-design.md](../specs/2026-04-26-crm-subplan-5-tasks-design.md) — все decisions, schema, RPC signatures, invariants.
- [docs/domain-model.md](../../domain-model.md) §3, §4.2, §6.2-6.3.
- [docs/superpowers/plans/2026-04-25-crm-subplan-4-teams.md](2026-04-25-crm-subplan-4-teams.md) — образец структуры plan'а; идентичные паттерны (Stage decomposition, smoke approach).

**Prerequisites:**
- Subplan 4 (Teams) merged в `main` ✓ (PR #17 squashed; commit `a307d3e`).
- Branch `feat/subplan-5-tasks` будет создан в Stage 1.
- `.env.local` с `VITE_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_KEY` для применения миграций.
- `manage_teams`, `team_members`, `moderator_operators` уже в production (Subplan 4) — `can_assign_task` на них ссылается.

---

## File structure

### Create — DB

```
db/migrations/
  20260426_27_tasks_schema.sql              # tasks, task_reports, task_activity + триггеры + RLS
  20260426_28_storage_task_reports.sql      # bucket setup
  20260426_29_rpc_can_assign_task.sql       # internal helper (no GRANT)
  20260426_30_rpc_tasks_read.sql            # list_tasks, get_task_detail, count_overdue_tasks, list_assignable_users
  20260426_31_rpc_tasks_write.sql           # create/update/cancel/take/submit_report/update_report/delete
  20260426_32_seed_dev_tasks.sql            # idempotent dev seed: 5-7 sample tasks
```

### Create — Lib

```
src/lib/
  tasks.js                                  # pluralize, formatDeadlineRelative, computeEffectiveStatus,
                                            # canEditTask/canAssignTask/canTakeInProgress/canSubmitReport/
                                            # canCancelTask, validateTaskTitle, validateReport
  tasks.test.js
```

### Create — Hooks

```
src/hooks/
  useTaskList.js            # filtered by box / status / search
  useTask.js                # single task + report + activity
  useTaskActions.js         # create/update/cancel/take/submit_report/update_report/delete
  useTaskActivity.js        # paginated loadMore (паттерн useTeamActivity)
  useAssignableUsers.js     # wraps list_assignable_users
  useUserOverdueCount.js    # cached count для Sidebar badge
```

### Create — Components (`src/components/tasks/`)

```
TaskList.jsx, TaskListItem.jsx
TaskBoxTabs.jsx                           # Входящие / Исходящие / Все
TaskFilterChips.jsx                       # status + срок
TaskDetailPanel.jsx                       # header + action row + sections
TaskFieldsCard.jsx                        # inline-edit deadline/assignee
TaskDescriptionCard.jsx                   # inline-edit description
TaskReportCard.jsx                        # submit form OR read-only display
TaskActivityCard.jsx                      # feed
CreateTaskSlideOut.jsx                    # форма создания
CancelTaskConfirmDialog.jsx
DeleteTaskConfirmDialog.jsx               # admin hard-delete с counts
AssigneeSelector.jsx                      # dropdown с фильтрацией by eligibility
EmptyZero.jsx, EmptyFilter.jsx, DetailEmptyHint.jsx
ReadOnlyBadge.jsx                         # переиспользуем из teams/ если возможно
```

### Modify — existing

```
src/App.jsx                               # add routes /tasks + /tasks/:taskId + /tasks/outbox + /tasks/all
src/components/Sidebar.jsx                # add «Задачи» nav с badge через useUserOverdueCount
src/lib/defaultPermissions.test.js        # sanity test для view_own_tasks/create_tasks distribution
src/pages/                                # new file TaskListPage.jsx (master-detail wrapper)
```

---

## Stages

8 этапов — match Subplan 4 структуру. После каждого — рабочий коммит и smoke-test через preview / psql checklist. Не двигаемся к следующему пока текущий не зелёный.

### Stage 1 — DB schema + permissions verify

**Цель:** Создать ветку, накатить таблицы + Storage bucket, проверить permission distribution.

- Создать ветку `feat/subplan-5-tasks` from `main` (`a307d3e` после merge Subplan 4).
- Написать миграцию `20260426_27_tasks_schema.sql` — точная схема per [spec §3.1](../specs/2026-04-26-crm-subplan-5-tasks-design.md#31-new-tables):
  - `tasks` (id, title, description, created_by, assigned_to, deadline, status, completed_at, created_at, updated_at) + 3 CHECK constraints (`title_not_empty`, `status_valid` — БЕЗ 'overdue', `completed_at_consistent`) + 5 индексов + trigger `_set_updated_at` + RLS enable.
  - `task_reports` (id, task_id UNIQUE, reporter_id, content, media jsonb, created_at, updated_at) + 1 CHECK (`non_empty`: content или media non-empty) + 1 индекс + trigger + RLS.
  - `task_activity` (id, task_id, actor_id, event_type text БЕЗ CHECK, payload, created_at) + 1 composite index + RLS.
- Написать миграцию `20260426_28_storage_task_reports.sql` — bucket `task-reports` (public, 500MB limit, allowed mime types JPG/PNG/WEBP/MP4/WEBM/MOV) идемпотентно через `INSERT ... ON CONFLICT (id) DO NOTHING` (паттерн `db/migrations/20260425_16_storage_buckets.sql` Subplan 3).
- Расширить `src/lib/defaultPermissions.test.js` — добавить describe block, проверяющий distribution `create_tasks`, `view_all_tasks`, `view_own_tasks` по ролям (admin/superadmin: create+view_all; teamlead/moderator: create+view_own; operator: view_own only). Не меняем production code — `defaultPermissions.js` уже корректен из Foundation.
- `npm test` — все existing + новые passes.

**Definition of done:**
- Ветка создана.
- 2 миграции написаны (schema + bucket).
- DB CHECK / UNIQUE / FK / RLS по spec.
- `npm test` зелёный.
- Commit: `feat(tasks): add db schema for tasks + reports (Subplan 5 Stage 1)`.

---

### Stage 2 — Helper RPC `can_assign_task`

**Цель:** Изолированный helper, который потом дёргают create_task и list_assignable_users.

- Миграция `20260426_29_rpc_can_assign_task.sql`:
  - `can_assign_task(p_caller_id integer, p_target_user_id integer) RETURNS boolean` — точное тело per [spec §4.3](../specs/2026-04-26-crm-subplan-5-tasks-design.md#43-helpers-internal-no-grant-execute--called-from-other-rpcs):
    - `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions`
    - admin/superadmin → true (∀)
    - TL/moderator + target ∈ (teamlead, moderator) → true (cross-staff coordination)
    - teamlead + operator → true if EXISTS team_members where caller leads that team AND target in same team
    - moderator + operator → true if EXISTS moderator_operators(moderator=caller, operator=target)
    - else false
  - **NO `GRANT EXECUTE`** — internal helper, called only from other RPCs (which use `SECURITY DEFINER`).
- Smoke psql checklist (in plan; staging-only verification):

  ```sql
  SELECT can_assign_task(<admin_id>, <any_id>);  -- true
  SELECT can_assign_task(<tl1_id>, <op_in_tl1_team_id>);  -- true
  SELECT can_assign_task(<tl1_id>, <op_in_tl2_team_id>);  -- false
  SELECT can_assign_task(<tl1_id>, <other_tl_id>);  -- true (cross-staff)
  SELECT can_assign_task(<mod1_id>, <curated_op_id>);  -- true
  SELECT can_assign_task(<mod1_id>, <not_curated_op_id>);  -- false
  SELECT can_assign_task(<op_id>, <anyone>);  -- false (operator can't create)
  ```

- `npm test` — без изменений (no JS).

**Definition of done:**
- Helper в БД (после применения).
- Smoke psql ок (на staging при PR).
- Commit: `feat(tasks): add can_assign_task helper (Stage 2)`.

---

### Stage 3 — Read RPC (list / detail / count / assignable)

**Цель:** 4 read-only RPC для UI.

- Миграция `20260426_30_rpc_tasks_read.sql`:

  | RPC | Behaviour |
  |---|---|
  | `list_tasks(p_caller_id, p_box text DEFAULT 'inbox', p_status text DEFAULT 'all', p_search text DEFAULT NULL)` | Returns rows: `id, title, description, created_by, created_by_name, assigned_to, assigned_to_name, deadline, status, effective_status, completed_at, has_report, created_at`. Box filter: `inbox` → `assigned_to=p_caller_id`; `outbox` → `created_by=p_caller_id`; `all` → no scope filter. Permission scope per [I-9 in spec §6](../specs/2026-04-26-crm-subplan-5-tasks-design.md): operator can only call with box='inbox' (RAISE if outbox); TL/Mod can use inbox+outbox; admin can use 'all'. Status filter applied AFTER computed `effective_status` (so `p_status='overdue'` works). Search ILIKE on title+description+assigned/created names. ORDER BY created_at DESC. Limit 200 (UI later adds pagination). |
  | `get_task_detail(p_caller_id, p_task_id)` | Returns single row: same columns + `description` (full) + `report jsonb` (`{id, reporter_id, reporter_name, content, media, created_at, updated_at}` or null) + `created_by_role` + `assigned_to_role` (для UI чтобы показать role-badge). Scope: caller must be created_by, assigned_to, или admin/superadmin (else empty). |
  | `count_overdue_tasks(p_caller_id)` | Returns integer — count of overdue tasks where caller is involved (created_by OR assigned_to). Computed per spec D-7. Used by Sidebar badge. |
  | `list_assignable_users(p_caller_id, p_search text DEFAULT NULL)` | Returns: `id, name, role, ref_code, alias, eligibility_reason text` of all users for whom `can_assign_task(p_caller_id, id) = true`. `eligibility_reason`: 'admin_full_access' / 'cross_staff' / 'own_team_operator' / 'curated_operator' (for UI tooltip). Search: ILIKE on name+alias+ref_code. Limit 50. |

- `effective_status` computation (use exactly this CASE in both list_tasks and get_task_detail):
  ```sql
  CASE
    WHEN tasks.deadline IS NOT NULL
     AND tasks.deadline < now()
     AND tasks.status IN ('pending', 'in_progress')
    THEN 'overdue'
    ELSE tasks.status
  END
  ```

- All 4 functions: `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions`. `GRANT EXECUTE ... TO anon, authenticated` after each.
- ROLLBACK comment block at footer.
- `npm test` unchanged.

**Definition of done:**
- 4 RPCs in migration.
- Russian developer-facing errors («только администратор может видеть все задачи», etc.) where applicable.
- Commit: `feat(tasks): add read RPCs for tasks (Stage 3)`.

---

### Stage 4 — Write RPC (create / update / cancel / lifecycle / report / delete)

**Цель:** 7 mutating RPC + сид.

- Миграция `20260426_31_rpc_tasks_write.sql` — 7 functions per [spec §4.2](../specs/2026-04-26-crm-subplan-5-tasks-design.md#42-write):

  #### `create_task(p_caller_id, p_title, p_description, p_deadline, p_assigned_to)` RETURNS integer

  - Permission: `has_permission(p_caller_id, 'create_tasks')`. Else `RAISE EXCEPTION 'caller % lacks create_tasks'`.
  - Validate p_title not null/empty.
  - Validate `p_assigned_to`: is_active, role in valid roles. If `NOT can_assign_task(p_caller_id, p_assigned_to)`: `RAISE EXCEPTION 'Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.'`
  - INSERT INTO tasks; status='pending'.
  - Audit: `task_created` payload `{title, assigned_to, deadline}`.
  - RETURN new id.

  #### `update_task(p_caller_id, p_task_id, p_title text DEFAULT NULL, p_description text DEFAULT NULL, p_deadline timestamptz DEFAULT NULL, p_assigned_to integer DEFAULT NULL)` RETURNS void

  - Lock: `SELECT title, description, deadline, assigned_to, status, created_by INTO ... FROM tasks WHERE id = p_task_id FOR UPDATE`. Raise if not found.
  - Permission: caller is admin/superadmin OR `created_by = p_caller_id`. Else 403.
  - If `p_assigned_to IS NOT NULL`:
    - I-8: must be `status='pending'`. Else friendly error.
    - I-2: `can_assign_task(p_caller_id, p_assigned_to)` else friendly error.
    - UPDATE assigned_to. Audit `task_reassigned` `{from_user_id, to_user_id}`.
  - Track changed fields list for `task_updated`. If `p_title IS NOT NULL` and differs: update + add 'title' to fields. Same for description.
  - If `p_deadline IS NOT NULL` and differs: update + audit `deadline_changed` `{from, to}` (per D-10, separate event).
  - At end, if title/description fields changed: single audit `task_updated{fields:[...]}`.

  #### `cancel_task(p_caller_id, p_task_id)` RETURNS void

  - Lock + load.
  - Permission: admin/superadmin OR created_by.
  - I-7: status must be in ('pending', 'in_progress'). Else `RAISE EXCEPTION 'Нельзя отменить завершённую задачу'`.
  - UPDATE status='cancelled'.
  - Audit `task_cancelled` `{reason: null}`.

  #### `take_task_in_progress(p_caller_id, p_task_id)` RETURNS void

  - Lock + load.
  - I-4: assigned_to must = p_caller_id. Else 'Только исполнитель может взять задачу'.
  - Status must = 'pending'. Else 'Задача уже в работе'.
  - UPDATE status='in_progress'.
  - Audit `taken_in_progress` `{}`.

  #### `submit_task_report(p_caller_id, p_task_id, p_content text, p_media jsonb)` RETURNS void

  - Lock + load.
  - I-5: assigned_to=caller AND status='in_progress'. Else friendly error.
  - I-5 content: `length(trim(coalesce(p_content,''))) > 0 OR jsonb_array_length(coalesce(p_media,'[]'::jsonb)) > 0`. Else 'Отчёт должен содержать описание или хотя бы один файл'.
  - INSERT INTO task_reports (task_id, reporter_id, content, media) VALUES (...) ON CONFLICT (task_id) DO UPDATE SET content = EXCLUDED.content, media = EXCLUDED.media, updated_at = now() (per I-6 idempotent).
  - UPDATE tasks SET status='done', completed_at=now().
  - Audit `report_submitted` `{has_content: bool, media_count: int}`.

  #### `update_task_report(p_caller_id, p_task_id, p_content text DEFAULT NULL, p_media jsonb DEFAULT NULL)` RETURNS void

  - Load existing report. If not found: error.
  - Permission: reporter_id = p_caller_id. Else 403.
  - Status must be 'done' (post-submission edits only).
  - If `p_content IS NOT NULL`: update. If `p_media IS NOT NULL`: update.
  - Validate I-5 still holds после update (content или media non-empty).
  - Audit `report_updated` `{has_content, media_count}`.

  #### `delete_task(p_caller_id, p_task_id)` RETURNS jsonb

  - Permission: admin/superadmin only.
  - Lock + load. Get list of media storage paths from task_reports for cleanup info.
  - Capture `v_media_paths text[]` before cascade.
  - DELETE FROM tasks (CASCADE удалит task_reports + task_activity).
  - Write final audit to `staff_activity` (т.к. task_activity тоже cascade удалится): `task_deleted` payload `{title, media_count}`.
  - Returns `jsonb_build_object('media_paths', v_media_paths)` — frontend удалит файлы из Storage через client.

- Миграция `20260426_32_seed_dev_tasks.sql` — идемпотентный DO-блок (паттерн `_25_seed_dev_teams.sql`):

  ```sql
  -- 5-7 задач между admin/TL/mod/operators из существующего seed.
  -- Skip if a task with same title already exists.
  -- Use sequential SELECT ... LIMIT/OFFSET для подбора users.
  -- Создать:
  --   1. От admin → operator: pending, deadline через 2 дня.
  --   2. От admin → operator: in_progress, deadline вчера → будет computed overdue.
  --   3. От admin → operator: done, completed (с inline отчётом — INSERT INTO task_reports).
  --   4. От TL → свой operator: pending, deadline через неделю.
  --   5. От moderator → курируемый operator: in_progress, deadline сегодня.
  --   6. От admin → moderator: pending (cross-staff), deadline через 3 дня.
  --   7. От admin → operator: cancelled (статус уже cancelled, audit event).
  ```

- `npm test` unchanged.

**Definition of done:**
- 7 RPCs in `_31`.
- Seed migration `_32`.
- ROLLBACK comment block в `_31`.
- Russian user-facing errors соответствуют spec §6 messages.
- Commit: `feat(tasks): add write RPCs for tasks + dev seed (Stage 4)`.

---

### Stage 5 — Lib + 6 hooks

**Цель:** JS layer. Pure helpers + 6 hooks.

- `src/lib/tasks.js`:

  ```javascript
  import { pluralRu } from './clients.js'

  // Plural forms
  export const pluralizeTasks = (n) =>
    `${n} ${pluralRu(n, { one: 'задача', few: 'задачи', many: 'задач' })}`

  // Format deadline relative to now: "сегодня в 14:00" / "через 2 дня" / "просрочено 3 дня"
  export function formatDeadlineRelative(deadline, now = new Date()) {
    if (!deadline) return ''
    const d = new Date(deadline)
    const diffMs = d.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays < 0) return `просрочено ${Math.abs(diffDays)} ${pluralRu(Math.abs(diffDays), { one: 'день', few: 'дня', many: 'дней' })}`
    if (diffDays === 0) return `сегодня в ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
    if (diffDays === 1) return 'завтра'
    return `через ${diffDays} ${pluralRu(diffDays, { one: 'день', few: 'дня', many: 'дней' })}`
  }

  // Mirror RPC computed status
  export function computeEffectiveStatus(task, now = new Date()) {
    if (!task) return null
    if (task.deadline && new Date(task.deadline) < now && ['pending','in_progress'].includes(task.status)) {
      return 'overdue'
    }
    return task.status
  }

  // Permission predicates
  export function canEditTask(user, task) {
    if (!user || !task) return false
    if (['admin','superadmin'].includes(user.role)) return true
    return task.created_by === user.id
  }

  export function canTakeInProgress(user, task) {
    if (!user || !task) return false
    return task.assigned_to === user.id && task.status === 'pending'
  }

  export function canSubmitReport(user, task) {
    if (!user || !task) return false
    return task.assigned_to === user.id && task.status === 'in_progress'
  }

  export function canCancelTask(user, task) {
    if (!user || !task) return false
    if (!['admin','superadmin'].includes(user.role) && task.created_by !== user.id) return false
    return ['pending','in_progress'].includes(task.status)
  }

  export function canDeleteTask(user) {
    if (!user) return false
    return ['admin','superadmin'].includes(user.role)
  }

  // Validators
  export function validateTaskTitle(value) {
    if (value == null || String(value).trim() === '') return { valid: false, error: 'Название задачи обязательно' }
    if (String(value).trim().length > 200) return { valid: false, error: 'Слишком длинное название (макс 200 симв.)' }
    return { valid: true }
  }

  export function validateReport(content, media) {
    const hasContent = content && String(content).trim().length > 0
    const hasMedia = Array.isArray(media) && media.length > 0
    if (!hasContent && !hasMedia) return { valid: false, error: 'Отчёт должен содержать описание или хотя бы один файл' }
    return { valid: true }
  }
  ```

- `src/lib/tasks.test.js` — минимум 3 кейса на каждую экспорт-функцию. Покрыть edge cases:
  - `formatDeadlineRelative`: null deadline; today; tomorrow; overdue 1 day; overdue 5 days; through pluralRu boundaries (1/2/5).
  - `computeEffectiveStatus`: pending past deadline → overdue; in_progress past deadline → overdue; done past deadline → done (NOT overdue per spec); cancelled → cancelled; null deadline → status as-is.
  - `canEditTask`/`canCancelTask`/etc.: null user, null task, admin yes, operator no, creator yes if status allows.

- 6 hooks. Шаблоны как Subplan 4 (cancellation flag + reloadKey + useCallback). Each in own file:

  - `useTaskList(callerId, opts={ box, status, search })` → `{ rows, loading, error, reload }`. Wraps `list_tasks`. Box default 'inbox'. Search debounce 300ms (use `useEffect` cleanup with timer).
  - `useTask(callerId, taskId)` → `{ row, loading, error, reload }`. Wraps `get_task_detail`. Returns single row from TABLE.
  - `useTaskActions(callerId)` → `{ createTask, updateTask, cancelTask, takeInProgress, submitReport, updateReport, deleteTask, mutating, error }`. Each action is async, throws on RPC error. `mutating` boolean (try/finally pattern from Subplan 4 useTeamActions).
  - `useTaskActivity(callerId, taskId, limit=12)` → `{ rows, loading, loadingMore, error, reload, loadMore }`. Wraps... wait, spec says activity returned inline with `get_task_detail`. Re-check: spec §4.1 `get_task_detail` returns `activity jsonb` (last 12 events). For paginated load-more, we'd need a separate RPC. Plan: include first 12 in get_task_detail response (no extra RPC), expose pagination as a backlog item. Hook returns derived from useTask row's `activity` array. Skip useTaskActivity hook — TaskActivityCard reads `row.activity` directly. **Adjust**: drop this hook, simpler.
  - `useAssignableUsers(callerId, search='')` → `{ rows, loading, error, reload }`. Wraps `list_assignable_users`.
  - `useUserOverdueCount(userId)` → `{ count, loading, reload }` + module-level Map cache + exported `invalidateUserOverdueCount(userId)`. Pattern matches `useUserTeamMembership` Subplan 4. Used by Sidebar.

- Updated hook list (drop useTaskActivity): **5 hooks**.
- Cache invalidation: `useTaskActions.takeInProgress`, `submitReport`, `cancelTask`, `deleteTask`, `updateTask` (when deadline changes) — all should call `invalidateUserOverdueCount(assigneeId)` AND `invalidateUserOverdueCount(creatorId)` after success. (Both могут быть affected.)

- `npm test` — все passes (включая new tasks.test.js).

**Definition of done:**
- `tasks.js` + tests ≥3 cases per export.
- 5 hooks created.
- All hooks invalidate overdue cache where appropriate.
- Commit: `feat(tasks): add lib helpers and React hooks (Stage 5)`.

---

### Stage 6 — TaskListPage + master + create slide-out + Sidebar

**Цель:** /tasks страница, master-список с box-tabs/filters/search, slide-out create, Sidebar nav с badge.

- Routes в `src/App.jsx`:
  ```jsx
  import { TaskListPage } from './pages/TaskListPage.jsx'
  // ...
  <Route path="/tasks" element={<TaskListPage />} />
  <Route path="/tasks/:taskId" element={<TaskListPage />} />
  <Route path="/tasks/outbox" element={<TaskListPage />} />
  <Route path="/tasks/outbox/:taskId" element={<TaskListPage />} />
  <Route path="/tasks/all" element={<TaskListPage />} />
  <Route path="/tasks/all/:taskId" element={<TaskListPage />} />
  ```

  Wrap в auth gate как ClientListPage / TeamListPage.

- `src/pages/TaskListPage.jsx` — master-detail (паттерн `TeamListPage.jsx`):
  - URL parsing: derive `box` from URL (`/tasks` → inbox, `/tasks/outbox` → outbox, `/tasks/all` → all). Derive `taskId` from URL.
  - State: filter chips status (default 'all'), filter chips deadline ('all'), search.
  - Use `useTaskList(user.id, { box, status, search })`.
  - Master section (440px / fluid on empty) — `TaskBoxTabs`, search input, `TaskFilterChips`, `TaskList` или `EmptyZero` или `EmptyFilter`.
  - Detail section — `TaskDetailPanel` (Stage 7) или `DetailEmptyHint` placeholder.
  - 1024px breakpoint master/detail collapse (как TeamListPage).
  - Slide-out create when `+ Новая задача` clicked (admin/TL/mod with `create_tasks`).

- `src/components/tasks/TaskList.jsx` + `TaskListItem.jsx`:
  - List item: status pill (с overdue red если effective_status='overdue'), title (truncate+title), meta `От Анна → Иван · до 28 апр HH:MM` или `просрочено 3 дня`. Active = vertical accent bar (border-l-primary).
  - Status pill: 5 цветов (pending: muted, in_progress: blue-soft, done: success-soft, overdue: danger-soft, cancelled: muted-50).

- `src/components/tasks/TaskBoxTabs.jsx`:
  - 3 tabs (Входящие / Исходящие / Все). Все только если user has `view_all_tasks`.
  - Active tab: `border-b-2 border-primary text-foreground font-semibold`.
  - On click: navigate to `/tasks` / `/tasks/outbox` / `/tasks/all`.

- `src/components/tasks/TaskFilterChips.jsx`:
  - 2 chip rows: Статус (Все/pending/in_progress/done/overdue/cancelled) + Срок (Все/Сегодня/Эта неделя/Просроченные).
  - Active chip styled `border-primary bg-[var(--primary-soft)] text-[var(--primary-ink)]`.
  - Local state lifted to TaskListPage (passes to useTaskList).

- `src/components/tasks/EmptyZero.jsx` / `EmptyFilter.jsx` / `DetailEmptyHint.jsx` — паттерны Subplan 3-4. Copy:
  - Zero (inbox): «Нет задач для вас».
  - Zero (outbox): «Вы не создали задач».
  - Filter: «Под фильтр ничего не подходит».
  - Hint: «Выберите задачу слева».

- `src/components/tasks/CreateTaskSlideOut.jsx` — паттерн `CreateTeamSlideOut`:
  - 4 поля: Title (required, validateTaskTitle), Description (textarea, optional), Deadline (datetime-local input, optional), Assignee (`AssigneeSelector`).
  - `AssigneeSelector` — отдельный компонент: search input + dropdown с `useAssignableUsers(callerId, search)`. Каждая опция: avatar-initials + name + role-badge + `eligibility_reason` tooltip («ваш оператор» / «другой тимлид» / «курируемый оператор»).
  - Submit → `useTaskActions().createTask(...)` → `onCreated(newId)` → redirect to `/tasks/<box>/<newId>` (preserve current box).
  - Hotkeys: Esc + Cmd/Ctrl+Enter. Confirm-on-close для dirty form (~4 fields, минимально полезно).

- `src/components/Sidebar.jsx` — добавить пункт «Задачи» с badge:
  ```jsx
  import { useUserOverdueCount } from '../hooks/useUserOverdueCount.js'

  // Inside Sidebar, conditional based on permissions:
  const showTasks = hasPermission(user, 'view_own_tasks')
  const { count: overdueCount } = useUserOverdueCount(user?.id)

  {showTasks && (
    <NavItem to="/tasks" icon={ClipboardList} label="Задачи">
      {overdueCount > 0 && (
        <span className="bg-[var(--danger)] text-primary-foreground rounded-full px-2 text-xs tabular">
          {overdueCount}
        </span>
      )}
    </NavItem>
  )}
  ```

  (Точная JSX структура зависит от существующего Sidebar code — посмотреть пример «Команды» badge паттерн.)

- Smoke в preview:
  1. Залогиниться admin → видим «Задачи» в sidebar (badge с overdue count если seed создал просроченную).
  2. Открыть `/tasks` → seed inbox (если admin assigned to admin = empty, но через `/tasks/outbox` видим созданные).
  3. Tab switching работает (URL меняется).
  4. Filter chips работают.
  5. Search фильтрует.
  6. Click `+ Новая задача` → slide-out открыт. Validation работает. Submit → redirect.

**Definition of done:**
- `/tasks/*` routes работают.
- Box-tabs + filters + search wire up.
- CreateTaskSlideOut работает (validation + assignment dropdown).
- Sidebar badge показывает overdue count.
- Mobile collapse <1024px.
- Commit: `feat(tasks): add /tasks page master + create slide-out + sidebar badge (Stage 6)`.

---

### Stage 7 — TaskDetailPanel + sections + lifecycle buttons

**Цель:** Полный detail UI: header, action buttons, 4 sections (description / fields / report / activity).

- `src/components/tasks/TaskDetailPanel.jsx` (паттерн `TeamDetailPanel`):
  - Top bar: breadcrumb `Задачи › <title-truncated>`, pagination ‹ N/M ›.
  - Header: title h1 (truncate+title), status pill (computed effective_status), meta `От <creator> · Исполнитель <assignee> · Дедлайн ...`.
  - **Action-buttons row** (под header):
    - Operator (assigned_to=me):
      - status=pending → `<button>` «Взял в работу» → `useTaskActions().takeInProgress(taskId)` → optimistic refresh.
      - status=in_progress → `<button>` «К отчёту» — scrolls to TaskReportCard (smooth scroll).
    - Creator OR admin:
      - status ∈ pending/in_progress → `<button>` «Отменить задачу» (btn-danger-ghost) → CancelTaskConfirmDialog.
    - Admin/superadmin:
      - status ∈ done/cancelled → `<button>` «Удалить задачу» (btn-danger-ghost) → DeleteTaskConfirmDialog (с media count).
  - Body single column (max-w-3xl mx-auto):
    - `<TaskDescriptionCard>`
    - `<TaskFieldsCard>`
    - `<TaskReportCard>`
    - `<TaskActivityCard>`

- `src/components/tasks/TaskDescriptionCard.jsx`:
  - Card structure: header «Описание» + edit-pencil if `canEditTask(user, task)`.
  - Display: plain text (whitespace-pre-line) или italic placeholder «Без описания».
  - Edit mode: textarea + save/cancel (паттерн ProfileTab.jsx Subplan 3).
  - Submit → `useTaskActions().updateTask(taskId, { description: value })`.

- `src/components/tasks/TaskFieldsCard.jsx`:
  - Card with 2-col grid: Deadline (datetime-local input) + Assignee (`AssigneeSelector` reused).
  - Edit-pencil on each field (или global pencil); deadline edit always allowed (status not done/cancelled), assignee edit only if status=pending (per I-8).
  - On save → `useTaskActions().updateTask(taskId, { deadline: ... })` или `{ assignedTo: ... }`.

- `src/components/tasks/TaskReportCard.jsx`:
  - Conditional render based on status + role:
    - status=pending: hint «Отчёт появится после взятия в работу».
    - status=in_progress AND assigned_to=me: form — textarea (content) + media drop-zone. Drop-zone reuses `uploadWithRetry` from `src/lib/upload.js` (Subplan 3). On submit: validate via `validateReport()`, call `submitReport(taskId, content, media)`. media is array `[{type, storage_path, filename, size_bytes, mime_type, width?, height?, duration_ms?}]`.
    - status=in_progress AND assigned_to≠me: hint «Ждём отчёта от <name>».
    - status=done: read-only display. Content paragraph (whitespace-pre-line). Media gallery: tile-grid (3 cols) with click → `<ClientLightbox>` (reuse from `src/components/clients/ClientLightbox.jsx` без изменений; passes media items).
    - status=cancelled: hint «Задача отменена».
  - For done state: edit-pencil if `canEditTask(user, task)` AND `reporter_id=me` → opens edit form (textarea + media manager).

- `src/components/tasks/TaskActivityCard.jsx`:
  - Reads `task.activity` from row (already loaded by `useTask`).
  - Render feed of events (паттерн ActivityCard Subplans 3-4).
  - `humanizeTaskEvent(event_type, payload)`:
    - `task_created` → «создал(а) задачу»
    - `task_updated` → `«обновил(а): ${fields}»` joined ru ('название', 'описание')
    - `task_reassigned` → «переназначил(а) задачу»
    - `taken_in_progress` → «взял(а) в работу»
    - `report_submitted` → «отправил(а) отчёт» (+ media count if >0)
    - `report_updated` → «обновил(а) отчёт»
    - `task_cancelled` → «отменил(а) задачу»
    - `deadline_changed` → «изменил(а) дедлайн»
  - Show first 12 events, no pagination (per Stage 5 simplification).

- `src/components/tasks/CancelTaskConfirmDialog.jsx`:
  - «Отменить задачу <title>?» + body «Задача перейдёт в статус «Отменена». Это действие можно будет увидеть в истории, но не отменить.»
  - Buttons: Отмена (btn-ghost) + Отменить задачу (btn-danger-ghost).
  - On confirm → `useTaskActions().cancelTask(taskId)`.

- `src/components/tasks/DeleteTaskConfirmDialog.jsx`:
  - «Удалить задачу <title> безвозвратно?» + body «N файлов отчёта будут удалены».
  - Confirm → `useTaskActions().deleteTask(taskId)` → `result.media_paths` → loop через `supabase.storage.from('task-reports').remove([path])` (matches Subplan 3 client-photos delete pattern).
  - Redirect to `/tasks` after success.

- Smoke в preview (с применёнными миграциями на staging):
  1. Open seeded task in detail → видим title, status, meta, sections.
  2. Operator нажимает «Взял в работу» → status flips, audit event.
  3. Operator аплоадит фото в TaskReportCard → видит progress.
  4. Submit «Завершить с отчётом» → status done. Report is now read-only.
  5. Click photo → lightbox opens (через ClientLightbox).
  6. Admin меняет deadline → audit event «изменил дедлайн».
  7. Admin отменяет задачу (другую, не done) → status cancelled.
  8. Admin удаляет cancelled → confirm с media count → redirect.

**Definition of done:**
- TaskDetailPanel со всеми 4 sections.
- Lifecycle buttons работают (take / submit / cancel / delete).
- Edit pencils работают (description / deadline / assignee per status rules).
- Lightbox reuse работает.
- Mobile responsive.
- Commit: `feat(tasks): TaskDetailPanel with lifecycle buttons + report (Stage 7)`.

---

### Stage 8 — Polish pass + smoke flow + acceptance verification

**Цель:** Финальный pass под Subplan 3 Stage 8 паттерны.

- **Realistic skeletons** (паттерн `ClientList` Subplan 3 / `TeamList` Subplan 4):
  - `TaskListSkeleton` в `TaskList.jsx` — 6 rows mirroring TaskListItem (status pill placeholder + title shimmer + meta shimmer).
  - `TaskDetailSkeleton` в `TaskDetailPanel.jsx` — top bar + header + action row + 4 cards skeleton (mirror real layout). Add slow-loading hint (>2s) per `useSlowFlag` pattern.
- **role="alert"** on error states:
  - TaskList error block.
  - TaskDetailPanel error block.
  - Inline errors in CreateTaskSlideOut + TaskReportCard (validation errors with role="alert" + aria-live).
- **Focus management** in modals:
  - CancelTaskConfirmDialog / DeleteTaskConfirmDialog — focus first interactive on open, restore on close.
  - CreateTaskSlideOut — focus title input on open.
  - Esc to close (already in patterns).
- **aria-labels** on icon-only buttons (edit pencil, close X, navigation arrows).
- **Long content truncation**:
  - title в TaskListItem + breadcrumb: `truncate` + `title=` attr.
  - Long description в Detail: not truncated (full visible since detail is wide), but with `whitespace-pre-line`.
  - Long report content: not truncated (max-w-3xl wraps).
- **Mobile responsive verification**: master-detail collapse <1024px (already in TaskListPage); modals scrollable (`max-h-[90vh] overflow-auto`).
- **Slow-loading hints** in master list (>2s) — per `useSlowFlag` pattern из Subplan 4.

- **Final smoke flow** (на staging после применения 6 миграций):
  1. Admin создаёт задачу TL'у через slide-out (deadline через 2 дня).
  2. Login TL → видит inbox, нажимает «Взял в работу». Status in_progress.
  3. TL завершает с отчётом + фото. Status done.
  4. Login admin → outbox → видит report, открывает фото в lightbox.
  5. Admin меняет deadline существующей задачи на завтра → audit event «изменил дедлайн».
  6. Admin создаёт ещё задачу с deadline вчера → видит overdue chip + Sidebar badge increments.
  7. Admin отменяет одну задачу → cancelled.
  8. Admin удаляет cancelled задачу → confirm → media из Storage cleanup → redirect.
  9. Login operator (один из тех кто получил задачу) → видит /tasks с his inbox; кнопки edit / delete / отменить НЕ показаны (read-only кроме своих lifecycle-кнопок).
  10. Operator пробует через DevTools напрямую вызвать `update_task` → 403 (RLS scope).

- Запустить:
  - `npm test` — все 123 + new tasks.test.js cases passes.
  - `npx vite build` — без warnings/errors.

**Definition of done:**
- Polishing pass завершён.
- Smoke flow проходит.
- `npm test` + `npx vite build` зелёные.
- Commit: `feat(tasks): polishing pass + final smoke (Stage 8)`.

---

## Open questions (могут возникнуть в plan-time)

Из [spec §1](../specs/2026-04-26-crm-subplan-5-tasks-design.md#1-goal--non-goals) — все «out of scope» зафиксированы как deferred mini-subplans (5A acceptance, 5B notifications). При появлении real-world need — открываем отдельные spec-файлы.

**Implementation-time нюансы**:
- **Activity feed pagination** — currently embedded в `get_task_detail` (last 12 events). Если задачи накопят >100 events (вряд ли в обозримом будущем), добавим `list_task_activity` отдельно.
- **`created_by IS NULL` после deactivation** — `tasks.created_by ON DELETE SET NULL`. UI `TaskListItem` должен gracefully показать «От: <удалённый пользователь>» если null. Реализация в `humanizeTaskEvent` + display strings.
- **Storage cleanup на delete_task** — RPC возвращает paths, frontend удаляет через `supabase.storage.from('task-reports').remove(paths)`. Если delete RPC succeeded но storage delete failed — оставляем оrphaned files. Acceptable для MVP (Storage costs minimal).

---

## Acceptance criteria

После всех 8 stages (per [spec §9](../specs/2026-04-26-crm-subplan-5-tasks-design.md#9-acceptance-criteria)):

- Полный CRUD задач через UI (`/tasks`).
- Box-tabs + filter chips (status + срок) + search работают.
- Lifecycle: pending → in_progress → done с required отчётом.
- Cancel flow для creator/admin.
- Hard delete для admin с media cleanup.
- Assignment validation (D-2) + UI dropdown через `list_assignable_users`.
- Computed overdue + Sidebar badge.
- Upload отчёта с media через `uploadWithRetry` + lightbox для просмотра.
- Activity log записывает все mutations.
- Edit policy: title/desc/deadline anytime, reassign только pending, cancel pending/in_progress.
- Деактивация user'а не блокируется задачами; orphaned tasks visible muted в UI.
- DS-токены (паттерны Subplan 3-4).
- `npm test` passes.
- `npx vite build` без ошибок.
- Smoke flow §7.3 проходит на staging.

---

## Notes для исполнителя

- **Reuse Subplan 3-4 patterns**: master-detail layout, slide-out create chrome, ActivityCard structure, EmptyZero/Filter, useSlowFlag, focus management в modals, ClientLightbox без изменений (для media в done report).
- **Reuse `uploadWithRetry`** из `src/lib/upload.js` (Subplan 3 Stage 8) — без модификаций. Bucket arg = 'task-reports'.
- **DS-токены приоритет** — переиспользуем `.btn-primary`, `.btn-ghost`, `.btn-danger-ghost`, `.surface-card`, `.focus-ds`, `.label-caps`, `.tabular`.
- **Reuse `ClientLightbox`** — items array structure compatible (нужны: type, storage_path, filename, size_bytes, mime_type, width, height, duration_ms). Для tasks media — bucket прикручивается через item.bucket — но текущий `ClientLightbox.jsx` хардкодит bucket по type. **Action в Stage 7**: добавить optional `bucket` field в media item; если есть — использовать вместо хардкоднутого. Минимальная backward-compatible модификация.
- **При сомнениях по схеме / RPC** — авторитет [spec §3, §4](../specs/2026-04-26-crm-subplan-5-tasks-design.md), затем `domain-model.md`.
- **Memo / useCallback** — только если профайлер показывает реальный bottleneck.
- **Тесты** — пишем для logic-helpers (lib/tasks.js) и optional thin smoke для hooks. UI snapshot не пишем.
- **Не ломаем Subplan 4** — `apply_user_archived_side_effects` остаётся как есть (orphan task пути не блокируют деактивацию).
- **Dev seed `_32`** — graceful skip если не хватает users / clients.
