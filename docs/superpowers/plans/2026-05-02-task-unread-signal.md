# Task Unread Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить unread signal для задач — counter badge на иконке Tasks в RailNav + per-task dot в master-list. Subscribers = assignee + creator. Auto-mark seen при открытии detail. Filter actor_id != self. Replace overdue badge → unread badge.

**Architecture:** Новая таблица `task_last_seen(user_id, task_id, last_seen_at)` + 2 RPCs (`mark_task_seen`, `count_unread_tasks`) + extension `list_tasks` (adds `is_unread` boolean). Hook `useUnreadTasksCount` mirror `useUserOverdueCount` pattern (module-level cache + invalidate). UI: RailNav badge swap; TaskListItem renders dot if `is_unread`; useTask fires mark_task_seen on first load; useTaskActions invalidates unread count at every mutation.

**Tech Stack:** PostgreSQL (RPC + DDL) + Supabase + React 19 + Vite + Vitest + Tailwind + lucide-react.

**Reference patterns:**
- `src/hooks/useUserOverdueCount.js` — module cache + subscribers + invalidate pattern (mirror exactly)
- `src/hooks/useTaskActions.js:26-33` — `invalidate` callback (extend to invalidate unread count too)
- `src/components/shell/RailNav.jsx:74` — current badge source (`useUserOverdueCount`); swap to `useUnreadTasksCount`
- `db/migrations/20260429_68_fix_accessible_agencies_alias.sql` — current `list_tasks` definition; need DROP+CREATE

**Spec:** [`docs/superpowers/specs/2026-05-02-task-unread-signal-design.md`](../specs/2026-05-02-task-unread-signal-design.md)

**Branching:** Feature branch `feat/task-unread-signal` off main. Worktree at `.claude/worktrees/feat-task-unread-signal`.

**Per memory `feedback_inline_sql.md`:** SQL миграции — inline в чате (Studio SQL editor), потом commit файла в репо.

---

## File Structure

**Created:**
- `db/migrations/20260502_85_task_last_seen_table.sql` — table + initial seed
- `db/migrations/20260502_86_rpc_task_unread.sql` — 2 RPCs + list_tasks extension
- `src/hooks/useUnreadTasksCount.js` (~100 LOC, mirrors useUserOverdueCount)
- `src/hooks/useUnreadTasksCount.test.js` (~80 LOC, 3 it-blocks)

**Modified:**
- `src/hooks/useTaskList.js` — pass through `is_unread` (no logic change, just shape)
- `src/hooks/useTask.js` — fire-and-forget mark_task_seen on first successful load
- `src/hooks/useTaskActions.js` — extend `invalidate()` to also call `invalidateUnreadTasksCount()`
- `src/components/shell/RailNav.jsx` — swap `useUserOverdueCount` → `useUnreadTasksCount` for Tasks badge
- `src/components/tasks/TaskListItem.jsx` — render unread dot if `task.is_unread`

**Deleted:** ничего.

---

## Task 0: Pre-flight & worktree

**Files:** none.

- [ ] **Step 1: Verify clean main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git status
git log --oneline -3
```

Expected: clean working tree.

- [ ] **Step 2: Create worktree**

```bash
git worktree add .claude/worktrees/feat-task-unread-signal -b feat/task-unread-signal
cd .claude/worktrees/feat-task-unread-signal
cp /Users/artemsaskin/Work/operator-dashboard/.env.local .env.local
cp -r /Users/artemsaskin/Work/operator-dashboard/.vercel .vercel 2>/dev/null
rm -rf .vercel/output 2>/dev/null
npm ci
```

- [ ] **Step 3: Pre-flight grep — `useUserOverdueCount` consumers**

```bash
grep -rn "useUserOverdueCount" src/ --include="*.jsx" --include="*.js"
```

Expected: только `src/hooks/useUserOverdueCount.js` (definition) и `src/components/shell/RailNav.jsx` (1 import + 1 use). Если есть другие consumers — отметить, не трогать (hook остаётся в lib).

Также:
```bash
grep -rn "list_tasks" src/ --include="*.jsx" --include="*.js"
```

Expected: только `src/hooks/useTaskList.js` (call site). Это единственный consumer RPC — расширение signature не сломает других.

- [ ] **Step 4: Baseline tests + build**

```bash
npm run test:run
npm run build
```

Expected baseline: 19 pre-existing failures + 5 file crashes. Build clean.

---

## Task 1: Migration 85 — `task_last_seen` table + initial seed

**Files:**
- Create: `db/migrations/20260502_85_task_last_seen_table.sql`

⚠ **Apply via Supabase Studio SQL Editor first** (per memory `feedback_inline_sql.md`), then commit file to repo.

- [ ] **Step 1: Show SQL to user for Studio apply**

SQL (paste into Studio SQL Editor):

```sql
-- Migration 85: task_last_seen table — per-user-per-task seen tracking.
-- Used by count_unread_tasks RPC + list_tasks is_unread column (migration 86).

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_last_seen (
  user_id      integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  task_id      integer NOT NULL REFERENCES tasks(id)            ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_last_seen_user
  ON public.task_last_seen(user_id);

-- Initial seed: mark all (assignee, creator) × tasks as seen at now()
-- to prevent day-1 shock (huge counter for existing tasks).
INSERT INTO public.task_last_seen (user_id, task_id, last_seen_at)
SELECT u.id, t.id, now()
FROM tasks t
CROSS JOIN dashboard_users u
WHERE u.is_active = true
  AND (t.assigned_to = u.id OR t.created_by = u.id)
ON CONFLICT DO NOTHING;

-- RLS: SECURITY DEFINER RPCs handle access; no row-level policies needed
-- (table is internal, accessed only via RPCs).

COMMIT;

-- VERIFY:
--   SELECT count(*) FROM task_last_seen;
--   -- Expected: ~ (active users × their involved tasks).
--
-- ROLLBACK:
--   DROP TABLE public.task_last_seen;
```

User runs this in Studio. Expected: BEGIN/COMMIT, no errors.

- [ ] **Step 2: Wait for user confirmation «applied», then create file in repo**

Create `db/migrations/20260502_85_task_last_seen_table.sql` with same SQL content (copy verbatim).

- [ ] **Step 3: Commit**

```bash
git add db/migrations/20260502_85_task_last_seen_table.sql
git commit -m "feat(db): add task_last_seen table + initial seed"
```

---

## Task 2: Migration 86 — `mark_task_seen` + `count_unread_tasks` + extended `list_tasks`

**Files:**
- Create: `db/migrations/20260502_86_rpc_task_unread.sql`

⚠ Same flow: Studio apply first, then commit file.

- [ ] **Step 1: Show SQL to user**

SQL (paste into Studio):

```sql
-- Migration 86: task unread RPCs + list_tasks extension.
--
-- Adds:
--   - mark_task_seen(p_task_id) — upsert (current_user, task_id, now())
--   - count_unread_tasks() — counter for current user
--   - list_tasks (DROP+CREATE) — adds is_unread boolean column

BEGIN;

-- ============================================================
-- mark_task_seen(p_task_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_task_seen(p_task_id integer)
RETURNS void
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

  INSERT INTO task_last_seen (user_id, task_id, last_seen_at)
  VALUES (v_caller_id, p_task_id, now())
  ON CONFLICT (user_id, task_id) DO UPDATE SET last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_task_seen(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_task_seen(integer) TO authenticated;

-- ============================================================
-- count_unread_tasks() — counter for current user
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_unread_tasks()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_count     integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM tasks t
  WHERE (t.assigned_to = v_caller_id OR t.created_by = v_caller_id)
    AND EXISTS (
      SELECT 1
      FROM task_activity ta
      LEFT JOIN task_last_seen tls
        ON tls.user_id = v_caller_id AND tls.task_id = t.id
      WHERE ta.task_id = t.id
        AND ta.actor_id IS DISTINCT FROM v_caller_id
        AND ta.created_at > COALESCE(tls.last_seen_at, '1970-01-01'::timestamptz)
    );

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.count_unread_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_tasks() TO authenticated;

-- ============================================================
-- list_tasks — DROP+CREATE с новой колонкой is_unread
-- ============================================================
DROP FUNCTION IF EXISTS public.list_tasks(text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.list_tasks(
  p_box       text DEFAULT 'inbox',
  p_status    text DEFAULT 'all',
  p_search    text DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL
) RETURNS TABLE (
  id                 integer,
  title              text,
  description        text,
  created_by         integer,
  created_by_name    text,
  assigned_to        integer,
  assigned_to_name   text,
  deadline           timestamptz,
  status             text,
  effective_status   text,
  completed_at       timestamptz,
  has_report         boolean,
  created_at         timestamptz,
  agency_id          uuid,
  agency_name        text,
  is_unread          boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_search    text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF p_box NOT IN ('inbox', 'outbox', 'all') THEN
    RAISE EXCEPTION 'недопустимое значение box: %', p_box;
  END IF;
  IF p_status NOT IN ('all', 'pending', 'in_progress', 'done', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'недопустимое значение status: %', p_status;
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u
   WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF p_box = 'all' AND NOT has_permission(v_caller_id, 'view_all_tasks') THEN
    RAISE EXCEPTION 'только администратор может видеть все задачи' USING errcode = '42501';
  END IF;
  IF p_box = 'outbox' AND v_role = 'operator' THEN
    RAISE EXCEPTION 'оператор не может использовать outbox';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id, t.title, t.description, t.created_by,
      COALESCE(NULLIF(trim(COALESCE(cu.first_name,'') || ' ' || COALESCE(cu.last_name,'')), ''),
               cu.alias, cu.email) AS created_by_name,
      t.assigned_to,
      COALESCE(NULLIF(trim(COALESCE(au.first_name,'') || ' ' || COALESCE(au.last_name,'')), ''),
               au.alias, au.email) AS assigned_to_name,
      t.deadline, t.status,
      CASE
        WHEN t.deadline IS NOT NULL AND t.deadline < now()
         AND t.status IN ('pending', 'in_progress')
        THEN 'overdue' ELSE t.status END AS effective_status,
      t.completed_at,
      EXISTS (SELECT 1 FROM task_reports tr WHERE tr.task_id = t.id) AS has_report,
      t.created_at,
      au.agency_id AS agency_id,
      ag.name      AS agency_name,
      EXISTS (
        SELECT 1
        FROM task_activity ta
        LEFT JOIN task_last_seen tls
          ON tls.user_id = v_caller_id AND tls.task_id = t.id
        WHERE ta.task_id = t.id
          AND ta.actor_id IS DISTINCT FROM v_caller_id
          AND ta.created_at > COALESCE(tls.last_seen_at, '1970-01-01'::timestamptz)
      ) AS is_unread
    FROM tasks t
    LEFT JOIN dashboard_users cu ON cu.id = t.created_by
    LEFT JOIN dashboard_users au ON au.id = t.assigned_to
    LEFT JOIN agencies        ag ON ag.id = au.agency_id
    WHERE
      ((p_box = 'inbox'  AND t.assigned_to = v_caller_id)
        OR (p_box = 'outbox' AND t.created_by = v_caller_id)
        OR (p_box = 'all'))
      AND (
        (p_agency_id IS NOT NULL AND au.agency_id = p_agency_id)
        OR
        (p_agency_id IS NULL AND (
          au.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc)
          OR (au.agency_id IS NULL AND has_permission(v_caller_id, 'view_all_tasks'))
        ))
      )
  )
  SELECT
    b.id, b.title, b.description, b.created_by, b.created_by_name,
    b.assigned_to, b.assigned_to_name, b.deadline, b.status, b.effective_status,
    b.completed_at, b.has_report, b.created_at, b.agency_id, b.agency_name,
    b.is_unread
  FROM base b
  WHERE
    (p_status = 'all' OR b.effective_status = p_status)
    AND (
      v_search IS NULL
      OR b.title              ILIKE '%' || v_search || '%'
      OR b.description        ILIKE '%' || v_search || '%'
      OR b.created_by_name    ILIKE '%' || v_search || '%'
      OR b.assigned_to_name   ILIKE '%' || v_search || '%'
    )
  ORDER BY b.created_at DESC
  LIMIT 200;
END $$;

REVOKE ALL ON FUNCTION public.list_tasks(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tasks(text, text, text, uuid) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname FROM pg_proc WHERE proname IN ('mark_task_seen', 'count_unread_tasks', 'list_tasks');
--   -- Expected: 3 rows.
--
--   SELECT count_unread_tasks();
--   -- Expected: 0 (all seeded as seen).
--
--   SELECT id, title, is_unread FROM list_tasks('inbox', 'all', NULL, NULL) LIMIT 5;
--   -- Expected: rows with is_unread = false (after seed).
--
-- ROLLBACK:
--   DROP FUNCTION public.mark_task_seen(integer);
--   DROP FUNCTION public.count_unread_tasks();
--   -- Restore original list_tasks from migration 68.
```

User runs in Studio. Expected: BEGIN/COMMIT, 3 functions visible.

- [ ] **Step 2: After «applied» — create file in repo**

Create `db/migrations/20260502_86_rpc_task_unread.sql` with same SQL.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/20260502_86_rpc_task_unread.sql
git commit -m "feat(db): add mark_task_seen + count_unread_tasks RPCs; extend list_tasks"
```

---

## Task 3: `useUnreadTasksCount` hook — TDD

**Files:**
- Create: `src/hooks/useUnreadTasksCount.js`
- Create: `src/hooks/useUnreadTasksCount.test.js`

Mirror `useUserOverdueCount` pattern exactly: module-level cache + subscribers + invalidate fns.

- [ ] **Step 1: Write failing test** — create `src/hooks/useUnreadTasksCount.test.js`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}))

import { supabase } from '../supabaseClient'
import {
  useUnreadTasksCount,
  invalidateUnreadTasksCount,
  invalidateAllUnreadTasksCount,
} from './useUnreadTasksCount.js'

beforeEach(() => {
  supabase.rpc.mockReset()
  // Clear module cache between tests
  invalidateAllUnreadTasksCount()
})

describe('useUnreadTasksCount', () => {
  it('fetches count from count_unread_tasks RPC and caches it', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 5, error: null })
    const { result } = renderHook(() => useUnreadTasksCount(42))
    await waitFor(() => expect(result.current.count).toBe(5))
    expect(supabase.rpc).toHaveBeenCalledWith('count_unread_tasks')

    // Second mount — uses cache, no new RPC call
    supabase.rpc.mockClear()
    const { result: result2 } = renderHook(() => useUnreadTasksCount(42))
    expect(result2.current.count).toBe(5)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('invalidateUnreadTasksCount(userId) clears cache and re-fetches in mounted hooks', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 3, error: null })
    const { result } = renderHook(() => useUnreadTasksCount(42))
    await waitFor(() => expect(result.current.count).toBe(3))

    supabase.rpc.mockResolvedValueOnce({ data: 7, error: null })
    act(() => invalidateUnreadTasksCount(42))
    await waitFor(() => expect(result.current.count).toBe(7))
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('returns 0 and skips fetch when userId is null', () => {
    const { result } = renderHook(() => useUnreadTasksCount(null))
    expect(result.current.count).toBe(0)
    expect(result.current.loading).toBe(false)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect 3 failed (Cannot find module)**

```bash
npm run test:run -- src/hooks/useUnreadTasksCount.test.js
```

- [ ] **Step 3: Implement `useUnreadTasksCount.js`** with this exact content:

```js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Module-level cache: userId → number.
// Mirrors useUserOverdueCount pattern — single fetch per userId per app session,
// re-fetch on invalidate via subscribers.
const cache = new Map()
const subscribers = new Set()

function notifyAll() {
  subscribers.forEach((cb) => {
    try {
      cb()
    } catch {
      /* swallow per-subscriber errors */
    }
  })
}

/**
 * Сбросить кэш счётчика непрочитанных задач для пользователя.
 * Без аргумента — очистить весь кэш.
 * @param {number|null|undefined} [userId]
 */
export function invalidateUnreadTasksCount(userId) {
  if (userId == null) {
    cache.clear()
    notifyAll()
    return
  }
  cache.delete(userId)
  notifyAll()
}

/**
 * Полностью очистить кэш (для тестов / массовых операций).
 */
export function invalidateAllUnreadTasksCount() {
  cache.clear()
  notifyAll()
}

/**
 * Кол-во непрочитанных задач у current user (RPC count_unread_tasks).
 * Кэшируется в памяти модуля; инвалидация — invalidateUnreadTasksCount.
 *
 * @param {number|null} userId — nullable; null → returns 0 без запроса
 * @returns {{count: number, loading: boolean, reload: () => void}}
 */
export function useUnreadTasksCount(userId) {
  const [count, setCount] = useState(() =>
    userId != null && cache.has(userId) ? cache.get(userId) : 0,
  )
  const [loading, setLoading] = useState(() => userId != null && !cache.has(userId))
  const [version, setVersion] = useState(0)

  // Subscribe to cache invalidation — bump version → re-run fetch effect.
  useEffect(() => {
    const cb = () => setVersion((v) => v + 1)
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])

  useEffect(() => {
    if (userId == null) {
      setCount(0)
      setLoading(false)
      return
    }
    if (cache.has(userId)) {
      setCount(cache.get(userId))
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const run = async () => {
      const { data, error: err } = await supabase.rpc('count_unread_tasks')
      if (cancelled) return
      if (err) {
        // Тихо: показываем 0; не кешируем.
        setCount(0)
      } else {
        const value = Number(data ?? 0)
        cache.set(userId, value)
        setCount(value)
      }
      setLoading(false)
    }

    run().catch(() => {
      if (!cancelled) {
        setCount(0)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [userId, version])

  const reload = useCallback(() => {
    if (userId != null) cache.delete(userId)
    setVersion((v) => v + 1)
  }, [userId])

  return { count, loading, reload }
}
```

- [ ] **Step 4: Run tests — expect 3 passed**

```bash
npm run test:run -- src/hooks/useUnreadTasksCount.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUnreadTasksCount.js src/hooks/useUnreadTasksCount.test.js
git commit -m "feat(hooks): add useUnreadTasksCount (mirror useUserOverdueCount pattern)"
```

---

## Task 4: `useTaskList` — pass through `is_unread`

**Files:**
- Modify: `src/hooks/useTaskList.js`

`useTaskList` сейчас: `setRows(data ?? [])`. RPC возвращает rows с auto-mapped columns (Supabase JS возвращает row as object с column names). После migration 86 у row есть `is_unread` field автоматически — JS не нужно ничего map'ить.

**No change required в useTaskList.js** — Supabase возвращает row object с new column. Verify by reading the file:

- [ ] **Step 1: Read file**

```bash
cat src/hooks/useTaskList.js | head -70
```

Confirm `setRows(data ?? [])` без manual mapping. If true — **no edit needed**, skip Steps 2-4 below.

⚠ Если в файле есть manual mapping (например `data.map(r => ({ id: r.id, ... }))` без is_unread), то ДОБАВИТЬ `is_unread: r.is_unread` в map. Проверить.

- [ ] **Step 2: Verify TaskList consumer doesn't strip new field**

```bash
grep -n "is_unread\|task\." src/components/tasks/TaskList.jsx 2>&1 | head
```

Expected: TaskList renders `<TaskListItem task={...}>`. If passes whole row → is_unread propagates automatically.

- [ ] **Step 3: No commit needed if file unchanged**

If file does have manual mapping that needs update:
```bash
git add src/hooks/useTaskList.js
git commit -m "feat(hooks): useTaskList passes through is_unread from RPC"
```

Otherwise skip — no diff.

---

## Task 5: `useTask` — fire mark_task_seen on first load

**Files:**
- Modify: `src/hooks/useTask.js`

Add a fire-and-forget RPC call on first successful load: marks task as seen for current user, then invalidates the unread counter (so RailNav badge updates).

- [ ] **Step 1: Read current `useTask.js` (53 LOC)**

```bash
cat src/hooks/useTask.js
```

Note: hook fetches task via `get_task_detail`, sets `row` state on success.

- [ ] **Step 2: Modify — add mark_task_seen call after successful load**

Replace the `.then(...)` block to fire mark_task_seen on success. Updated full file:

```js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUnreadTasksCount } from './useUnreadTasksCount.js'

/**
 * Деталь одной задачи (через RPC get_task_detail).
 * RPC возвращает TABLE — берём первую строку. Activity-лента включена в payload.
 *
 * Side effect: на каждом успешном load вызывает mark_task_seen для current
 * task_id (idempotent) и инвалидирует unread counter.
 *
 * @param {number|null} callerId
 * @param {number|string|null} taskId
 */
export function useTask(callerId, taskId) {
  const id = taskId == null ? null : Number(taskId)
  const idValid = Number.isFinite(id) && id > 0

  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(() => !!(callerId && idValid))
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId || !idValid) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('get_task_detail', { p_task_id: id })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRow(null)
        } else if (!data || data.length === 0) {
          setError('Задача не найдена')
          setRow(null)
        } else {
          setRow(data[0])
          // Fire-and-forget: mark task as seen, invalidate counter.
          // Errors swallowed — UX не должен блокироваться.
          supabase
            .rpc('mark_task_seen', { p_task_id: id })
            .then(() => invalidateUnreadTasksCount(callerId))
            .catch(() => { /* ignore */ })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, id, idValid, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { row, loading, error, reload }
}
```

- [ ] **Step 3: Run full test suite — verify no regressions**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
```

Expected: те же 19 baseline failures + 3 wrapper passes (Task 3) + ничего нового. useTask doesn't have its own test file (skip per-file run).

- [ ] **Step 4: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTask.js
git commit -m "feat(tasks): useTask fires mark_task_seen on load + invalidates unread counter"
```

---

## Task 6: `useTaskActions` — invalidate unread count alongside overdue

**Files:**
- Modify: `src/hooks/useTaskActions.js`

Existing `invalidate(otherUserId)` callback invalidates `useUserOverdueCount` for callerId + otherUserId. Extend to also invalidate `useUnreadTasksCount`.

- [ ] **Step 1: Read current `invalidate` block**

```bash
sed -n '1,35p' src/hooks/useTaskActions.js
```

Note: imports `invalidateUserOverdueCount`; defines `invalidate` callback at line ~26.

- [ ] **Step 2: Add import**

В `src/hooks/useTaskActions.js` добавить (рядом с existing import line 3):

```js
import { invalidateUnreadTasksCount } from './useUnreadTasksCount.js'
```

- [ ] **Step 3: Extend `invalidate` callback**

Найти (около строки 26-33):
```js
  const invalidate = useCallback(
    (otherUserId) => {
      if (callerId != null) invalidateUserOverdueCount(callerId)
      if (otherUserId != null && otherUserId !== callerId)
        invalidateUserOverdueCount(otherUserId)
    },
    [callerId],
  )
```

Заменить на:
```js
  const invalidate = useCallback(
    (otherUserId) => {
      if (callerId != null) {
        invalidateUserOverdueCount(callerId)
        invalidateUnreadTasksCount(callerId)
      }
      if (otherUserId != null && otherUserId !== callerId) {
        invalidateUserOverdueCount(otherUserId)
        invalidateUnreadTasksCount(otherUserId)
      }
    },
    [callerId],
  )
```

- [ ] **Step 4: Run full test suite**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
```

Expected: те же baseline failures.

- [ ] **Step 5: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTaskActions.js
git commit -m "feat(tasks): useTaskActions invalidates unread count parallel to overdue"
```

---

## Task 7: `RailNav` — swap badge source

**Files:**
- Modify: `src/components/shell/RailNav.jsx`

Replace `useUserOverdueCount` with `useUnreadTasksCount` for Tasks badge. Keep all other badges (notifications etc.) unchanged.

- [ ] **Step 1: Read current `RailNav.jsx`**

```bash
cat src/components/shell/RailNav.jsx
```

Note: imports `useUserOverdueCount`; calls it на line ~74 как `const { count: overdueCount } = useUserOverdueCount(...)`. Badge prop on Tasks RailItem — `badge={overdueCount}`.

- [ ] **Step 2: Replace import**

В `src/components/shell/RailNav.jsx`:

Найти:
```js
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
```

Заменить на:
```js
import { useUnreadTasksCount } from '../../hooks/useUnreadTasksCount.js'
```

- [ ] **Step 3: Replace hook call + badge prop**

Найти:
```js
  const { count: overdueCount } = useUserOverdueCount(canSeeTasks ? user?.id : null)
```

Заменить на:
```js
  const { count: unreadCount } = useUnreadTasksCount(canSeeTasks ? user?.id : null)
```

И в JSX найти:
```jsx
        <RailItem
          to="/tasks"
          icon={<CheckSquare size={20} />}
          label="Задачи"
          badge={overdueCount}
        />
```

Заменить `badge={overdueCount}` на `badge={unreadCount}`.

- [ ] **Step 4: Run tests + build**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
npm run build 2>&1 | tail -3
```

Expected: те же baseline failures + clean build.

⚠ Если есть RailNav.test.jsx с mocks `useUserOverdueCount` — нужно поменять mock на `useUnreadTasksCount`. Проверить:
```bash
grep -n "useUserOverdueCount\|useUnreadTasksCount" src/components/shell/RailNav.test.jsx 2>&1
```

If found, update mock в тесте на новое имя.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/RailNav.jsx src/components/shell/RailNav.test.jsx 2>/dev/null
git commit -m "feat(shell): RailNav Tasks badge → unread count (was overdue count)"
```

---

## Task 8: `TaskListItem` — render unread dot

**Files:**
- Modify: `src/components/tasks/TaskListItem.jsx`

Render small dot to the left if `task.is_unread === true`.

- [ ] **Step 1: Read current file**

```bash
cat src/components/tasks/TaskListItem.jsx
```

Note: file is ~106 LOC. Renders `<Link>` with className grid + StatusPill + title.

- [ ] **Step 2: Add unread dot**

Внутри `<Link>` обёртки, ДО первого child (StatusPill), добавить:

```jsx
{task.is_unread && (
  <span
    aria-label="Непрочитанная задача"
    className="absolute left-1 top-3 h-2 w-2 rounded-full bg-primary"
  />
)}
```

Note: `<Link>` уже имеет `relative` в className (если нет — добавить class `relative` к outer Link).

Verify сначала что Link className содержит `relative`:
```bash
grep "relative" src/components/tasks/TaskListItem.jsx | head -3
```

Если `relative` отсутствует — добавить в Link className.

- [ ] **Step 3: Run tests + build**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
npm run build 2>&1 | tail -3
```

Expected: baseline + clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/TaskListItem.jsx
git commit -m "feat(tasks): TaskListItem renders unread dot when is_unread=true"
```

---

## Task 9: Manual smoke test (preview deploy)

**Files:** none.

- [ ] **Step 1: Deploy preview**

```bash
vercel
```

Expected: preview URL.

- [ ] **Step 2: Walk through scenarios** (нужно 2 user'а — например, superadmin + любой operator)

User X = current logged in. User Y = другой user (или второй tab/incognito с другим аккаунтом).

- [ ] (a) X login → RailNav Tasks icon: badge = 0 (initial seed all marked seen).
- [ ] (b) Y создаёт task assigned to X (if Y is admin/lead) → X refresh page → badge = 1, в /tasks master-list dot слева у новой задачи.
- [ ] (c) X кликает task → detail open → badge → 0, dot пропадает.
- [ ] (d) Y submit report (if assignment goes Y→X→done flow): X badge = 1.
- [ ] (e) X создаёт task assigned to Z → X badge не меняется (own action).
- [ ] (f) Z (assignee) открывает свою задачу → Z badge = 0 (own action не unread for self).
- [ ] (g) Overdue indicator в master-list (StatusPill) — без регрессий, всё ещё показывает «Просрочено» badge для overdue tasks.

- [ ] **Step 3: Записать результаты**

Если регрессы — починить (additional commit). Если ОК — Task 10.

---

## Task 10: Final validation + memory update + PR + merge + deploy

**Files:**
- Modify: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/MEMORY.md` (memory вне репо) — добавить entry про unread feature

- [ ] **Step 1: Final test/build/lint**

```bash
npm run test:run
npm run build
npm run lint
```

Expected:
- Tests: те же 19 baseline failures + 3 новых wrapper passes (~356 total).
- Build: clean.
- Lint: baseline ~75 problems, без новых.

- [ ] **Step 2: Add memory entry**

Создать новый memory file `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_task_unread_signal.md`:

```markdown
---
name: Task unread signal
description: RailNav unread badge + per-task dot — task_last_seen table tracks per-user-per-task; auto-mark on detail open
type: project
---
**Status:** DONE PR #<TBD>.

Architecture:
- DB: `task_last_seen(user_id, task_id, last_seen_at)` table (migration 85, initial seed marks all as seen).
- RPCs (migration 86): `mark_task_seen(p_task_id)`, `count_unread_tasks()`, extended `list_tasks` (adds `is_unread` column).
- Hook: `useUnreadTasksCount` mirrors `useUserOverdueCount` pattern (module cache + subscribers + invalidate fns).
- UI: RailNav Tasks badge teper unread count (replaced overdue); TaskListItem renders dot when `task.is_unread`.
- Auto-mark seen: useTask fires `mark_task_seen` on first successful load → invalidate counter.
- Filter: own actor_id excluded — own actions don't make task unread for self.
- Subscribers: assignee + creator.

**Out of scope (deferred):** realtime push (Supabase channel), notifications inbox page, mark-all-as-read button, per-event-type granularity, sound/desktop notifications.
```

И добавить line в `MEMORY.md` index:
```
- [Task unread signal](project_task_unread_signal.md) — RailNav badge + per-task dot для непрочитанных задач (task_last_seen table)
```

- [ ] **Step 3: Verify clean state**

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean, ~7-8 commits на ветке.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/task-unread-signal
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat(tasks): unread signal — RailNav badge + per-task dot" --body "$(cat <<'EOF'
## Summary
Добавляет «unread» signal для задач:
- RailNav Tasks icon badge = количество tasks с unseen events для current user (replaced overdue badge).
- В master-list `/tasks` каждая такая задача помечается dot'ом слева.
- Auto-mark seen при открытии detail page (`/tasks/:id`).
- Subscribers: assignee + creator.
- Filter own actor_id — свои действия не unread for self.

## DB
- Migration 85: `task_last_seen(user_id, task_id, last_seen_at)` table + initial seed (все existing задачи помечены seen, day-1 без шока).
- Migration 86: `mark_task_seen` + `count_unread_tasks` RPCs; `list_tasks` extension (adds `is_unread` boolean column, DROP+CREATE).

## Code
- `useUnreadTasksCount` — mirror `useUserOverdueCount` pattern (module cache + subscribers + invalidate).
- `useTask` — fire-and-forget `mark_task_seen` on first load → invalidate counter.
- `useTaskActions.invalidate()` — extended invalidate parallel `unread + overdue` counters at every mutation.
- `RailNav` — swap badge source (was overdue, now unread).
- `TaskListItem` — render dot if `task.is_unread`.

## Out of scope
Realtime push, notifications inbox page, mark-all-as-read button, sound/desktop notifications. Counter обновляется на mount + mutations через invalidate.

Spec: \`docs/superpowers/specs/2026-05-02-task-unread-signal-design.md\`
Plan: \`docs/superpowers/plans/2026-05-02-task-unread-signal.md\`

## Test plan
- [x] npm run test:run: те же baseline 19 failures + 3 новых wrapper passes.
- [x] Build clean; lint baseline.
- [ ] Smoke: X logs in (badge=0); Y creates task for X (X badge=1, dot in list); X opens task (badge=0, dot gone).
- [ ] Smoke: own actions не делают task unread для self.
- [ ] Overdue indicator в StatusPill master-list — без регрессов.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Update memory с PR номером**

После `gh pr create` — заменить `PR #<TBD>` на реальный номер в memory.

- [ ] **Step 7: Switch gh user перед merge**

```bash
gh auth switch --user clubmonaco2017-ops
```

- [ ] **Step 8: Merge after approval**

```bash
gh pr merge <PR#> --squash --delete-branch
```

⚠ Если merge fails из-за worktree — выполнить из main checkout:
```bash
cd /Users/artemsaskin/Work/operator-dashboard && gh pr merge <PR#> --squash --delete-branch
```

- [ ] **Step 9: Cleanup worktree + sync main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git worktree remove .claude/worktrees/feat-task-unread-signal
git branch -D feat/task-unread-signal 2>/dev/null || true
git pull --ff-only
```

- [ ] **Step 10: Production deploy**

```bash
vercel --prod
```

Expected: production URL.

---

## Self-review (после написания плана — выполнено перед сдачей)

1. **Spec coverage** — каждый goal из spec'а покрыт задачей:
   - Goal 1 (RailNav counter) — Task 7.
   - Goal 2 (per-task dot) — Task 8.
   - Goal 3 (auto-mark seen on detail) — Task 5.
   - Goal 4 (subscribers assignee + creator) — Tasks 1+2 (RPC logic).
   - Goal 5 (filter own actor_id) — Tasks 1+2 (RPC `actor_id IS DISTINCT FROM caller_id`).
   - Goal 6 (module cache + invalidate) — Task 3.
   - Goal 7 (initial seed) — Task 1 (INSERT в migration 85).
   - Goal 8 (replace overdue badge) — Task 7.

2. **Placeholder scan** — нет TBD/«implement later». Все code-блоки полные. PR # — это ожидаемый TBD до `gh pr create`.

3. **Type / naming consistency**:
   - `task_last_seen` table — same name everywhere.
   - RPC names: `mark_task_seen`, `count_unread_tasks`, `list_tasks` — single canonical name each.
   - Hook: `useUnreadTasksCount` — same import + use.
   - Invalidate fn: `invalidateUnreadTasksCount` (mirrors `invalidateUserOverdueCount` naming).
   - `is_unread` column name — used in RPC, useTaskList row pass-through, TaskListItem render.

4. **Out-of-scope чистота**: ни одна задача не трогает `useUserOverdueCount` (остаётся как есть для других потенциальных consumers), не трогает realtime / notifications page / sound.

5. **Order dependencies**: Task 1 (table) → Task 2 (RPCs use table) → Task 3 (hook calls RPC) → Tasks 4-8 (code uses hook + new column). All linear, no parallel conflicts.

6. **Tests are real**: hook tests verify cache hit/miss, invalidate behavior, null userId — all observable behavior.

7. **Migration safety**: initial seed prevents day-1 shock; idempotent UPSERT in mark_task_seen; LATERAL JOIN doesn't break for tasks without activity (uses COALESCE с epoch fallback).
