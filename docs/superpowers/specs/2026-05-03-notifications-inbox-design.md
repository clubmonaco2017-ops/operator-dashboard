# Notifications Inbox MVP — Design

**Date:** 2026-05-03
**Status:** Spec — awaiting user review

## Summary

Расширение `/notifications` страницы для **всех ролей** (сейчас superadmin-only). Computed feed из `task_activity` + `team_activity` + `deletion_requests` (последний — superadmin only) с per-role scoping. Counter на bell icon = unseen count, tracked single timestamp `dashboard_users.last_visited_notifications_at`. Realtime обновления — реюз existing channel + расширение для team/deletion. Plus dashboard card-feed «Оповещения» с top-3 items.

## Goals

1. RPC `list_user_notifications(p_limit=50)` — UNION ALL trёх источников, per-role scoping, returns `is_unseen` flag.
2. RPC `count_user_notifications_unseen()` — для bell badge + dashboard card.
3. RPC `mark_notifications_visited()` — UPDATE timestamp на mount страницы.
4. Schema: `dashboard_users.last_visited_notifications_at timestamptz` (nullable).
5. Bell icon в RailNav + MobileTopBar — visible **всем** залогиненным юзерам, badge = unseen count (replaces deletion-pending count).
6. NotificationsPage rewrite: flat chronological list (limit 50, no pagination), минималистичные rows, click → navigate to entity.
7. Dashboard card-feed `NotificationsOwnCard` — заголовок + unseen badge + top-3 items + footer link «Все оповещения →».
8. Section title: «Задачи и оповещения» (бывшая «Задачи»).
9. Realtime: extend `useTaskRealtimeSync` (на task_activity event инвалидируем notifications stuff бесплатно) + новый `useNotificationsRealtimeSync` для team_activity + deletion_requests.

## Non-goals

- Notifications table с per-row state (seen/dismissed) — Approach B, deferred. MVP single timestamp.
- Per-event-type filters (UI dropdown «только task / только team»).
- Mark-individual-as-read — visiting page marks all as seen.
- Sound / desktop notifications — это subplan #3 (browser push).
- Pagination / infinite scroll — limit 50.
- Aggregation (group by entity / smart dedupe) — flat chronological.
- Avatars в rows — minimalist, без actor avatars.
- Hidden / muted notifications — ничего не скрываем кроме `actor_id = caller`.

## Architecture

```
┌────────────────────────────────────────────────────┐
│ NotificationsPage (rewritten, all roles)           │
│ ├─ useNotifications(userId) → list_user_notif…     │
│ ├─ useNotificationsUnseenCount(userId)             │
│ ├─ on mount: mark_notifications_visited            │
│ │     → invalidate count + list                    │
│ └─ NotificationRow (flat list, limit 50)           │
└────────────────────────────────────────────────────┘
                         │
                         │ Realtime: existing useTaskRealtimeSync
                         │ + new useNotificationsRealtimeSync
                         ▼
┌────────────────────────────────────────────────────┐
│ Supabase                                            │
│ ├─ ALTER dashboard_users                            │
│ │   ADD COLUMN last_visited_notifications_at       │
│ │                                                   │
│ ├─ RPC list_user_notifications(p_limit)            │
│ │   UNION ALL: task_activity + team_activity        │
│ │   + deletion_requests (superadmin)                │
│ │   per-role scoping                                │
│ │   actor_id IS DISTINCT FROM caller                │
│ │   returns is_unseen flag                          │
│ │                                                   │
│ ├─ RPC count_user_notifications_unseen()           │
│ │   inline UNION ALL with WHERE created_at >        │
│ │   last_visited (no recursion)                     │
│ │                                                   │
│ └─ RPC mark_notifications_visited()                │
│       UPDATE … SET last_visited = now()             │
└────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────┐
│ Bell в RailNav / MobileTopBar — все юзеры          │
│ badge = useNotificationsUnseenCount               │
│                                                     │
│ Dashboard SectionPersonal («Задачи и оповещения»)  │
│ grid-cols-1 sm:grid-cols-2                         │
│ ├─ TasksOwnCard (left, существующий)              │
│ └─ NotificationsOwnCard (right, новый — feed-3)    │
└────────────────────────────────────────────────────┘
```

## RPC `list_user_notifications`

**Signature:**
```sql
CREATE FUNCTION list_user_notifications(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id            text,
  source        text,
  entity_id     integer,
  entity_label  text,
  actor_id      integer,
  actor_name    text,
  event_type    text,
  payload       jsonb,
  created_at    timestamptz,
  is_unseen     boolean
)
SECURITY DEFINER
LANGUAGE plpgsql
```

**Logic:**
```sql
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_role       text;
  v_last_seen  timestamptz;
BEGIN
  SELECT role, last_visited_notifications_at
    INTO v_role, v_last_seen
    FROM dashboard_users WHERE id = v_caller_id;

  RETURN QUERY
  WITH all_events AS (
    -- 1) task_activity
    SELECT 'task_activity:' || ta.id AS id,
           'task_activity' AS source,
           ta.task_id AS entity_id,
           t.title AS entity_label,
           ta.actor_id,
           u.first_name || ' ' || COALESCE(u.last_name, '') AS actor_name,
           ta.event_type, ta.payload, ta.created_at
      FROM task_activity ta
      JOIN tasks t                ON t.id = ta.task_id
      LEFT JOIN dashboard_users u ON u.id = ta.actor_id
     WHERE ta.actor_id IS DISTINCT FROM v_caller_id
       AND CASE
             WHEN v_role = 'superadmin' THEN true
             WHEN v_role = 'admin' THEN
               EXISTS (
                 SELECT 1 FROM admin_agencies aa
                  JOIN dashboard_users a ON a.id = t.assigned_to
                  WHERE aa.admin_user_id = v_caller_id
                    AND aa.agency_id = a.agency_id)
             ELSE
               t.assigned_to = v_caller_id OR t.created_by = v_caller_id
           END

    UNION ALL

    -- 2) team_activity
    SELECT 'team_activity:' || ta.id, 'team_activity',
           ta.team_id, t.name,
           ta.actor_id,
           u.first_name || ' ' || COALESCE(u.last_name, ''),
           ta.event_type, ta.payload, ta.created_at
      FROM team_activity ta
      JOIN teams t                ON t.id = ta.team_id
      LEFT JOIN dashboard_users u ON u.id = ta.actor_id
     WHERE ta.actor_id IS DISTINCT FROM v_caller_id
       AND CASE
             WHEN v_role = 'superadmin' THEN true
             WHEN v_role = 'admin' THEN
               t.agency_id IN (
                 SELECT agency_id FROM admin_agencies
                  WHERE admin_user_id = v_caller_id)
             ELSE
               EXISTS (
                 SELECT 1 FROM team_members tm
                  WHERE tm.team_id = t.id
                    AND tm.user_id = v_caller_id)
           END

    UNION ALL

    -- 3) deletion_requests (superadmin only, pending)
    SELECT 'deletion_request:' || dr.id, 'deletion_request',
           dr.id,
           du_target.first_name || ' ' || COALESCE(du_target.last_name, ''),
           dr.requested_by,
           du_actor.first_name || ' ' || COALESCE(du_actor.last_name, ''),
           'deletion_request_' || dr.status, to_jsonb(dr), dr.created_at
      FROM deletion_requests dr
      JOIN dashboard_users du_target ON du_target.id = dr.target_user_id
      JOIN dashboard_users du_actor  ON du_actor.id  = dr.requested_by
     WHERE v_role = 'superadmin'
       AND dr.status = 'pending'
  )
  SELECT *,
         created_at > COALESCE(v_last_seen, '1970-01-01'::timestamptz) AS is_unseen
    FROM all_events
   ORDER BY created_at DESC
   LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION list_user_notifications(integer) TO anon, authenticated;
```

**Edge cases:**
- `actor_id IS NULL` (системные events) — не фильтруем, показываем «Система».
- `actor_id = caller` — пропускаем (consistency с realtime filter).
- `last_visited_notifications_at = NULL` — `COALESCE` epoch → всё `is_unseen=true` для нового юзера.
- Удалённые tasks/teams — INNER JOIN, события пропадают (acceptable).

## RPC `count_user_notifications_unseen`

```sql
CREATE FUNCTION count_user_notifications_unseen()
RETURNS integer
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_role       text;
  v_last_seen  timestamptz;
  v_count      integer;
BEGIN
  SELECT role, COALESCE(last_visited_notifications_at, '1970-01-01'::timestamptz)
    INTO v_role, v_last_seen
    FROM dashboard_users WHERE id = v_caller_id;

  -- Inline UNION ALL identical to list_user_notifications, but WHERE created_at > v_last_seen
  -- (избегаем рекурсивного вызова list_user_notifications, плюс index на created_at)
  SELECT COUNT(*)::integer INTO v_count FROM (
    SELECT 1 FROM task_activity ta
      JOIN tasks t ON t.id = ta.task_id
     WHERE ta.created_at > v_last_seen
       AND ta.actor_id IS DISTINCT FROM v_caller_id
       AND CASE
             WHEN v_role = 'superadmin' THEN true
             WHEN v_role = 'admin' THEN
               EXISTS (SELECT 1 FROM admin_agencies aa
                        JOIN dashboard_users a ON a.id = t.assigned_to
                       WHERE aa.admin_user_id = v_caller_id
                         AND aa.agency_id = a.agency_id)
             ELSE
               t.assigned_to = v_caller_id OR t.created_by = v_caller_id
           END
    UNION ALL
    SELECT 1 FROM team_activity ta
      JOIN teams t ON t.id = ta.team_id
     WHERE ta.created_at > v_last_seen
       AND ta.actor_id IS DISTINCT FROM v_caller_id
       AND CASE
             WHEN v_role = 'superadmin' THEN true
             WHEN v_role = 'admin' THEN
               t.agency_id IN (SELECT agency_id FROM admin_agencies WHERE admin_user_id = v_caller_id)
             ELSE
               EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = v_caller_id)
           END
    UNION ALL
    SELECT 1 FROM deletion_requests dr
     WHERE v_role = 'superadmin' AND dr.status = 'pending' AND dr.created_at > v_last_seen
  ) s;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION count_user_notifications_unseen() TO anon, authenticated;
```

## RPC `mark_notifications_visited`

```sql
CREATE FUNCTION mark_notifications_visited()
RETURNS timestamptz
SECURITY DEFINER
LANGUAGE sql AS $$
  UPDATE dashboard_users
     SET last_visited_notifications_at = now()
   WHERE id = current_dashboard_user_id()
  RETURNING last_visited_notifications_at;
$$;

GRANT EXECUTE ON FUNCTION mark_notifications_visited() TO anon, authenticated;
```

## Schema

```sql
ALTER TABLE dashboard_users
  ADD COLUMN IF NOT EXISTS last_visited_notifications_at timestamptz;
```

NULL для existing — first visit покажет всё как unseen, после mark = now().

## Realtime

**Migrations нужны:**
```sql
-- 91: team_activity → publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_activity;

-- 92: deletion_requests → publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.deletion_requests;

-- 93 (conditional, check existing policies first):
CREATE POLICY team_activity_select_realtime ON team_activity FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY deletion_requests_select_realtime ON deletion_requests FOR SELECT TO anon, authenticated USING (true);
```

**Hooks:**
- Расширяем `useTaskRealtimeSync`: в callback добавляем `invalidateUserNotifications()` + `invalidateNotificationsUnseenCount(userId)` (на task_activity event инвалидирует и notifications).
- Новый `useNotificationsRealtimeSync(userId)` подписывается на `team_activity` (filter `actor_id=neq.${userId}`) + `deletion_requests` (только для superadmin role-check внутри).
- Mount в AppShell параллельно с `useTaskRealtimeSync`.

## Hooks

**`useNotifications(userId)` (`src/hooks/useNotifications.js`):**
- Module-level subscriber pattern (mirror `useTaskList`).
- Exported `invalidateUserNotifications()`.
- RPC `list_user_notifications(50)`.

**`useNotificationsUnseenCount(userId)` (`src/hooks/useNotificationsUnseenCount.js`):**
- Module cache + subscribers (mirror `useUnreadTasksCount`).
- Exported `invalidateNotificationsUnseenCount(userId)` + `invalidateAllNotificationsUnseenCount()`.
- RPC `count_user_notifications_unseen`.

**`useNotificationsRealtimeSync(userId)` (`src/hooks/useNotificationsRealtimeSync.js`):**
- 2 channels: team_activity + deletion_requests.
- На любой event → `invalidateUserNotifications()` + `invalidateNotificationsUnseenCount(userId)`.

## UI

### NotificationsPage (rewrite)

```jsx
export function NotificationsPage() {
  useSectionTitle('Оповещения')
  const { user } = useAuth()
  const { rows, loading, error } = useNotifications(user?.id)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user?.id) return
    supabase.rpc('mark_notifications_visited').then(() => {
      invalidateNotificationsUnseenCount(user.id)
      invalidateUserNotifications()
    })
  }, [user?.id])

  // …render rows…
}
```

### NotificationRow (`src/components/notifications/NotificationRow.jsx`)

```jsx
<li onClick={() => navigate(targetFor(n))} className="flex items-start gap-3 rounded-md p-3 hover:bg-accent cursor-pointer">
  {n.is_unseen && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
  <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
  <div className="min-w-0 flex-1">
    <p className="text-sm text-foreground line-clamp-2">{formatMessage(n)}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{formatRelative(n.created_at)}</p>
  </div>
</li>
```

**`formatMessage(n)`** — централизованная fn (`src/lib/notificationMessages.js`):
- `task_created` → «{actor_name} создал задачу «{entity_label}»»
- `task_reassigned` → «{actor_name} переназначил задачу «{entity_label}»»
- `task_updated` → «{actor_name} изменил задачу «{entity_label}»»
- `deadline_changed` → «{actor_name} изменил дедлайн в «{entity_label}»»
- `task_cancelled` → «{actor_name} отменил задачу «{entity_label}»»
- `task_deleted` → «{actor_name} удалил задачу «{entity_label}»»
- `team_created` → «{actor_name} создал команду «{entity_label}»»
- `team_renamed` → «{actor_name} переименовал команду в «{entity_label}»»
- `team_archived` / `team_restored` → «{actor_name} архивировал/восстановил команду «{entity_label}»»
- `member_added` → «{actor_name} добавил в команду «{entity_label}»» (если payload.user_id = caller — «вас»)
- `member_removed` / `member_moved` → симметрично
- `client_moved` / `client_unassigned` → «{actor_name} перемещён клиент в команде «{entity_label}»»
- `deletion_request_pending` → «Запрос на удаление: {entity_label}»

**`targetFor(n)`:**
- `task_activity` → `/tasks?id={entity_id}`
- `team_activity` → `/teams?id={entity_id}`
- `deletion_request` → opens `ApprovalReviewModal` (state in NotificationsPage)

### Bell icon (RailNav + MobileTopBar)

**Before:** visible only superadmin, badge = `usePendingDeletionCount`.
**After:** visible all logged-in users, badge = `useNotificationsUnseenCount(user?.id)`.

Удаляем `usePendingDeletionCount` import + usage; orphan'ed if not used elsewhere.

### NotificationsOwnCard (Dashboard)

`src/components/dashboard/cards/NotificationsOwnCard.jsx`:

```jsx
export function NotificationsOwnCard({ user }) {
  const { rows, loading } = useNotifications(user?.id)  // limit 50, take 3
  const unseen = useNotificationsUnseenCount(user?.id)
  const navigate = useNavigate()
  const top3 = rows.slice(0, 3)

  return (
    <Card className={cn('flex flex-col', unseen > 0 && 'border-primary/50')}>
      <header className="flex items-center justify-between p-4">
        <h3 className="text-sm font-semibold">Оповещения</h3>
        {unseen > 0 && <Badge>{unseen > 99 ? '99+' : unseen}</Badge>}
      </header>
      {top3.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Нет новых оповещений
        </p>
      ) : (
        <ul className="divide-y border-y">
          {top3.map((n) => <NotificationRow key={n.id} notification={n} />)}
        </ul>
      )}
      <button onClick={() => navigate('/notifications')} className="px-4 py-2 text-xs text-primary hover:underline">
        Все оповещения →
      </button>
    </Card>
  )
}
```

Registry update в `cardRegistry.jsx`:
```jsx
export const TASK_CARDS = [
  { id: 'tasks_own',         component: TasksOwnCard,         requires: 'view_own_tasks' },
  { id: 'notifications_own', component: NotificationsOwnCard, requires: null },  // все юзеры
]
```

`SectionTasks.jsx` rename → `SectionPersonal.jsx` (or keep filename, update title):
- Title: «Задачи и оповещения»
- Grid: `grid-cols-1 sm:grid-cols-2` (sticked to 2 columns на широких).

## Per-role scoping

| Source | Operator | Lead/Mod | Admin | Superadmin |
|---|---|---|---|---|
| `task_activity` | own (assignee/creator) | own | agency-scoped via `admin_agencies` | all |
| `team_activity` | teams I'm member | teams I'm member | agency-scoped | all |
| `deletion_requests` | — | — | — | all (pending) |

Filter applied: `actor_id IS DISTINCT FROM caller_id` для всех.

## File Plan

**Created:**
- `db/migrations/20260503_91_dashboard_users_last_visited_notifications.sql`
- `db/migrations/20260503_92_rpc_list_user_notifications.sql`
- `db/migrations/20260503_93_rpc_count_user_notifications_unseen.sql`
- `db/migrations/20260503_94_rpc_mark_notifications_visited.sql`
- `db/migrations/20260503_95_realtime_team_activity.sql`
- `db/migrations/20260503_96_realtime_deletion_requests.sql`
- `db/migrations/20260503_97_realtime_select_policies_team_deletion.sql` (conditional — check first)
- `src/hooks/useNotifications.js` + `.test.js`
- `src/hooks/useNotificationsUnseenCount.js` + `.test.js`
- `src/hooks/useNotificationsRealtimeSync.js` + `.test.js`
- `src/components/notifications/NotificationRow.jsx`
- `src/lib/notificationMessages.js` + `.test.js`
- `src/components/dashboard/cards/NotificationsOwnCard.jsx`

**Modified:**
- `src/pages/NotificationsPage.jsx` — rewrite (drop superadmin gate, use new hooks).
- `src/components/shell/RailNav.jsx` — bell visible all, badge = unseen count.
- `src/components/shell/MobileTopBar.jsx` — same.
- `src/components/shell/AppShell.jsx` — mount `useNotificationsRealtimeSync`.
- `src/hooks/useTaskRealtimeSync.js` — add notifications invalidation calls.
- `src/components/dashboard/SectionTasks.jsx` — rename title «Задачи и оповещения», grid `sm:grid-cols-2`.
- `src/components/dashboard/cardRegistry.jsx` — add `notifications_own`.
- (potentially) `src/hooks/usePendingDeletionCount.js` — delete if orphan'ed.

**Tests touched:**
- `MobileTopBar.test.jsx` — bell visibility expanded.
- `RailNav.test.jsx` — same.
- `cardRegistry.test.jsx` — new card.
- `AppShell.test.jsx` — mock new hook.

## Test Plan

### Unit
- `useNotifications.test.js` — fetches RPC, subscriber pattern.
- `useNotificationsUnseenCount.test.js` — module cache + invalidation.
- `useNotificationsRealtimeSync.test.js` — subscribes 2 channels, invalidates on event, cleanup.
- `notificationMessages.test.js` — formats event_type → string for all known types + fallback.

### Manual smoke (preview, 2 sessions)

1. **Operator (X) + manager (Y):**
   - Y создаёт task, assigned to X → у X bell badge ↑, dashboard card обновляется live, task event в feed на /notifications.
   - X opens task → mark_task_seen, but bell badge остаётся (notifications independent of task-unread).
   - X opens /notifications → mark_notifications_visited → bell badge → 0, hard refresh не сбрасывает.

2. **Lead (Y) + другой operator (Z):**
   - Y assignee tasks for Z. Y видит task_created в своих оповещениях (creator).
   - Z видит task_created (assignee).

3. **Admin scoping:**
   - Y создаёт task assigned to operator в agency A. Admin A видит. Admin B (другая agency) — не видит.

4. **Team events:**
   - Manager добавляет user'а в team. User видит team_member_added.
   - Other team members видят (если scope: members).

5. **Superadmin:**
   - Видит всё task_activity + team_activity + pending deletion_requests.
   - Click deletion → ApprovalReviewModal.

6. **Empty state:**
   - Новый юзер с нулём events → «Пока нет оповещений».

7. **Realtime:**
   - Без refresh — события прилетают в feed + dashboard card + bell badge ≤1сек.

8. **Dashboard card:**
   - Показывает top-3 events.
   - Click row → navigate.
   - Click footer → /notifications.
   - Border-accent blue если unseen > 0.

### Build / lint / test
- `npm run test:run` — baseline + new tests pass.
- `npm run build` — clean.
- `npm run lint` — без новых ошибок.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| RPC slow на large activity tables | Indexes already exist (`idx_task_activity_task_created`); LIMIT 50 + ORDER BY created_at DESC. Если станет проблемой — materialized view. |
| Permissive SELECT policies на team_activity / deletion_requests расширяют exposure | Internal-only deployment; existing pattern (task_activity такой же). Acceptable. |
| `count_user_notifications_unseen` дублирует SQL list-функции — drift risk | Inline комментарий «keep in sync with list_user_notifications scoping»; test покрывает оба RPC. |
| `mark_notifications_visited` race: новые events приходят между read и UPDATE | Acceptable — следующий visit увидит как unseen (overcounting лучше undercounting). |
| Удаление task/team → INNER JOIN скрывает event | OK; после удаления entity нет смысла в события. Если требуется — LEFT JOIN с placeholder label. |
| `event_type` для team_activity / deletion_requests может содержать новые/неизвестные значения | `formatMessage` имеет fallback «{actor_name} выполнил действие». |
| Bell visibility regression — некоторые tests assertions ломаются | Обновить relevant test cases (RailNav, MobileTopBar). |
| `useTask.mark_task_seen` теперь не должен влиять на notifications counter (только на tasks) | Independent — у `useTask` остаётся вызов task-related invalidations; notifications не трогает. |
| RPC scoping для admin полагается на multi-agency table `admin_agencies` | Уже existing infra (per memory project_multi_agency_done). |
| pending deletion count badge для superadmin (current) → unseen count (new) — поведение меняется | Acceptable — unseen subsumes pending deletions для superadmin. |

## Verification checklist

- [x] Goals и non-goals явные.
- [x] Per-role scoping таблица + SQL ветки соответствуют.
- [x] 3 RPC сигнатуры явные, GRANT'ы прописаны.
- [x] Realtime — реюз existing channel + 2 новых таблицы (publication + RLS).
- [x] Counter и list invalidation flow согласован (один и тот же channel).
- [x] Schema change minimal (1 nullable column).
- [x] Dashboard card asymmetric vs Tasks — обоснован.
- [x] File plan покрывает каждый Goal.
- [x] Tests cover hooks + formatter + integration.
- [x] Risks включает SQL drift, permissive RLS, missing event_type.
- [x] Out-of-scope явно — pagination, aggregation, avatars, sound.
