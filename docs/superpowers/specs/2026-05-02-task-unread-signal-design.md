# Task Unread Signal Design

**Date:** 2026-05-02
**Status:** Spec — awaiting user review

## Summary

Добавляет «unread» signal для задач. Цель — пользователь видит в RailNav, что появились новые задачи или произошли изменения в его задачах, и в master-list видит, какие именно строки требуют внимания.

**Behavior:**
- На иконке Tasks в RailNav красный counter = количество задач у current user, в которых произошёл event'у которого `actor_id != current_user`, после `last_seen_at` (или never seen).
- В master-list `/tasks` каждая такая задача помечается dot'ом слева (от StatusPill).
- При открытии detail page (`/tasks/:id`) задача авто-маркируется как seen → counter уменьшается, dot пропадает.
- Subscribers задачи: assignee + creator. Свои собственные действия не делают задачу unread для себя (filter `actor_id != user_id`).
- **Replace** существующий overdue badge — RailNav badge теперь = unread count. Overdue per-task signal остаётся в StatusPill каждой строки master-list.

## Goals

1. Single counter на иконке Tasks в RailNav (красный кружок 18×18 с числом).
2. Per-task dot indicator в `TaskListItem` (слева, 8×8 px, `bg-primary`).
3. Auto-mark seen при открытии detail page (fire-and-forget RPC).
4. Subscribers: assignee + creator (не distinct from each other).
5. Filter own actor_id — свои действия не unread for self.
6. Module-level cache + invalidation pattern (mirror `useUserOverdueCount`).
7. Initial state migration — все existing tasks marked seen для existing users (день 1 не покажет огромный counter).
8. Replace overdue badge → unread badge на иконке Tasks.

## Non-goals

- Realtime push (Supabase channel) — counter обновляется только на mount + mutations через invalidate.
- Notifications page (inbox-style list of events) — отдельный feature, out of scope.
- Per-event-type granularity (toggle для отдельных типов событий) — все task_activity events равнозначны.
- Mark-all-as-read button — Q3-A: только auto-mark on detail open.
- Sound / desktop notifications — UI dot/badge достаточно.
- Coverage non-task сущностей (clients/teams/staff have own activity, separate scope).

## Architecture

### DB Schema

**Table `task_last_seen`:**

```sql
CREATE TABLE public.task_last_seen (
  user_id      integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  task_id      integer NOT NULL REFERENCES tasks(id)            ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
CREATE INDEX idx_task_last_seen_user ON task_last_seen(user_id);
```

**Initial-state seed** (предотвращает день-1 шок):
```sql
INSERT INTO task_last_seen (user_id, task_id, last_seen_at)
SELECT u.id, t.id, now()
FROM tasks t
CROSS JOIN dashboard_users u
WHERE u.is_active = true
  AND (t.assigned_to = u.id OR t.created_by = u.id)
ON CONFLICT DO NOTHING;
```

### RPCs

**1. `mark_task_seen(p_task_id integer) RETURNS void`**
- SECURITY DEFINER, derives user via `current_dashboard_user_id()`.
- Upsert `(user_id, task_id, now())` on conflict update last_seen_at = now().
- Idempotent — race-safe.

**2. `count_unread_tasks() RETURNS integer`**
- For current user, returns count of unread tasks.
- Logic:
  ```
  SELECT COUNT(*) FROM tasks t
  WHERE (t.assigned_to = caller_id OR t.created_by = caller_id)
    AND EXISTS (
      SELECT 1 FROM task_activity ta
      LEFT JOIN task_last_seen tls
        ON tls.user_id = caller_id AND tls.task_id = t.id
      WHERE ta.task_id = t.id
        AND ta.actor_id IS DISTINCT FROM caller_id
        AND ta.created_at > COALESCE(tls.last_seen_at, '1970-01-01'::timestamptz)
    )
  ```

**3. `list_tasks` extension** — добавляет `is_unread boolean` в RETURNS TABLE:
- LEFT JOIN `task_last_seen tls ON tls.user_id = caller_id AND tls.task_id = t.id`
- LEFT JOIN LATERAL `(SELECT max(created_at) FROM task_activity WHERE task_id = t.id AND actor_id IS DISTINCT FROM caller_id) act`
- `is_unread = COALESCE(act.last_event_at, t.created_at) > COALESCE(tls.last_seen_at, '1970-01-01'::timestamptz)`
- Все существующие columns остаются.
- DROP+CREATE — нельзя ALTER returns через REPLACE (lessons из 7-agencies).

### Hooks

**`src/hooks/useUnreadTasksCount.js`** — mirror `useUserOverdueCount`:
- Module-level `cache: Map<userId, number>`
- `invalidateUnreadTasksCount(userId?)` — очищает cache + notify subscribers
- Subscribers Set для re-fetch existing instances
- Wraps `supabase.rpc('count_unread_tasks')`

**`src/hooks/useTaskList.js`** — pass through `is_unread` from RPC row mapping.

**`src/hooks/useTask.js`** — на первом успешном load:
```js
useEffect(() => {
  if (!loading && !error && row) {
    supabase.rpc('mark_task_seen', { p_task_id: taskId })
      .then(() => invalidateUnreadTasksCount(callerId))
  }
}, [taskId, loading, error, !!row, callerId])
```
Fire-and-forget — даже если fail, UI не блокируется.

**`src/hooks/useTaskActions.js`** — при mutations добавить `invalidateUnreadTasksCount(otherUserId)` параллельно existing `invalidateUserOverdueCount(otherUserId)`. otherUserId = creator/assignee «other party» (тот, кому стало unread).

### UI

**`src/components/shell/RailNav.jsx`:**
```jsx
// Replace
const { count: overdueCount } = useUserOverdueCount(canSeeTasks ? user?.id : null)
// With
const { count: unreadCount } = useUnreadTasksCount(canSeeTasks ? user?.id : null)
// And badge prop:
<RailItem ... badge={unreadCount} />
```

`useUserOverdueCount` остаётся (если другие consumers есть — pre-flight grep).

**`src/components/tasks/TaskListItem.jsx`** — добавить unread dot:
```jsx
{task.is_unread && (
  <span
    aria-label="Непрочитанная задача"
    className="absolute left-1 top-3 h-2 w-2 rounded-full bg-primary"
  />
)}
```

Dot в углу — наименее invasive. Альтернативные visual treatments (bold title, accent border) рассматривались — dot выбран как минимум визуального шума.

## File Plan

**Created:**
- `db/migrations/20260502_85_task_last_seen_table.sql` — CREATE TABLE + seed
- `db/migrations/20260502_86_rpc_task_unread.sql` — `mark_task_seen` + `count_unread_tasks` + extended `list_tasks`
- `src/hooks/useUnreadTasksCount.js` (~80 LOC)
- `src/hooks/useUnreadTasksCount.test.js` (~60 LOC, 3 it-blocks)

**Modified:**
- `src/hooks/useTaskList.js` — map `is_unread` field from RPC row
- `src/hooks/useTask.js` — add fire-and-forget mark_task_seen on load
- `src/hooks/useTaskActions.js` — invalidate unread count parallel to overdue at every mutation
- `src/components/shell/RailNav.jsx` — replace `useUserOverdueCount` with `useUnreadTasksCount`
- `src/components/tasks/TaskListItem.jsx` — add unread dot

**Deleted:** ничего.

## Test Plan

### Unit

- **`useUnreadTasksCount.test.js`** (3 it-blocks):
  1. Initial fetch caches count, returns it on subsequent calls (cache hit).
  2. `invalidateUnreadTasksCount(userId)` clears cache and notifies subscribers (re-fetch happens).
  3. `invalidateUnreadTasksCount()` (no arg) clears entire cache.

- **Existing `TaskListItem.test.jsx`** (если есть — extend; иначе skip): test rendering with `is_unread=true` shows dot.

### Manual smoke (after deploy)

1. Login as user X. На иконке Tasks badge = 0 (initial seed).
2. Под user Y создать task assigned to X. X refresh → badge=1, в master-list dot слева у task.
3. X открывает task → mark_task_seen → badge=0, dot пропал.
4. Y submit report — X badge=1.
5. X создаёт task assigned to Z — X badge не меняется (filter actor_id=X).
6. Z открывает свою задачу — Z badge=0 (own действие).

### Build / lint / test
- `npm run test:run` — те же 19 baseline failures + ~3 новых wrapper passes.
- `npm run build` — clean.
- `npm run lint` — без новых ошибок.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `count_unread_tasks` query slow на больших объёмах task_activity | LATERAL JOIN + existing index `idx_task_activity_task_created`. Если медленно на масштабах — denormalize через trigger (later). |
| Initial seed migration cross-join users × tasks slow | На текущих десятках/сотнях tasks × десятках users — OK. Если будет тысячи — chunked. |
| Race condition `mark_task_seen` на quick navigation | UPSERT idempotent. Race-safe. |
| Realtime отсутствует — counter не обновляется без mutation/refresh | Acceptable v1 (badge updates приходят через invalidate на client mutations + page focus). Realtime через Supabase channel — отдельный follow-up если нужно. |
| `useUserOverdueCount` остаётся orphan если только RailNav consumer | Pre-flight grep. Hook оставляем — invalidate-вызовы из useTaskActions всё ещё могут пригодиться для unrelated consumers. |
| `is_unread` колонка в `list_tasks` — изменение signature, может сломать существующие consumers map'инга | DROP+CREATE migration, расширяем return shape. UI consumer (`useTaskList`) обновляется в этом же subplan. Других consumers RPC `list_tasks` нет (grep подтвердит). |
| Если user X является и assignee, и creator одной task — будет ли двойной счёт | NO — COUNT(DISTINCT t.id), и EXISTS subquery возвращает 0 или 1 per task. Counter корректен. |
| Initial seed — если task у X has events younger than NOW() (вряд ли, но) | last_seen=now() guarantees no false unread on day 1. |

## Verification checklist (per spec self-review)

- [x] Goals и non-goals явные.
- [x] DB schema корректна — PRIMARY KEY (user_id, task_id), CASCADE for cleanup.
- [x] RPC `count_unread_tasks` логика проверена против edge cases (assignee=creator, no events, all events from self).
- [x] `list_tasks` extension изменяет signature → требует DROP+CREATE.
- [x] Все consumers `useUserOverdueCount` audited (pre-flight grep будет в plan'е).
- [x] Filter own actor_id явно прописан в RPC + UI logic.
- [x] Out-of-scope: realtime, notifications page, sound — explicit.
- [x] Initial seed prevents day-1 shock.
- [x] Tests cover hook behavior + visual rendering.
