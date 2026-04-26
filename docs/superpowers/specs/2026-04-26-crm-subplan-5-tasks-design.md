# CRM Subplan 5 — Задачи + отчёты · Design Spec

**Status:** Brainstormed · approved.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-26.
**Implements:** Domain model §3, §4.2 «Subplan 5 — Задачи», §6.2-6.3.

---

## 1. Goal & non-goals

**Goal:** Ввести систему задач (поручений) и отчётов как в [domain-model.md](../../domain-model.md) §4.2. Завершает функциональный CRM-стек: Staff (Subplan 2) → Clients (Subplan 3) → Teams + кураторство (Subplan 4) → Tasks (этот subplan).

**В scope:**

- 2 реляционных таблицы (`tasks`, `task_reports`) + 1 activity log (`task_activity`).
- 1 Storage bucket: `task-reports` (public, паттерн Subplan 3).
- 11 RPC + 1 internal helper: list / detail / count_overdue / list_assignable_users + create / update / cancel / take_in_progress / submit_report / update_report / delete (admin) + `can_assign_task`.
- Новая страница `/tasks` master-detail с box-tabs (Входящие / Исходящие / Все), filter chips, search, slide-out create.
- TaskDetailPanel с action-buttons (Взял в работу / Завершить / Отменить / Edit поля / Edit описание).
- Storage upload в reports через `uploadWithRetry` (паттерн Subplan 3).
- Sidebar nav «Задачи» с badge overdue-count.
- Computed `overdue` статус (без background job).

**Out of scope (deferred, additive):**

- **Acceptance flow** (creator принимает/отклоняет отчёт) — расширение enum `submitted/rejected` + 2 RPC + UI кнопки. Mini-subplan «Tasks 5A» если пойдёт реальный feedback.
- **Notifications** (`/notifications` page с лентой задачных событий, email/push). Mini-subplan «Tasks 5B». Уже есть `usePendingDeletionCount` паттерн как образец для лентой.
- **Threaded comments** (обсуждение между creator и assignee помимо одного отчёта). Out — это часть «чата» (`use_chat` permission уже зарезервирован).
- **Background overdue** через pg_cron — заменён на pure on-read computed (см. D-7).
- **Полный визуальный pass** под Claude Design — отложен до Subplan 6 (Design system).
- **Mobile-first дизайн** — defensive responsive (collapse <1024px, как Subplan 3-4).

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Subplan 5 = MVP basic: tasks CRUD + media upload в отчёты + статусы + on-read overdue + страница /tasks с inbox/outbox. Без acceptance flow, notifications, comments. | Tasks как самостоятельная сущность работают в минимальной форме. Расширения — операционные улучшения по реальному feedback. Все аддитивны (не ломают MVP). |
| **D-2** | Assignment rules — strict per role + ownership: admin∀; TL → own_team_operators ∪ TL/mod; mod → curated_operators ∪ TL/mod; operator не создаёт. | Соответствует domain §6.2 напрямую. Защищает от ошибок («случайно назначил не своему»). Cross-staff coordination (TL↔mod) разрешена. |
| **D-3** | Lifecycle: 3 explicit transitions + report required для done. `pending → in_progress (operator clicks "Взял в работу") → done (operator clicks "Завершить" + обязательный отчёт с content или media)`. `cancelled` отдельно через `cancel_task`. `overdue` computed. | Explicit `in_progress` — visibility сигнал creator'у («взято в работу»). Required report — контракт «выполнено = есть пруф». |
| **D-4** | UI: master-detail (как Clients/Teams), box-tabs (Входящие/Исходящие/Все), filter chips (status + срок), search. | Консистентно с Clients/Teams patterns. Detail-панель удобна для просмотра отчёта + будущих accept/reject кнопок. Kanban — accidental drag flips + плохо на mobile. |
| **D-5** | Один отчёт на задачу (UNIQUE на task_id). Re-submit = UPDATE existing (idempotent). | Реальный workflow: «сделай X» → один отчёт «сделал X». Multi-reports — UX-шум. Comments вне scope (chat permission зарезервирован). |
| **D-6** | Edit-policy: title/description/deadline — anytime by creator/admin. Reassign — only if `status=pending`. Cancel — `pending/in_progress`. Done — нельзя отменить (создавай новую). | Защита от race («переназначили пока оператор писал отчёт»). Преcrumb от ops realities. |
| **D-7** | Overdue mechanism — pure on-read computed. Колонка `status` хранит pending/in_progress/done/cancelled. Computed в RPC: `CASE WHEN deadline < now() AND status IN (pending,in_progress) THEN 'overdue' ELSE status END AS effective_status`. | Простота: нет infra, нет race, нет фонового UPDATE wasteful. Всегда актуальный. Минус — CASE в каждом SELECT (~3-4 RPC). |
| **D-8** | Overdue visibility — badge на Sidebar пункте «Задачи» с count overdue для текущего user'а. Через хук `useUserOverdueCount` (cached, паттерн `usePendingDeletionCount`). | Zero-cost visibility. Соответствует существующему паттерну. Без notifications infrastructure. |
| **D-9** | Cancel задачи — без обязательного `reason`. Просто отмена с audit event. | YAGNI. Если в будущем acceptance flow добавит rejection с причиной — там и пригодится reason field. |
| **D-10** | Edit deadline на задаче в `in_progress` — пишет audit event `deadline_extended` (или `deadline_changed`) с payload `{from, to}`. | Важно знать кто и когда сдвинул дедлайн (audit-trail для disputes). |
| **D-11** | Storage `task-reports` bucket — public, как `client-photos` (Subplan 3 pattern). URL обскурирован через random path. RLS на уровне `task_reports` table через RPC. | MVP-уровень. Real signed-URL security — отдельная задача (vital для production, но out of scope для функционального стека). |
| **D-12** | Без Claude Design loop'а на Subplan 5 (как Subplan 4). Строим на DS-токенах. Финальный shell-redesign в Subplan 6. | Tasks — стандартный master-detail + form. Дизайн-цикл = overengineering. Один self-review в конце Stage 8 эквивалент. |

---

## 3. Database schema

### 3.1. New tables

```sql
-- Задача
CREATE TABLE tasks (
  id            serial PRIMARY KEY,
  title         text NOT NULL,
  description   text,
  created_by    int REFERENCES dashboard_users(id) ON DELETE SET NULL,
  assigned_to   int NOT NULL REFERENCES dashboard_users(id) ON DELETE RESTRICT,
  deadline      timestamptz,
  status        text NOT NULL DEFAULT 'pending',
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT tasks_status_valid CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  CONSTRAINT tasks_completed_at_consistent CHECK (
    (status = 'done' AND completed_at IS NOT NULL)
    OR (status <> 'done' AND completed_at IS NULL)
  )
);

CREATE INDEX idx_tasks_assigned_to ON tasks (assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks (created_by);
CREATE INDEX idx_tasks_status ON tasks (status);
CREATE INDEX idx_tasks_deadline ON tasks (deadline) WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_tasks_created_at ON tasks (created_at DESC);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Отчёт оператора (1 на задачу)
CREATE TABLE task_reports (
  id           serial PRIMARY KEY,
  task_id      int NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reporter_id  int NOT NULL REFERENCES dashboard_users(id) ON DELETE SET NULL,
  content      text,
  media        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_reports_task_unique UNIQUE (task_id),
  CONSTRAINT task_reports_non_empty CHECK (
    length(trim(coalesce(content, ''))) > 0 OR jsonb_array_length(media) > 0
  )
);

CREATE INDEX idx_task_reports_reporter_id ON task_reports (reporter_id);

CREATE TRIGGER trg_task_reports_updated_at
  BEFORE UPDATE ON task_reports FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

ALTER TABLE task_reports ENABLE ROW LEVEL SECURITY;

-- Activity log для задач (паттерн team_activity)
CREATE TABLE task_activity (
  id         serial PRIMARY KEY,
  task_id    int REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   int REFERENCES dashboard_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,  -- open vocabulary; no CHECK
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_activity_task_created ON task_activity (task_id, created_at DESC);

ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;
```

### 3.2. Event vocabulary (для `task_activity`)

- `task_created` payload `{title, assigned_to, deadline}`
- `task_updated` payload `{fields: ['title' | 'description' | 'deadline']}` (group)
- `task_reassigned` payload `{from_user_id, to_user_id}` (only when `status=pending`)
- `taken_in_progress` payload `{}` (по факту от operator)
- `report_submitted` payload `{has_content, media_count}` (status → done)
- `report_updated` payload `{has_content, media_count}` (idempotent re-submit OR future acceptance flow rejection-edit)
- `task_cancelled` payload `{reason: null}` (per D-9 reason пока null; зарезервировано)
- `deadline_changed` payload `{from, to}` (per D-10; specific event для visibility)

### 3.3. Storage bucket

```sql
-- В отдельной storage migration (или inline):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-reports', 'task-reports', true,  -- public per D-11
  524288000,  -- 500 MB max (для видео)
  ARRAY['image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;
```

Лимиты на frontend (валидация перед upload, паттерн `validateFile` из `lib/clients.js`):
- Фото: 25 МБ
- Видео: 500 МБ
- До 10 файлов на отчёт (UI hint, не constraint)

### 3.4. Permissions

`create_tasks`, `view_all_tasks`, `view_own_tasks` уже распределены в Foundation:
- admin/superadmin: `create_tasks` + `view_all_tasks`
- teamlead/moderator: `create_tasks` + `view_own_tasks`
- operator: `view_own_tasks`

Новых permissions не добавляем. Тест `defaultPermissions.test.js` расширяем для sanity.

### 3.5. Соседние таблицы (без изменений)

- `dashboard_users` — read для assignment validation (через team_members + moderator_operators).
- `team_members`, `moderator_operators` — read для `can_assign_task()` helper.

---

## 4. RPC surface

Все RPC: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions`. `GRANT EXECUTE TO anon, authenticated`.

### 4.1. Read

| RPC | Args | Returns |
|---|---|---|
| `list_tasks(p_caller_id, p_box text DEFAULT 'inbox', p_status text DEFAULT 'all', p_search text DEFAULT NULL)` | `p_box ∈ ('inbox','outbox','all')`; `p_status ∈ ('all','pending','in_progress','done','overdue','cancelled')` (overdue фильтр работает через computed) | TABLE: id, title, description, created_by, created_by_name, assigned_to, assigned_to_name, deadline, status, effective_status (computed overdue), completed_at, has_report (bool), created_at |
| `get_task_detail(p_caller_id, p_task_id)` | | TABLE single row: + `report jsonb` ({reporter_id, content, media, created_at, updated_at}|null) + `activity jsonb` (last 12 events) |
| `count_overdue_tasks(p_caller_id)` | | integer — overdue по input+outbox для caller |
| `list_assignable_users(p_caller_id, p_search text DEFAULT NULL)` | | TABLE: id, name, role, ref_code, alias, eligibility_reason text — applies D-2 strict rules per caller's role, returns who caller can assign to. Limit 50. |

### 4.2. Write

| RPC | Args | Behaviour |
|---|---|---|
| `create_task(p_caller_id, p_title, p_description, p_deadline, p_assigned_to)` | | Permission `create_tasks`. Validate I-2 via `can_assign_task(p_caller_id, p_assigned_to)`. INSERT, audit `task_created`. RETURNS new id. |
| `update_task(p_caller_id, p_task_id, p_title?, p_description?, p_deadline?, p_assigned_to?)` | partial; NULL = не менять | Permission: admin/superadmin OR `created_by=caller`. If `p_assigned_to` provided: must be `status=pending` (I-8) + can_assign_task. Audit per field group: `task_updated{fields:[...]}` для title/description, `deadline_changed{from,to}` отдельно (D-10), `task_reassigned{from,to}` отдельно. |
| `cancel_task(p_caller_id, p_task_id)` | | Permission: admin/superadmin OR creator. Status must be pending/in_progress (I-7). UPDATE status='cancelled'. Audit `task_cancelled{reason:null}`. |
| `take_task_in_progress(p_caller_id, p_task_id)` | | `assigned_to=caller AND status=pending` (I-4). UPDATE status='in_progress'. Audit `taken_in_progress`. |
| `submit_task_report(p_caller_id, p_task_id, p_content text, p_media jsonb)` | media: `[{type:'image'|'video', storage_path, filename, size_bytes, mime_type, ...}]` | `assigned_to=caller AND status=in_progress` (I-5). Validate I-5 (content OR media). INSERT INTO task_reports ... ON CONFLICT (task_id) DO UPDATE (для idempotent re-submit при race; per I-6). UPDATE tasks SET status='done', completed_at=now(). Audit `report_submitted{has_content, media_count}`. |
| `update_task_report(p_caller_id, p_task_id, p_content?, p_media?)` | | `reporter_id=caller`. Status must be done. UPDATE existing report. Audit `report_updated`. (Зарезервировано для будущего acceptance-rejection flow.) |
| `delete_task(p_caller_id, p_task_id)` | | Permission: admin/superadmin only. CASCADE FK → task_reports → trigger Storage cleanup для media files (через RPC return list). Audit `task_deleted` в *staff_activity* (т.к. task_activity тоже cascade'нется). |

### 4.3. Helpers (internal, no GRANT EXECUTE — called from other RPCs)

```sql
-- Returns true if caller can assign task to target_user per D-2 rules.
CREATE OR REPLACE FUNCTION can_assign_task(p_caller_id integer, p_target_user_id integer)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = p_caller_id;
  SELECT role INTO v_target_role FROM dashboard_users WHERE id = p_target_user_id AND is_active = true;
  IF v_target_role IS NULL THEN RETURN false; END IF;

  -- Admin/superadmin can assign to anyone
  IF v_caller_role IN ('admin', 'superadmin') THEN RETURN true; END IF;

  -- TL/Moderator can assign to other TL/moderator (cross-staff coordination)
  IF v_caller_role IN ('teamlead', 'moderator')
     AND v_target_role IN ('teamlead', 'moderator') THEN
    RETURN true;
  END IF;

  -- Teamlead → operators in own team
  IF v_caller_role = 'teamlead' AND v_target_role = 'operator' THEN
    RETURN EXISTS (
      SELECT 1 FROM team_members tm_caller, team_members tm_target
      WHERE tm_caller.team_id IN (SELECT id FROM teams WHERE lead_user_id = p_caller_id AND is_active = true)
        AND tm_target.team_id = tm_caller.team_id
        AND tm_target.operator_id = p_target_user_id
    );
  END IF;

  -- Moderator → curated operators
  IF v_caller_role = 'moderator' AND v_target_role = 'operator' THEN
    RETURN EXISTS (
      SELECT 1 FROM moderator_operators
      WHERE moderator_id = p_caller_id AND operator_id = p_target_user_id
    );
  END IF;

  RETURN false;
END $$;
```

Всего: **11 RPC** (4 read + 7 write) + **1 internal helper** (`can_assign_task`).

---

## 5. UI surface

### 5.1. New page `/tasks`

**Master panel (440px на desktop):**

- Header: «Задачи <count>» + `+ Новая задача` (only if user has `create_tasks`).
- **Box-tabs** (главный фильтр):
  - «Входящие» (`p_box='inbox'`, default) — tasks where `assigned_to=me`
  - «Исходящие» (`p_box='outbox'`) — tasks where `created_by=me`
  - «Все» (`p_box='all'`) — only visible if `view_all_tasks`
- URL: `/tasks` (inbox), `/tasks/outbox`, `/tasks/all`, `/tasks/:id` (detail).
- Filter chips:
  - **Статус**: Все / pending / in_progress / done / overdue / cancelled
  - **Срок**: Все / Сегодня / Эта неделя / Просроченные
- Search input — debounce 300ms; passes to RPC `p_search`.
- List item:
  - Status pill (с computed overdue red если effective_status='overdue')
  - Title (truncate + title attr)
  - Meta: `От Анна → Иван · до 28 апр HH:MM` или `просрочено 3 дня`
  - Active = vertical accent bar (паттерн Teams)
- Empty: zero / filter empty (паттерны Subplan 3-4).

**Detail panel (fluid):**

- Top bar: breadcrumb `Задачи › <title-truncated>`, action-buttons row, pagination ‹ N/M ›.
- Header:
  - Title h1 (truncate + title)
  - Status pill (effective_status — overdue стилизуется красным)
  - Meta: `От <creator> · Исполнитель <assignee> · Дедлайн DD.MM.YYYY HH:MM`
- **Action-buttons row** (под header):
  - Operator (assigned_to=me):
    - status=pending → `Взял в работу` (btn-primary)
    - status=in_progress → scrolls to «Отчёт» секцию (или просто visible форма)
  - Creator/admin:
    - status ∈ pending/in_progress → `Отменить задачу` (btn-danger-ghost) → confirm
    - status=pending → `Edit` icon-button → enables inline edit фактов
- **Body sections** (single column):
  - **Описание** (`Card`): plain text. Edit-pencil → inline textarea (only creator + status ∈ pending/in_progress).
  - **Поля** (`Card`): grid 2-col — Deadline (datetime picker, edit), Assignee (dropdown через `list_assignable_users`, edit only if status=pending). Inline-edit паттерн как `ProfileTab` Subplan 3.
  - **Отчёт** (`Card`):
    - status=pending: hint «Отчёт появится после взятия в работу».
    - status=in_progress AND assigned_to=me: textarea (content) + media drop-zone (`uploadWithRetry`, паттерн PhotoGallery upload), кнопка `Завершить с отчётом`.
    - status=done OR cancelled: read-only — content + media gallery (тайлы 3 cols, click → переиспользуем `ClientLightbox` без изменений, items = media array).
  - **История** (`Card`): paginated feed из `task_activity`. Reuse `ActivityCard` структуру Subplan 3-4.

### 5.2. Slide-out create

Паттерн `CreateTeamSlideOut` Subplan 4.

Поля:
- **Заголовок** (text, required, validateTaskTitle)
- **Описание** (textarea, optional)
- **Дедлайн** (datetime picker, optional but recommended)
- **Исполнитель** (select из `list_assignable_users(callerId, search)` — отфильтрованный per assignment rules; показывает eligibility_reason при hover («ваш оператор» / «другой тимлид»))

Hotkeys: Esc + Cmd/Ctrl+Enter. Confirm-on-close для dirty form (паттерн Subplan 3).

### 5.3. Sidebar nav

Пункт «Задачи» (icon: ListChecks или ClipboardList). Visible если user имеет `create_tasks` или `view_all_tasks` или `view_own_tasks` — фактически все роли.

Badge через хук `useUserOverdueCount(userId)` → wraps RPC `count_overdue_tasks(p_caller_id)`. Cache паттерн `useUserTeamMembership` Subplan 4. Badge: `bg-[var(--danger)] text-primary-foreground` (как Notifications).

### 5.4. Components структура

```
src/pages/
  TaskListPage.jsx                    — master-detail wrapper

src/components/tasks/
  TaskList.jsx, TaskListItem.jsx
  TaskBoxTabs.jsx                     — Входящие / Исходящие / Все
  TaskFilterChips.jsx                 — статус + срок
  TaskDetailPanel.jsx                 — header + action row + sections
  TaskFieldsCard.jsx                  — inline-edit deadline/assignee
  TaskDescriptionCard.jsx             — inline-edit description
  TaskReportCard.jsx                  — submit form OR read-only display
  TaskActivityCard.jsx                — feed
  CreateTaskSlideOut.jsx              — форма создания
  CancelTaskConfirmDialog.jsx
  AssigneeSelector.jsx                — dropdown с фильтрацией by eligibility
  EmptyZero.jsx, EmptyFilter.jsx, DetailEmptyHint.jsx
  ReadOnlyBadge.jsx                   — для tasks где user — observer

src/hooks/
  useTaskList.js
  useTask.js
  useTaskActions.js                   — create/update/cancel/take/submit_report
  useTaskActivity.js
  useAssignableUsers.js               — wraps list_assignable_users
  useUserOverdueCount.js              — wraps count_overdue_tasks (cached for Sidebar)

src/lib/
  tasks.js                            — pluralizers, formatDeadlineRelative, computeEffectiveStatus, can*Task helpers, validators
  tasks.test.js
```

---

## 6. Бизнес-инварианты + error handling

| # | Правило | Где | UI message |
|---|---|---|---|
| **I-1** | `assigned_to NOT NULL`, exists, is_active | DB NOT NULL + RPC pre-check | «Исполнитель обязателен» / «Сотрудник деактивирован» |
| **I-2** | Assignment rules (D-2): admin∀; TL → own_team_operators ∪ TL/mod; mod → curated_operators ∪ TL/mod | RPC через `can_assign_task()` helper | «Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.» |
| **I-3** | Status transitions через дедикейтед RPC. Generic `update_task` НЕ трогает status | RPC architecture | n/a |
| **I-4** | `take_task_in_progress` only if `status=pending AND assigned_to=caller` | RPC | «Задача уже в работе» / «Только исполнитель может взять задачу» |
| **I-5** | `submit_task_report` only if `status=in_progress AND assigned_to=caller`. Validates: `length(trim(content)) > 0 OR jsonb_array_length(media) > 0`. Enforced на DB CHECK + RPC | DB CHECK + RPC | «Отчёт должен содержать описание или хотя бы один файл» |
| **I-6** | UNIQUE(task_id) на `task_reports`. Re-submit → INSERT ... ON CONFLICT DO UPDATE (idempotent) | DB UNIQUE + RPC | n/a (silent UPDATE) |
| **I-7** | `cancel_task` only if `status ∈ (pending, in_progress)` | RPC | «Нельзя отменить завершённую задачу» |
| **I-8** | `update_task.assigned_to` reassignment only if `status=pending` | RPC pre-check | «Переназначение возможно только для задач в ожидании. Создайте новую задачу.» |
| **I-9** | Permission scope per RPC: operator only own (assigned_to=me); TL/mod own (created_by=me OR assigned_to=me); admin all | each RPC | 403: «Недостаточно прав» |
| **I-10** | `delete_task` (admin only, hard delete) cascades `task_reports` (FK CASCADE) + Storage cleanup | RPC + Storage delete loop | UI confirm: «Удалить задачу безвозвратно? N файлов отчёта будут удалены.» |
| **I-11** | Деактивация user'а — НЕ блокируется задачами. Tasks с `assigned_to=deactivated_user` остаются. UI показывает muted-стилем; admin может re-assign через update_task. | extends `apply_user_archived_side_effects` audit only | n/a |
| **I-12** | Computed `overdue` в SELECT через CASE; не записывается в БД | каждая read RPC | n/a |
| **I-13** | `tasks.completed_at` consistency: NOT NULL ⇔ status='done' | DB CHECK constraint (`tasks_completed_at_consistent`) | n/a (validated by RPC's UPDATE clause) |

### 6.1. Error states в UI

- 403 → toast «Недостаточно прав» + auto-redirect назад.
- I-2 violation → inline error в slide-out create form под Assignee selector.
- Race (другой user уже взял задачу) → conflict toast + auto-reload detail.
- Network errors на upload отчёта → `uploadWithRetry` (1 retry, паттерн Subplan 3).
- Empty/loading → паттерны Subplan 3-4 (`EmptyZero`, `EmptyFilter`, realistic skeleton + slow-load hint, `role=alert`).

---

## 7. Тестирование

### 7.1. Unit (Vitest)

| File | Coverage |
|---|---|
| `src/lib/tasks.test.js` | `pluralizeTasks`, `formatDeadlineRelative` (через 2 дня / просрочено 3 дня / сегодня / без deadline), `computeEffectiveStatus(task, now)` (matches RPC computed logic — same edge cases as DB), `canEditTask`, `canAssignTask`, `canTakeInProgress`, `canSubmitReport`, `canCancelTask`, `validateTaskTitle`, `validateReport(content, media)` |
| `src/lib/defaultPermissions.test.js` | Sanity: `view_own_tasks` + `create_tasks` distribution per role |

### 7.2. SQL/RPC smoke checklist (staging, в плане)

| Сценарий | Ожидаемое |
|---|---|
| TL создаёт задачу оператору не из своей команды | I-2 fail с friendly RU message |
| Moderator создаёт задачу курируемому оператору | I-2 ok |
| Moderator создаёт задачу не-курируемому оператору | I-2 fail |
| Admin/superadmin → ∀ | I-2 ok |
| Operator вызывает `create_task` | 403 (нет `create_tasks`) |
| Двое одновременно `take_task_in_progress` | I-4 — выигрывает один; второй conflict |
| Submit report без content и без media | I-5 fail (DB CHECK + RPC) |
| Re-submit после первого | I-6 — UPDATE existing (idempotent) |
| Reassign задачи в `in_progress` | I-8 fail |
| Cancel `done` задачи | I-7 fail |
| `list_tasks(box='inbox')` для operator | I-9 — только assigned_to=me |
| `list_tasks(box='outbox')` для TL | I-9 — только created_by=me |
| Computed `effective_status='overdue'` для задачи с прошедшим deadline | I-12 |
| Hard delete задачи admin'ом | I-10 — task_reports CASCADE + Storage cleanup |
| Деактивация user'а с активными задачами | I-11 — passes; задачи остаются |
| `count_overdue_tasks(operator)` | Возвращает корректный count |
| Upload отчёта с network error (simulated) | `uploadWithRetry` — 1 retry, потом fail-with-message |

### 7.3. Smoke flow через preview

1. Admin создаёт задачу operator'у через slide-out (deadline через 2 дня).
2. Login operator → видит задачу в Inbox с status `pending`.
3. Operator нажимает «Взял в работу» → status `in_progress` + audit event.
4. Operator пишет content + аплоадит фото → нажимает «Завершить с отчётом» → status `done`.
5. Login admin → outbox detail видит report content + photo lightbox.
6. Admin меняет deadline на завтра → audit event `deadline_changed`.
7. Admin создаёт ещё задачу с deadline вчера → видит в overdue chip + Sidebar badge increments.
8. Admin отменяет одну задачу → status `cancelled` + audit.
9. Admin удаляет cancelled задачу → confirm с media count → CASCADE.

### 7.4. Что НЕ тестируем

- UI snapshots (out of scope per Subplan 3 precedent).
- Storage RLS edge cases (полагаемся на public-bucket pattern).
- Background overdue (его нет — computed).
- E2E (preview smoke = контракт).

---

## 8. Migration order

```
db/migrations/
  20260426_27_tasks_schema.sql              -- 2 relational + 1 activity log
  20260426_28_storage_task_reports.sql      -- bucket setup
  20260426_29_rpc_can_assign_task.sql       -- internal helper
  20260426_30_rpc_tasks_read.sql            -- list_tasks, get_task_detail, count_overdue, list_assignable
  20260426_31_rpc_tasks_write.sql           -- create/update/cancel/take/submit_report/update_report/delete
  20260426_32_seed_dev_tasks.sql            -- (dev only) 5-7 sample tasks across users
```

6 миграций.

---

## 9. Acceptance criteria

После всех stages плана:

- Полный CRUD задач через UI (`/tasks`).
- Box-tabs (Входящие / Исходящие / Все), filter chips (status + срок), search работают.
- Lifecycle: pending → in_progress → done с required отчётом.
- Cancel flow для creator/admin.
- Assignment validation (D-2) + UI dropdown через `list_assignable_users`.
- Computed overdue + Sidebar badge.
- Upload отчёта с media через `uploadWithRetry` + lightbox для просмотра.
- Activity log записывает все mutations.
- Edit policy: title/desc/deadline anytime, reassign только pending, cancel pending/in_progress.
- Деактивация user'а не блокируется задачами (но audit отмечает orphaned tasks).
- DS-токены (паттерны Subplan 3-4).
- `npm test` passes.
- `npx vite build` clean.
- Smoke flow §7.3 проходит на staging.

---

## 10. Файлы для контекста

При начале plan'а / implementation'а:

- `docs/domain-model.md` (§3, §4.2, §6.2-6.3) — авторитет.
- `docs/superpowers/specs/2026-04-26-crm-subplan-5-tasks-design.md` (этот файл) — все decisions.
- `docs/superpowers/plans/2026-04-25-crm-subplan-4-teams.md` — образец структуры plan'а (stages, format).
- `src/components/teams/`, `src/components/clients/` + `src/hooks/` — паттерны: master-detail, slide-out, ActivityCard, EmptyZero/Filter, useSlowFlag.
- `src/lib/upload.js` (`uploadWithRetry`) — переиспользуем для отчётов.
- `src/components/clients/ClientLightbox.jsx` — переиспользуем без изменений для media gallery в read-only отчёте.
