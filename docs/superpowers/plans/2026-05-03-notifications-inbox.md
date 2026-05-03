# Notifications Inbox MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Computed notifications feed for all roles — `task_activity` + `team_activity` + `deletion_requests`, single-timestamp seen tracking, bell counter for everyone, dashboard card with top-3.

**Architecture:** New RPCs (list/count/mark) + 1 column + 3 hooks + new page rewrite + bell visibility change + new dashboard card. Realtime реюзает existing channel + 2 новых таблицы в publication.

**Tech Stack:** React 19 + Vite + Vitest + Supabase Realtime + Tailwind v4.

---

## Task 0: Pre-flight (worktree + baseline)

**Files:** none (worktree setup).

- [ ] **Step 1: Create worktree**
```bash
cd /Users/artemsaskin/Work/operator-dashboard
git worktree add .claude/worktrees/feat-notifications-inbox -b feat/notifications-inbox
cd .claude/worktrees/feat-notifications-inbox
npm install
```

- [ ] **Step 2: Baseline tests**
```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
```
Expected: ~18 failed | ~362 passed | 380 total (current baseline после PR #70).

- [ ] **Step 3: Confirm RLS state on team_activity / deletion_requests**
```bash
grep -E "POLICY.*(team_activity|deletion_requests)" db/migrations/*.sql
```
Expected: no matches → migration 97 будет нужна (SELECT policies).

- [ ] **Step 4: Note baseline numbers in TodoWrite for reference.**

---

## Task 1: Schema migration — last_visited_notifications_at

**Files:**
- Create: `db/migrations/20260503_91_dashboard_users_last_visited_notifications.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 91: per-user notifications "last seen" timestamp.

BEGIN;

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS last_visited_notifications_at timestamptz;

COMMIT;

-- VERIFY:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='dashboard_users'
--     AND column_name='last_visited_notifications_at';
--   -- Expected: 1 row.
--
-- ROLLBACK:
--   ALTER TABLE public.dashboard_users DROP COLUMN last_visited_notifications_at;
```

- [ ] **Step 2: Hand SQL to user inline для применения в Studio.** Wait for «applied».

- [ ] **Step 3: Commit migration file**
```bash
git add db/migrations/20260503_91_dashboard_users_last_visited_notifications.sql
git commit -m "feat(db): add dashboard_users.last_visited_notifications_at"
```

---

## Task 2: RPC list_user_notifications

**Files:**
- Create: `db/migrations/20260503_92_rpc_list_user_notifications.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 92: list_user_notifications — UNION ALL three sources, per-role scoping.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_user_notifications(p_limit integer DEFAULT 50)
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
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_role       text;
  v_last_seen  timestamptz;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT role, last_visited_notifications_at
    INTO v_role, v_last_seen
    FROM dashboard_users WHERE id = v_caller_id;

  RETURN QUERY
  WITH all_events AS (
    -- 1) task_activity
    SELECT
      'task_activity:' || ta.id AS id,
      'task_activity'::text AS source,
      ta.task_id AS entity_id,
      t.title AS entity_label,
      ta.actor_id,
      (u.first_name || ' ' || COALESCE(u.last_name, ''))::text AS actor_name,
      ta.event_type,
      ta.payload,
      ta.created_at
    FROM task_activity ta
    JOIN tasks t                ON t.id = ta.task_id
    LEFT JOIN dashboard_users u ON u.id = ta.actor_id
    WHERE ta.actor_id IS DISTINCT FROM v_caller_id
      AND CASE
            WHEN v_role = 'superadmin' THEN true
            WHEN v_role = 'admin' THEN
              EXISTS (
                SELECT 1
                  FROM admin_agencies aa
                  JOIN dashboard_users a ON a.id = t.assigned_to
                 WHERE aa.admin_user_id = v_caller_id
                   AND aa.agency_id = a.agency_id)
            ELSE
              t.assigned_to = v_caller_id OR t.created_by = v_caller_id
          END

    UNION ALL

    -- 2) team_activity
    SELECT
      'team_activity:' || tma.id,
      'team_activity'::text,
      tma.team_id,
      tm.name,
      tma.actor_id,
      (u.first_name || ' ' || COALESCE(u.last_name, ''))::text,
      tma.event_type,
      tma.payload,
      tma.created_at
    FROM team_activity tma
    JOIN teams tm               ON tm.id = tma.team_id
    LEFT JOIN dashboard_users u ON u.id = tma.actor_id
    WHERE tma.actor_id IS DISTINCT FROM v_caller_id
      AND CASE
            WHEN v_role = 'superadmin' THEN true
            WHEN v_role = 'admin' THEN
              tm.agency_id IN (
                SELECT agency_id FROM admin_agencies WHERE admin_user_id = v_caller_id)
            ELSE
              EXISTS (
                SELECT 1 FROM team_members mem
                 WHERE mem.team_id = tm.id
                   AND mem.user_id = v_caller_id)
          END

    UNION ALL

    -- 3) deletion_requests (superadmin only, pending)
    SELECT
      'deletion_request:' || dr.id,
      'deletion_request'::text,
      dr.id,
      (du_target.first_name || ' ' || COALESCE(du_target.last_name, ''))::text,
      dr.requested_by,
      (du_actor.first_name || ' ' || COALESCE(du_actor.last_name, ''))::text,
      ('deletion_request_' || dr.status)::text,
      to_jsonb(dr),
      dr.created_at
    FROM deletion_requests dr
    JOIN dashboard_users du_target ON du_target.id = dr.target_user_id
    JOIN dashboard_users du_actor  ON du_actor.id  = dr.requested_by
    WHERE v_role = 'superadmin'
      AND dr.status = 'pending'
  )
  SELECT
    e.id, e.source, e.entity_id, e.entity_label, e.actor_id, e.actor_name,
    e.event_type, e.payload, e.created_at,
    e.created_at > COALESCE(v_last_seen, '1970-01-01'::timestamptz) AS is_unseen
  FROM all_events e
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.list_user_notifications(integer) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT count(*) FROM list_user_notifications(50);
--   -- Expected: 0+ rows depending on activity.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.list_user_notifications(integer);
```

- [ ] **Step 2: Hand SQL inline для apply.** Wait for «applied».

- [ ] **Step 3: Commit**
```bash
git add db/migrations/20260503_92_rpc_list_user_notifications.sql
git commit -m "feat(db): add list_user_notifications RPC (3 sources, per-role scoping)"
```

---

## Task 3: RPC count_user_notifications_unseen

**Files:**
- Create: `db/migrations/20260503_93_rpc_count_user_notifications_unseen.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 93: count_user_notifications_unseen — inline UNION ALL with WHERE created_at > last_visited.
-- Keep scoping in sync with list_user_notifications (migration 92).

BEGIN;

CREATE OR REPLACE FUNCTION public.count_user_notifications_unseen()
RETURNS integer
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_role       text;
  v_last_seen  timestamptz;
  v_count      integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT role, COALESCE(last_visited_notifications_at, '1970-01-01'::timestamptz)
    INTO v_role, v_last_seen
    FROM dashboard_users WHERE id = v_caller_id;

  SELECT COUNT(*)::integer INTO v_count FROM (
    SELECT 1
      FROM task_activity ta
      JOIN tasks t ON t.id = ta.task_id
     WHERE ta.created_at > v_last_seen
       AND ta.actor_id IS DISTINCT FROM v_caller_id
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

    SELECT 1
      FROM team_activity tma
      JOIN teams tm ON tm.id = tma.team_id
     WHERE tma.created_at > v_last_seen
       AND tma.actor_id IS DISTINCT FROM v_caller_id
       AND CASE
             WHEN v_role = 'superadmin' THEN true
             WHEN v_role = 'admin' THEN
               tm.agency_id IN (SELECT agency_id FROM admin_agencies WHERE admin_user_id = v_caller_id)
             ELSE
               EXISTS (SELECT 1 FROM team_members mem WHERE mem.team_id = tm.id AND mem.user_id = v_caller_id)
           END

    UNION ALL

    SELECT 1
      FROM deletion_requests dr
     WHERE v_role = 'superadmin'
       AND dr.status = 'pending'
       AND dr.created_at > v_last_seen
  ) s;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.count_user_notifications_unseen() TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT count_user_notifications_unseen();
--   -- Expected: integer >= 0.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.count_user_notifications_unseen();
```

- [ ] **Step 2: Hand SQL inline.** Wait for «applied».

- [ ] **Step 3: Commit**
```bash
git add db/migrations/20260503_93_rpc_count_user_notifications_unseen.sql
git commit -m "feat(db): add count_user_notifications_unseen RPC"
```

---

## Task 4: RPC mark_notifications_visited

**Files:**
- Create: `db/migrations/20260503_94_rpc_mark_notifications_visited.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 94: mark_notifications_visited — UPDATE last_visited timestamp.

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_notifications_visited()
RETURNS timestamptz
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_now        timestamptz;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  UPDATE dashboard_users
     SET last_visited_notifications_at = now()
   WHERE id = v_caller_id
   RETURNING last_visited_notifications_at INTO v_now;

  RETURN v_now;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_visited() TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT mark_notifications_visited();
--   -- Expected: current timestamp returned.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.mark_notifications_visited();
```

- [ ] **Step 2: Hand SQL inline.** Wait for «applied».

- [ ] **Step 3: Commit**
```bash
git add db/migrations/20260503_94_rpc_mark_notifications_visited.sql
git commit -m "feat(db): add mark_notifications_visited RPC"
```

---

## Task 5: Realtime publications + RLS policies

**Files:**
- Create: `db/migrations/20260503_95_realtime_team_deletion.sql`
- Create: `db/migrations/20260503_96_select_policies_team_deletion.sql`

- [ ] **Step 1: Write publication migration**

```sql
-- Migration 95: add team_activity + deletion_requests to realtime publication.

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deletion_requests;

COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--     AND tablename IN ('team_activity', 'deletion_requests');
--   -- Expected: 2 rows.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.team_activity;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.deletion_requests;
```

- [ ] **Step 2: Write SELECT policies migration**

```sql
-- Migration 96: SELECT policies for team_activity + deletion_requests
-- (required for Realtime broadcast under anon role, mirror task_activity migration 88).

BEGIN;

CREATE POLICY team_activity_select_realtime
  ON public.team_activity FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY deletion_requests_select_realtime
  ON public.deletion_requests FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;

-- VERIFY:
--   SELECT polname, polrelid::regclass FROM pg_policy
--   WHERE polrelid IN ('public.team_activity'::regclass, 'public.deletion_requests'::regclass);
--   -- Expected: 2 rows with new policy names.
--
-- ROLLBACK:
--   DROP POLICY team_activity_select_realtime ON public.team_activity;
--   DROP POLICY deletion_requests_select_realtime ON public.deletion_requests;
```

- [ ] **Step 3: Hand both inline.** Wait for «applied».

- [ ] **Step 4: Commit**
```bash
git add db/migrations/20260503_95_realtime_team_deletion.sql \
        db/migrations/20260503_96_select_policies_team_deletion.sql
git commit -m "feat(db): realtime publication + SELECT policies for team_activity/deletion_requests"
```

---

## Task 6: notificationMessages formatter (TDD)

**Files:**
- Create: `src/lib/notificationMessages.js`
- Create: `src/lib/notificationMessages.test.js`

- [ ] **Step 1: Write failing test**

```js
import { describe, it, expect } from 'vitest'
import { formatNotificationMessage, targetForNotification } from './notificationMessages.js'

describe('formatNotificationMessage', () => {
  it('formats task_created', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'task_created',
      actor_name: 'Иван Петров', entity_label: 'Отзвон клиента', payload: {},
    })
    expect(msg).toBe('Иван Петров создал задачу «Отзвон клиента»')
  })

  it('formats task_reassigned', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'task_reassigned',
      actor_name: 'Анна Смирнова', entity_label: 'Сделать KPI', payload: {},
    })
    expect(msg).toBe('Анна Смирнова переназначила задачу «Сделать KPI»')
  })

  it('formats deadline_changed', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'deadline_changed',
      actor_name: 'Анна', entity_label: 'KPI', payload: {},
    })
    expect(msg).toBe('Анна изменила дедлайн в задаче «KPI»')
  })

  it('formats team_member_added', () => {
    const msg = formatNotificationMessage({
      source: 'team_activity', event_type: 'member_added',
      actor_name: 'Бекетов', entity_label: 'Day Shift', payload: {},
    })
    expect(msg).toBe('Бекетов добавил участника в команду «Day Shift»')
  })

  it('formats deletion_request_pending', () => {
    const msg = formatNotificationMessage({
      source: 'deletion_request', event_type: 'deletion_request_pending',
      actor_name: 'Бекетова', entity_label: 'Кузнецов И.И.', payload: {},
    })
    expect(msg).toBe('Запрос на удаление: Кузнецов И.И.')
  })

  it('falls back to generic message for unknown event_type', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'wat',
      actor_name: 'X', entity_label: 'Y', payload: {},
    })
    expect(msg).toBe('X выполнил действие в «Y»')
  })

  it('uses Система when actor_name is null', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'task_created',
      actor_name: null, entity_label: 'Y', payload: {},
    })
    expect(msg).toBe('Система создала задачу «Y»')
  })
})

describe('targetForNotification', () => {
  it('routes task_activity to /tasks?id=', () => {
    expect(targetForNotification({ source: 'task_activity', entity_id: 42 })).toBe('/tasks?id=42')
  })
  it('routes team_activity to /teams?id=', () => {
    expect(targetForNotification({ source: 'team_activity', entity_id: 7 })).toBe('/teams?id=7')
  })
  it('returns null for deletion_request (handled in-page modal)', () => {
    expect(targetForNotification({ source: 'deletion_request', entity_id: 1 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**
```bash
npm run test:run -- src/lib/notificationMessages.test.js
```
Expected: cannot find module.

- [ ] **Step 3: Implement formatter**

```js
// src/lib/notificationMessages.js

const TASK_TEMPLATES = {
  task_created:      ({ actor, label }) => `${actor} создал${ending(actor)} задачу «${label}»`,
  task_reassigned:   ({ actor, label }) => `${actor} переназначил${ending(actor)} задачу «${label}»`,
  task_updated:      ({ actor, label }) => `${actor} изменил${ending(actor)} задачу «${label}»`,
  task_cancelled:    ({ actor, label }) => `${actor} отменил${ending(actor)} задачу «${label}»`,
  task_deleted:      ({ actor, label }) => `${actor} удалил${ending(actor)} задачу «${label}»`,
  deadline_changed:  ({ actor, label }) => `${actor} изменил${ending(actor)} дедлайн в задаче «${label}»`,
}

const TEAM_TEMPLATES = {
  team_created:      ({ actor, label }) => `${actor} создал${ending(actor)} команду «${label}»`,
  team_renamed:      ({ actor, label }) => `${actor} переименовал${ending(actor)} команду в «${label}»`,
  team_archived:     ({ actor, label }) => `${actor} архивировал${ending(actor)} команду «${label}»`,
  team_restored:     ({ actor, label }) => `${actor} восстановил${ending(actor)} команду «${label}»`,
  member_added:      ({ actor, label }) => `${actor} добавил${ending(actor)} участника в команду «${label}»`,
  member_removed:    ({ actor, label }) => `${actor} убрал${ending(actor)} участника из команды «${label}»`,
  member_moved:      ({ actor, label }) => `${actor} переместил${ending(actor)} участника в команде «${label}»`,
  client_moved:      ({ actor, label }) => `${actor} переместил${ending(actor)} клиента в команде «${label}»`,
  client_unassigned: ({ actor, label }) => `${actor} открепил${ending(actor)} клиента в команде «${label}»`,
}

function ending(actor) {
  // Грубая эвристика «он/она» по имени актора. Если null — система → среднего рода («создала»).
  // Для MVP используем мужской род как default; «Система» — женский (ending 'а').
  if (actor === 'Система') return 'а'
  return ''
}

export function formatNotificationMessage(n) {
  const actor = n.actor_name?.trim() || 'Система'
  const label = n.entity_label || ''

  if (n.source === 'deletion_request') {
    return `Запрос на удаление: ${label}`
  }

  const templates = n.source === 'task_activity' ? TASK_TEMPLATES
                  : n.source === 'team_activity' ? TEAM_TEMPLATES
                  : null
  const tmpl = templates?.[n.event_type]
  if (tmpl) return tmpl({ actor, label })

  // Fallback
  return `${actor} выполнил${ending(actor)} действие в «${label}»`
}

export function targetForNotification(n) {
  switch (n.source) {
    case 'task_activity': return `/tasks?id=${n.entity_id}`
    case 'team_activity': return `/teams?id=${n.entity_id}`
    case 'deletion_request': return null  // handled by in-page modal
    default: return null
  }
}
```

- [ ] **Step 4: Run tests, verify pass**
```bash
npm run test:run -- src/lib/notificationMessages.test.js
```
Expected: 9/9 passing.

- [ ] **Step 5: Commit**
```bash
git add src/lib/notificationMessages.js src/lib/notificationMessages.test.js
git commit -m "feat(notifications): add notificationMessages formatter"
```

---

## Task 7: useNotifications hook (TDD)

**Files:**
- Create: `src/hooks/useNotifications.js`
- Create: `src/hooks/useNotifications.test.js`

- [ ] **Step 1: Write failing test**

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}))
import { supabase } from '../supabaseClient'
import { useNotifications, invalidateUserNotifications } from './useNotifications.js'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('useNotifications', () => {
  it('fetches via list_user_notifications RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'task_activity:1' }], error: null })
    const { result } = renderHook(() => useNotifications(42))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledWith('list_user_notifications', { p_limit: 50 })
    expect(result.current.rows).toEqual([{ id: 'task_activity:1' }])
  })

  it('returns empty when userId null', () => {
    const { result } = renderHook(() => useNotifications(null))
    expect(result.current.rows).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('invalidateUserNotifications triggers re-fetch', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => useNotifications(42))
    await waitFor(() => expect(result.current.loading).toBe(false))

    supabase.rpc.mockClear()
    supabase.rpc.mockResolvedValue({ data: [{ id: 'new' }], error: null })
    act(() => invalidateUserNotifications())
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'new' }]))
  })
})
```

- [ ] **Step 2: Run, verify fails (cannot find module)**
```bash
npm run test:run -- src/hooks/useNotifications.test.js
```

- [ ] **Step 3: Implement**

```js
// src/hooks/useNotifications.js
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const subscribers = new Set()

function notifyAll() {
  subscribers.forEach((cb) => { try { cb() } catch { /* ignore */ } })
}

export function invalidateUserNotifications() {
  notifyAll()
}

/**
 * @param {number|null} userId
 */
export function useNotifications(userId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const cb = () => setVersion((v) => v + 1)
    subscribers.add(cb)
    return () => { subscribers.delete(cb) }
  }, [])

  useEffect(() => {
    if (!userId) { setRows([]); return }
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_user_notifications', { p_limit: 50 })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setRows([]) }
        else setRows(data ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [userId, version])

  return { rows, loading, error }
}
```

- [ ] **Step 4: Run tests, verify pass**
```bash
npm run test:run -- src/hooks/useNotifications.test.js
```

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useNotifications.js src/hooks/useNotifications.test.js
git commit -m "feat(hooks): add useNotifications + invalidateUserNotifications"
```

---

## Task 8: useNotificationsUnseenCount hook (TDD)

**Files:**
- Create: `src/hooks/useNotificationsUnseenCount.js`
- Create: `src/hooks/useNotificationsUnseenCount.test.js`

- [ ] **Step 1: Write failing test** (mirror useUnreadTasksCount tests)

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({ supabase: { rpc: vi.fn() } }))
import { supabase } from '../supabaseClient'
import {
  useNotificationsUnseenCount,
  invalidateNotificationsUnseenCount,
  invalidateAllNotificationsUnseenCount,
} from './useNotificationsUnseenCount.js'

beforeEach(() => { supabase.rpc.mockReset() })

describe('useNotificationsUnseenCount', () => {
  it('fetches via count_user_notifications_unseen RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: 3, error: null })
    const { result } = renderHook(() => useNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(3))
    expect(supabase.rpc).toHaveBeenCalledWith('count_user_notifications_unseen')
  })

  it('returns 0 when userId null', () => {
    const { result } = renderHook(() => useNotificationsUnseenCount(null))
    expect(result.current).toBe(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('invalidate triggers re-fetch', async () => {
    supabase.rpc.mockResolvedValue({ data: 1, error: null })
    const { result } = renderHook(() => useNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(1))

    supabase.rpc.mockResolvedValue({ data: 5, error: null })
    act(() => invalidateNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(5))
  })

  it('invalidateAll triggers re-fetch', async () => {
    supabase.rpc.mockResolvedValue({ data: 2, error: null })
    const { result } = renderHook(() => useNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(2))

    supabase.rpc.mockResolvedValue({ data: 7, error: null })
    act(() => invalidateAllNotificationsUnseenCount())
    await waitFor(() => expect(result.current).toBe(7))
  })
})
```

- [ ] **Step 2: Run, verify fails**
```bash
npm run test:run -- src/hooks/useNotificationsUnseenCount.test.js
```

- [ ] **Step 3: Implement** (mirror `useUnreadTasksCount.js` exactly, change RPC name)

Read pattern first:
```bash
cat src/hooks/useUnreadTasksCount.js
```

Then create `useNotificationsUnseenCount.js` matching that file's structure, replacing `count_unread_tasks` → `count_user_notifications_unseen`, exported names → `invalidateNotificationsUnseenCount` / `invalidateAllNotificationsUnseenCount` / `useNotificationsUnseenCount`.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useNotificationsUnseenCount.js src/hooks/useNotificationsUnseenCount.test.js
git commit -m "feat(hooks): add useNotificationsUnseenCount with invalidation"
```

---

## Task 9: useNotificationsRealtimeSync hook (TDD)

**Files:**
- Create: `src/hooks/useNotificationsRealtimeSync.js`
- Create: `src/hooks/useNotificationsRealtimeSync.test.js`

- [ ] **Step 1: Write failing test**

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}))
vi.mock('./useNotifications.js', () => ({ invalidateUserNotifications: vi.fn() }))
vi.mock('./useNotificationsUnseenCount.js', () => ({
  invalidateNotificationsUnseenCount: vi.fn(),
}))
import { supabase } from '../supabaseClient'
import { invalidateUserNotifications } from './useNotifications.js'
import { invalidateNotificationsUnseenCount } from './useNotificationsUnseenCount.js'
import { useNotificationsRealtimeSync } from './useNotificationsRealtimeSync.js'

beforeEach(() => {
  supabase.channel.mockReset()
  supabase.removeChannel.mockReset()
  invalidateUserNotifications.mockReset()
  invalidateNotificationsUnseenCount.mockReset()
})

describe('useNotificationsRealtimeSync', () => {
  it('subscribes to two channels (team_activity + deletion_requests) and cleans up', () => {
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn().mockReturnThis()
    const fakeChannel = { on, subscribe }
    on.mockReturnValue(fakeChannel)
    subscribe.mockReturnValue(fakeChannel)
    supabase.channel.mockReturnValue(fakeChannel)

    const { unmount } = renderHook(() => useNotificationsRealtimeSync(42))

    expect(supabase.channel).toHaveBeenCalledTimes(2)
    expect(supabase.channel).toHaveBeenCalledWith('team-activity-notifs-42')
    expect(supabase.channel).toHaveBeenCalledWith('deletion-requests-notifs-42')

    unmount()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(2)
  })

  it('invalidates notifications + counter on event', () => {
    const callbacks = []
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn((_, __, cb) => { callbacks.push(cb); return { on, subscribe } })
    supabase.channel.mockReturnValue({ on, subscribe })

    renderHook(() => useNotificationsRealtimeSync(42))

    expect(callbacks).toHaveLength(2)
    callbacks[0]({ new: { actor_id: 99 } })
    expect(invalidateUserNotifications).toHaveBeenCalled()
    expect(invalidateNotificationsUnseenCount).toHaveBeenCalledWith(42)
  })

  it('does nothing when userId is null', () => {
    renderHook(() => useNotificationsRealtimeSync(null))
    expect(supabase.channel).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement**

```js
// src/hooks/useNotificationsRealtimeSync.js
import { useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUserNotifications } from './useNotifications.js'
import { invalidateNotificationsUnseenCount } from './useNotificationsUnseenCount.js'

/**
 * Subscribes to team_activity + deletion_requests INSERT events.
 * On any event → invalidate notifications + counter.
 *
 * @param {number|null} userId
 */
export function useNotificationsRealtimeSync(userId) {
  useEffect(() => {
    if (!userId) return

    const fire = () => {
      invalidateUserNotifications()
      invalidateNotificationsUnseenCount(userId)
    }

    const teamCh = supabase
      .channel(`team-activity-notifs-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_activity', filter: `actor_id=neq.${userId}` },
        fire)
      .subscribe()

    const delCh = supabase
      .channel(`deletion-requests-notifs-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deletion_requests' },
        fire)
      .subscribe()

    return () => {
      supabase.removeChannel(teamCh)
      supabase.removeChannel(delCh)
    }
  }, [userId])
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useNotificationsRealtimeSync.js src/hooks/useNotificationsRealtimeSync.test.js
git commit -m "feat(hooks): add useNotificationsRealtimeSync (team + deletion channels)"
```

---

## Task 10: Extend useTaskRealtimeSync to invalidate notifications

**Files:**
- Modify: `src/hooks/useTaskRealtimeSync.js`
- Modify: `src/hooks/useTaskRealtimeSync.test.js`

- [ ] **Step 1: Add new test for notifications invalidation**

In `useTaskRealtimeSync.test.js` add second mock + assertion:

```js
vi.mock('./useNotifications.js', () => ({ invalidateUserNotifications: vi.fn() }))
vi.mock('./useNotificationsUnseenCount.js', () => ({ invalidateNotificationsUnseenCount: vi.fn() }))

import { invalidateUserNotifications } from './useNotifications.js'
import { invalidateNotificationsUnseenCount } from './useNotificationsUnseenCount.js'

// In existing 'invalidates counter + task list on event payload' test, ADD:
expect(invalidateUserNotifications).toHaveBeenCalled()
expect(invalidateNotificationsUnseenCount).toHaveBeenCalledWith(42)
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Update `useTaskRealtimeSync.js`**

```js
import { invalidateUserNotifications } from './useNotifications.js'
import { invalidateNotificationsUnseenCount } from './useNotificationsUnseenCount.js'

// In callback:
() => {
  invalidateUnreadTasksCount(userId)
  invalidateUserTaskList()
  invalidateUserNotifications()
  invalidateNotificationsUnseenCount(userId)
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useTaskRealtimeSync.js src/hooks/useTaskRealtimeSync.test.js
git commit -m "feat(hooks): useTaskRealtimeSync invalidates notifications too"
```

---

## Task 11: NotificationRow component

**Files:**
- Create: `src/components/notifications/NotificationRow.jsx`

- [ ] **Step 1: Implement**

```jsx
// src/components/notifications/NotificationRow.jsx
import { CheckSquare, Network, Trash2 } from 'lucide-react'
import { formatNotificationMessage } from '../../lib/notificationMessages.js'

const ICONS = {
  task_activity: CheckSquare,
  team_activity: Network,
  deletion_request: Trash2,
}

function formatRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} дн назад`
  return new Date(iso).toLocaleDateString('ru-RU')
}

export function NotificationRow({ notification, onClick }) {
  const Icon = ICONS[notification.source] ?? CheckSquare
  return (
    <li
      onClick={() => onClick?.(notification)}
      className="flex items-start gap-3 p-3 hover:bg-accent cursor-pointer"
    >
      {notification.is_unseen && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="непрочитанное" />
      )}
      {!notification.is_unseen && <span className="w-2 shrink-0" />}
      <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground line-clamp-2">
          {formatNotificationMessage(notification)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelative(notification.created_at)}
        </p>
      </div>
    </li>
  )
}
```

- [ ] **Step 2: Build check**
```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 3: Commit**
```bash
git add src/components/notifications/NotificationRow.jsx
git commit -m "feat(notifications): add NotificationRow component"
```

---

## Task 12: NotificationsPage rewrite

**Files:**
- Modify: `src/pages/NotificationsPage.jsx`

- [ ] **Step 1: Rewrite NotificationsPage.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { supabase } from '../supabaseClient'
import { useNotifications, invalidateUserNotifications } from '../hooks/useNotifications.js'
import { invalidateNotificationsUnseenCount } from '../hooks/useNotificationsUnseenCount.js'
import { useSectionTitle } from '../hooks/useSectionTitle.jsx'
import { NotificationRow } from '../components/notifications/NotificationRow.jsx'
import { targetForNotification } from '../lib/notificationMessages.js'
import { ApprovalReviewModal } from '../components/staff/ApprovalReviewModal.jsx'
import { useDeletionRequests } from '../hooks/useDeletionRequests.js'

export function NotificationsPage() {
  useSectionTitle('Оповещения')
  const { user } = useAuth()
  const { rows, loading, error } = useNotifications(user?.id)
  const navigate = useNavigate()
  const [reviewing, setReviewing] = useState(null)
  // For deletion-request modal: load on demand by id (cheap; reuses existing hook).
  const { rows: deletionRows, reload: reloadDeletions } = useDeletionRequests(user?.id, 'pending')

  useEffect(() => {
    if (!user?.id) return
    supabase.rpc('mark_notifications_visited').then(() => {
      invalidateNotificationsUnseenCount(user.id)
      invalidateUserNotifications()
    })
  }, [user?.id])

  const handleClick = (n) => {
    const target = targetForNotification(n)
    if (target) { navigate(target); return }
    if (n.source === 'deletion_request') {
      const dr = deletionRows.find((r) => r.id === n.entity_id)
      if (dr) setReviewing(dr)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-2xl font-bold">Оповещения</h1>

        {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {error && <p className="text-sm text-destructive">Ошибка: {error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Пока нет оповещений
          </p>
        )}

        <ul className="divide-y rounded-md border">
          {rows.map((n) => (
            <NotificationRow key={n.id} notification={n} onClick={handleClick} />
          ))}
        </ul>

        {reviewing && (
          <ApprovalReviewModal
            request={reviewing}
            onClose={() => setReviewing(null)}
            onDone={() => { reloadDeletions(); invalidateUserNotifications() }}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests + build**
```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head
npm run build 2>&1 | tail -3
```

- [ ] **Step 3: Commit**
```bash
git add src/pages/NotificationsPage.jsx
git commit -m "feat(notifications): rewrite NotificationsPage for all roles (computed feed)"
```

---

## Task 13: Bell visibility (RailNav + MobileTopBar)

**Files:**
- Modify: `src/components/shell/RailNav.jsx`
- Modify: `src/components/shell/MobileTopBar.jsx`
- Modify: `src/components/shell/RailNav.test.jsx` (если есть assert на superadmin-only bell)
- Modify: `src/components/shell/MobileTopBar.test.jsx`

- [ ] **Step 1: RailNav.jsx — заменить gating + counter source**

```jsx
// Remove:
import { isSuperadmin } from '../../lib/permissions.js'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'

// Add:
import { useNotificationsUnseenCount } from '../../hooks/useNotificationsUnseenCount.js'

// Replace inside component:
const canSeeNotifications = !!user  // visible to all logged-in
const unseen = useNotificationsUnseenCount(user?.id)

// JSX badge: badge={unseen}
```

- [ ] **Step 2: MobileTopBar.jsx — same change**

- [ ] **Step 3: Update tests**

In `RailNav.test.jsx` / `MobileTopBar.test.jsx`:
- Replace assertion «only superadmin sees bell» → «all logged-in users see bell, hidden if no user».
- Add `vi.mock('../../hooks/useNotificationsUnseenCount.js', () => ({ useNotificationsUnseenCount: () => 0 }))`.
- Existing «pending deletion count badge» assertion → `useNotificationsUnseenCount` returning N → expect N visible.

- [ ] **Step 4: Run tests + build**

- [ ] **Step 5: Commit**
```bash
git add src/components/shell/RailNav.jsx src/components/shell/MobileTopBar.jsx \
        src/components/shell/RailNav.test.jsx src/components/shell/MobileTopBar.test.jsx
git commit -m "feat(shell): bell visible to all users; badge = unseen notifications"
```

---

## Task 14: AppShell mount useNotificationsRealtimeSync

**Files:**
- Modify: `src/components/shell/AppShell.jsx`
- Modify: `src/components/shell/AppShell.test.jsx`

- [ ] **Step 1: Add to AppShell.jsx**

```jsx
import { useNotificationsRealtimeSync } from '../../hooks/useNotificationsRealtimeSync.js'

// In AppShell body, alongside existing useTaskRealtimeSync:
useNotificationsRealtimeSync(user?.id ?? null)
```

- [ ] **Step 2: Mock in AppShell.test.jsx**

```js
vi.mock('../../hooks/useNotificationsRealtimeSync.js', () => ({
  useNotificationsRealtimeSync: vi.fn(),
}))
```

- [ ] **Step 3: Run tests + build**

- [ ] **Step 4: Commit**
```bash
git add src/components/shell/AppShell.jsx src/components/shell/AppShell.test.jsx
git commit -m "feat(shell): AppShell mounts useNotificationsRealtimeSync"
```

---

## Task 15: NotificationsOwnCard (Dashboard card)

**Files:**
- Create: `src/components/dashboard/cards/NotificationsOwnCard.jsx`

- [ ] **Step 1: Implement**

```jsx
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../../hooks/useNotifications.js'
import { useNotificationsUnseenCount } from '../../../hooks/useNotificationsUnseenCount.js'
import { NotificationRow } from '../../notifications/NotificationRow.jsx'
import { targetForNotification } from '../../../lib/notificationMessages.js'
import { cn } from '../../../lib/utils.js'

export function NotificationsOwnCard({ user }) {
  const { rows, loading } = useNotifications(user?.id)
  const unseen = useNotificationsUnseenCount(user?.id)
  const navigate = useNavigate()
  const top3 = rows.slice(0, 3)

  const handleRowClick = (n) => {
    const target = targetForNotification(n)
    if (target) navigate(target)
    else navigate('/notifications')  // deletion_request fallback
  }

  return (
    <section className={cn(
      'flex flex-col rounded-lg border bg-card',
      unseen > 0 && 'border-primary/40'
    )}>
      <header className="flex items-center justify-between p-4 pb-3">
        <h3 className="text-sm font-semibold">Оповещения</h3>
        {unseen > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {unseen > 99 ? '99+' : unseen}
          </span>
        )}
      </header>
      {loading ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Загрузка…</p>
      ) : top3.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Нет новых оповещений</p>
      ) : (
        <ul className="divide-y border-y">
          {top3.map((n) => (
            <NotificationRow key={n.id} notification={n} onClick={handleRowClick} />
          ))}
        </ul>
      )}
      <button
        onClick={() => navigate('/notifications')}
        className="px-4 py-3 text-left text-xs text-primary hover:underline"
      >
        Все оповещения →
      </button>
    </section>
  )
}
```

- [ ] **Step 2: Build check**

- [ ] **Step 3: Commit**
```bash
git add src/components/dashboard/cards/NotificationsOwnCard.jsx
git commit -m "feat(dashboard): add NotificationsOwnCard (top-3 feed)"
```

---

## Task 16: Section title rename + grid + registry

**Files:**
- Modify: `src/components/dashboard/SectionTasks.jsx`
- Modify: `src/components/dashboard/cardRegistry.jsx`

- [ ] **Step 1: Update SectionTasks.jsx**

```jsx
import { Section, SubSection } from './Section.jsx'
import { TASK_CARDS, renderCards } from './cardRegistry.jsx'

export function SectionTasks({ user }) {
  const rendered = renderCards(TASK_CARDS, user, { user })
  if (rendered.length === 0) return null
  return (
    <Section id="tasks" title="Задачи и оповещения">
      <SubSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{rendered}</div>
      </SubSection>
    </Section>
  )
}
```

- [ ] **Step 2: Update cardRegistry.jsx**

```jsx
import { TasksOwnCard } from './cards/TasksOwnCard.jsx'
import { NotificationsOwnCard } from './cards/NotificationsOwnCard.jsx'

export const TASK_CARDS = [
  { id: 'tasks_own',         component: TasksOwnCard,         requires: 'view_own_tasks' },
  { id: 'notifications_own', component: NotificationsOwnCard, requires: null },
]
```

⚠ `requires: null` — `renderCards` filter `!c.requires` пропускает; карточка показывается всем.

- [ ] **Step 3: Run tests + build**

- [ ] **Step 4: Commit**
```bash
git add src/components/dashboard/SectionTasks.jsx src/components/dashboard/cardRegistry.jsx
git commit -m "feat(dashboard): section title «Задачи и оповещения» + register NotificationsOwnCard"
```

---

## Task 17: Cleanup orphan'ed `usePendingDeletionCount`

**Files:**
- Investigate then modify or delete: `src/hooks/usePendingDeletionCount.js`

- [ ] **Step 1: Check usage**
```bash
grep -rn "usePendingDeletionCount" src/ 2>/dev/null
```

- [ ] **Step 2: Если нет usage — удалить файл (+ тесты, если есть)**
```bash
rm src/hooks/usePendingDeletionCount.js  # if orphan
```

- [ ] **Step 3: Run tests + build**

- [ ] **Step 4: Commit (only if file deleted)**
```bash
git add -A
git commit -m "chore: remove orphan'ed usePendingDeletionCount hook"
```

---

## Task 18: Manual smoke (preview deploy)

**Files:** none.

- [ ] **Step 1: Push branch + deploy preview**
```bash
git push -u origin feat/notifications-inbox
vercel switch clubmonaco2017-ops-projects
vercel --yes 2>&1 | grep -E "Preview|ready"
```

- [ ] **Step 2: Smoke matrix (2 sessions)**

(See Test Plan in spec.)

- [ ] **Step 3: Если баги — fix loop (commit + redeploy).**

---

## Task 19: PR + merge + production deploy + memory updates

**Files:**
- Memory: `~/.claude/projects/.../memory/project_notifications_roadmap.md` — отметить inbox DONE.
- Memory: new `project_notifications_inbox.md` — architecture summary.

- [ ] **Step 1: Switch gh auth**
```bash
gh auth switch --user clubmonaco2017-ops
```

- [ ] **Step 2: Create PR**
```bash
gh pr create --title "feat: notifications inbox MVP for all roles" --body "$(cat <<'EOF'
## Summary
- Computed feed (task_activity + team_activity + deletion_requests) with per-role scoping
- Bell visible to all users; badge = unseen count
- /notifications rewrite (was superadmin deletion-only)
- New dashboard card NotificationsOwnCard (top-3 feed) next to TasksOwnCard
- Realtime: реюз channel + 2 новых таблицы

## Migrations (6)
91 schema, 92-94 RPCs, 95-96 realtime + RLS

## Test plan
- [x] Unit hooks + formatter
- [x] Build clean
- [x] Manual smoke 2-session: live updates, scoping per role, deletion modal works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge**
```bash
gh pr merge <PR#> --squash
```

- [ ] **Step 4: Production deploy from main**
```bash
cd /Users/artemsaskin/Work/operator-dashboard
git checkout main && git pull
vercel --prod --yes
```

- [ ] **Step 5: Update memory** — mark inbox DONE in `project_notifications_roadmap.md`, write `project_notifications_inbox.md` summary.

- [ ] **Step 6: Cleanup worktree**
```bash
git worktree remove .claude/worktrees/feat-notifications-inbox
```

---

## Open dependencies / external work needed

- **Migrations 91-96** — apply user-side в Supabase Studio sequentially (5 separate SQL apply rounds).
- **Vercel preview** for smoke (Task 18).
- **2 sessions** для manual smoke.
