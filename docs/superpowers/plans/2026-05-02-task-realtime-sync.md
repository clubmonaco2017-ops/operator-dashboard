# Task Realtime Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Делает unread feature live — RailNav badge + master-list dot обновляются в realtime без refresh, через Supabase Realtime postgres_changes channel на `task_activity`.

**Architecture:** Migration 87 добавляет `task_activity` в `supabase_realtime` publication. Новый hook `useTaskRealtimeSync(userId)` mounted в `AppShell` подписывается на channel с server-side filter `actor_id != self`; на event invalidate'ит `useUnreadTasksCount` + `invalidateUserTaskList()` (новая export). `useTaskList` расширен subscriber pattern (mirror `useUnreadTasksCount`).

**Tech Stack:** PostgreSQL (publication) + Supabase Realtime (postgres_changes channel) + React 19 + Vite + Vitest + supabase-js v2 (already installed).

**Reference patterns:**
- `src/hooks/useUnreadTasksCount.js` — module-level cache + subscribers + invalidate fns (mirror exactly)
- `src/hooks/useUserOverdueCount.js` — same pattern, even older реferences
- Supabase Realtime docs: `supabase.channel(name).on('postgres_changes', { event, schema, table, filter }, callback).subscribe()`

**Spec:** [`docs/superpowers/specs/2026-05-02-task-realtime-sync-design.md`](../specs/2026-05-02-task-realtime-sync-design.md)

**Branching:** Feature branch `feat/task-realtime-sync` off main. Worktree at `.claude/worktrees/feat-task-realtime-sync`.

**Per memory `feedback_inline_sql.md`:** SQL inline в чате (Studio SQL Editor), потом commit файла.

---

## File Structure

**Created:**
- `db/migrations/20260502_87_realtime_task_activity.sql` — ALTER PUBLICATION
- `src/hooks/useTaskRealtimeSync.js` (~30 LOC)
- `src/hooks/useTaskRealtimeSync.test.js` (~80 LOC, 2 it-blocks)

**Modified:**
- `src/hooks/useTaskList.js` — add subscriber pattern + `invalidateUserTaskList()` export
- `src/components/shell/AppShell.jsx` — mount `useTaskRealtimeSync(user?.id)`
- `src/components/shell/AppShell.test.jsx` — mock `useTaskRealtimeSync` (avoid render error)
- `src/components/shell/MobileShell.test.jsx` — same mock if needed (rendered inside AppShell flow)

**Deleted:** ничего.

---

## Task 0: Pre-flight & worktree

**Files:** none.

- [ ] **Step 1: Verify clean main + pull latest**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git status
git pull --ff-only
git log --oneline -3
```

Expected: clean working tree, top commit is the realtime spec.

- [ ] **Step 2: Create worktree**

```bash
git worktree add .claude/worktrees/feat-task-realtime-sync -b feat/task-realtime-sync
cd .claude/worktrees/feat-task-realtime-sync
cp /Users/artemsaskin/Work/operator-dashboard/.env.local .env.local
cp -r /Users/artemsaskin/Work/operator-dashboard/.vercel .vercel 2>/dev/null
rm -rf .vercel/output 2>/dev/null
npm ci
```

- [ ] **Step 3: Pre-flight grep — confirm no existing Realtime usage**

```bash
grep -rn "supabase.channel\|postgres_changes" src/ --include="*.jsx" --include="*.js"
```

Expected: пусто. Это первое использование Realtime.

- [ ] **Step 4: Pre-flight grep — `useTaskList` consumers**

```bash
grep -rn "useTaskList" src/ --include="*.jsx" --include="*.js"
```

Expected: только `src/pages/TaskListPage.jsx` (consumer) + `src/hooks/useTaskList.js` (definition). Subscriber pattern не сломает existing.

- [ ] **Step 5: Baseline tests + build**

```bash
npm run test:run
npm run build
```

Expected baseline: 19 pre-existing failures + 5 file crashes. Build clean.

---

## Task 1: Migration 87 — `task_activity` в realtime publication

**Files:**
- Create: `db/migrations/20260502_87_realtime_task_activity.sql`

⚠ **Apply via Supabase Studio SQL Editor first** (per memory), then commit file.

- [ ] **Step 1: Show SQL to user for Studio apply**

```sql
-- Migration 87: add task_activity to supabase_realtime publication.
-- Enables postgres_changes events to be broadcast to subscribed clients.

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity;

COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'task_activity';
--   -- Expected: 1 row.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.task_activity;
```

User runs in Studio. Expected: BEGIN/COMMIT.

⚠ Если ALTER PUBLICATION fail (privileges) — fallback: Supabase Studio UI → Database → Replication → toggle `task_activity` table в `supabase_realtime` publication.

- [ ] **Step 2: Wait for «applied», then create file in repo**

```bash
# Same SQL content into:
# db/migrations/20260502_87_realtime_task_activity.sql
```

- [ ] **Step 3: Smoke verify в Studio (recommended)**

В Studio SQL Editor:
```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'task_activity';
```
Expected: 1 row. Если 0 — что-то пошло не так, обсудить.

⚠ **REPLICA IDENTITY check** — payload events содержит ли `actor_id`?
```sql
SELECT relname, relreplident
FROM pg_class
WHERE relname = 'task_activity';
```
Expected: `d` (default — only PRIMARY KEY columns в payload) ИЛИ `f` (full — все columns в payload).

Realtime postgres_changes filter `actor_id=neq.X` работает ВНЕ зависимости от REPLICA IDENTITY (filter применяется на постгре уровне до broadcast). НО payload в `event.new` содержит только PK columns если IDENTITY DEFAULT. Это НЕ блокер для нашего use-case (мы payload не используем — просто invalidate'им). Если будет нужен payload в будущем — отдельная миграция `ALTER TABLE task_activity REPLICA IDENTITY FULL`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260502_87_realtime_task_activity.sql
git commit -m "feat(db): add task_activity to supabase_realtime publication"
```

---

## Task 2: `useTaskList` — subscriber pattern + `invalidateUserTaskList`

**Files:**
- Modify: `src/hooks/useTaskList.js`

Расширяем subscriber pattern (mirror `useUnreadTasksCount`). Module-level `subscribers` Set + exported `invalidateUserTaskList()` fn. Внутри hook'а subscribe + bump version → re-fetch.

- [ ] **Step 1: Read current `useTaskList.js`**

```bash
cat src/hooks/useTaskList.js
```

Note structure: hook returns `{ rows, loading, error, reload }`; effect deps `[callerId, box, status, debouncedSearch, effectiveAgencyId, reloadKey]`.

- [ ] **Step 2: Replace entire file** with this exact content:

```js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAgencyContext } from '../lib/agencyContext.jsx'

// Module-level subscriber set — for realtime/external invalidation.
// Mirrors useUnreadTasksCount / useUserOverdueCount pattern.
const subscribers = new Set()

function notifyAll() {
  subscribers.forEach((cb) => {
    try { cb() } catch { /* swallow per-subscriber errors */ }
  })
}

/**
 * Trigger a reload across all mounted useTaskList instances.
 * Called from useTaskRealtimeSync on relevant task_activity events.
 */
export function invalidateUserTaskList() {
  notifyAll()
}

/**
 * Список задач (через RPC list_tasks).
 * Поиск дебаунсится 300мс, чтобы не дёргать RPC на каждый keystroke.
 *
 * @param {number|null} callerId
 * @param {object} [opts]
 * @param {'inbox'|'outbox'|'all'} [opts.box]   — default 'inbox'
 * @param {'pending'|'in_progress'|'done'|'cancelled'|'overdue'|'all'} [opts.status] — default 'all'
 * @param {string} [opts.search]
 * @param {string|null} [opts.agencyId] — per-page override; when undefined falls
 *   back to AgencyContext.activeAgencyId.
 */
export function useTaskList(callerId, opts = {}) {
  const { box = 'inbox', status = 'all', search = '', agencyId } = opts
  const { activeAgencyId } = useAgencyContext()
  const effectiveAgencyId = agencyId !== undefined ? agencyId : activeAgencyId

  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [version, setVersion] = useState(0)

  // 300мс debounce для поиска.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Subscribe to module-level invalidation (realtime triggers).
  useEffect(() => {
    const cb = () => setVersion((v) => v + 1)
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_tasks', {
        p_box: box,
        p_status: status,
        p_search: debouncedSearch ?? '',
        p_agency_id: effectiveAgencyId,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRows([])
        } else {
          setRows(data ?? [])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, box, status, debouncedSearch, effectiveAgencyId, reloadKey, version])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, loading, error, reload }
}
```

Changes from original:
- Added module-level `subscribers` + `notifyAll` + `invalidateUserTaskList` exported fn.
- Hook adds `version` state + subscribe useEffect.
- Fetch effect deps include `version` → bump triggers re-fetch.

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
```

Expected: те же 19 pre-existing failures. Если useTaskList используется в каком-то test'e — verify не сломалось (subscriber pattern backwards-compatible).

- [ ] **Step 4: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTaskList.js
git commit -m "feat(hooks): useTaskList subscriber pattern + invalidateUserTaskList"
```

---

## Task 3: `useTaskRealtimeSync` hook — TDD

**Files:**
- Create: `src/hooks/useTaskRealtimeSync.js`
- Create: `src/hooks/useTaskRealtimeSync.test.js`

- [ ] **Step 1: Write failing test** — create `src/hooks/useTaskRealtimeSync.test.js`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))
vi.mock('./useUnreadTasksCount.js', () => ({
  invalidateUnreadTasksCount: vi.fn(),
}))
vi.mock('./useTaskList.js', () => ({
  invalidateUserTaskList: vi.fn(),
}))

import { supabase } from '../supabaseClient'
import { invalidateUnreadTasksCount } from './useUnreadTasksCount.js'
import { invalidateUserTaskList } from './useTaskList.js'
import { useTaskRealtimeSync } from './useTaskRealtimeSync.js'

beforeEach(() => {
  supabase.channel.mockReset()
  supabase.removeChannel.mockReset()
  invalidateUnreadTasksCount.mockReset()
  invalidateUserTaskList.mockReset()
})

describe('useTaskRealtimeSync', () => {
  it('subscribes channel with actor_id filter and cleans up on unmount', () => {
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn().mockReturnThis()
    const fakeChannel = { on, subscribe }
    on.mockReturnValue(fakeChannel)
    subscribe.mockReturnValue(fakeChannel)
    supabase.channel.mockReturnValue(fakeChannel)

    const { unmount } = renderHook(() => useTaskRealtimeSync(42))

    expect(supabase.channel).toHaveBeenCalledWith('task-activity-realtime-42')
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'task_activity',
        filter: 'actor_id=neq.42',
      }),
      expect.any(Function),
    )
    expect(subscribe).toHaveBeenCalled()

    unmount()
    expect(supabase.removeChannel).toHaveBeenCalledWith(fakeChannel)
  })

  it('invalidates counter + task list on event payload', () => {
    let capturedCallback = null
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn((_, __, cb) => {
      capturedCallback = cb
      return { on, subscribe }
    })
    const fakeChannel = { on, subscribe }
    supabase.channel.mockReturnValue(fakeChannel)

    renderHook(() => useTaskRealtimeSync(42))

    expect(capturedCallback).toBeTruthy()
    capturedCallback({ new: { actor_id: 99, task_id: 1 } })

    expect(invalidateUnreadTasksCount).toHaveBeenCalledWith(42)
    expect(invalidateUserTaskList).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect 2 failed (Cannot find module)**

```bash
npm run test:run -- src/hooks/useTaskRealtimeSync.test.js
```

- [ ] **Step 3: Implement `useTaskRealtimeSync.js`** with this exact content:

```js
import { useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUnreadTasksCount } from './useUnreadTasksCount.js'
import { invalidateUserTaskList } from './useTaskList.js'

/**
 * Subscribes to task_activity INSERT events via Supabase Realtime.
 * Filters server-side: actor_id != current user (skip own actions).
 * On event → invalidate unread counter + task list.
 *
 * Mount once per session (AppShell). Channel lives until userId changes
 * or component unmounts.
 *
 * @param {number|null} userId
 */
export function useTaskRealtimeSync(userId) {
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`task-activity-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity',
          filter: `actor_id=neq.${userId}`,
        },
        () => {
          invalidateUnreadTasksCount(userId)
          invalidateUserTaskList()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])
}
```

- [ ] **Step 4: Run tests — expect 2 passed**

```bash
npm run test:run -- src/hooks/useTaskRealtimeSync.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTaskRealtimeSync.js src/hooks/useTaskRealtimeSync.test.js
git commit -m "feat(hooks): add useTaskRealtimeSync (Supabase Realtime channel)"
```

---

## Task 4: AppShell mount + test mocks

**Files:**
- Modify: `src/components/shell/AppShell.jsx`
- Modify: `src/components/shell/AppShell.test.jsx`
- Modify: `src/components/shell/MobileShell.test.jsx` (if exists and mounts via AppShell flow)

- [ ] **Step 1: Read AppShell.jsx + tests**

```bash
cat src/components/shell/AppShell.jsx
grep -n "vi.mock\|useAuth" src/components/shell/AppShell.test.jsx | head -10
grep -n "vi.mock\|useAuth" src/components/shell/MobileShell.test.jsx | head -10
```

- [ ] **Step 2: Modify `AppShell.jsx`** — add useAuth + useTaskRealtimeSync call

В `src/components/shell/AppShell.jsx`:

Добавить импорты сверху (рядом с другими):
```jsx
import { useAuth } from '../../useAuth.jsx'
import { useTaskRealtimeSync } from '../../hooks/useTaskRealtimeSync.js'
```

В функции `AppShell()` добавить вызовы перед существующим `if (isMobile)`:
```jsx
export function AppShell() {
  const { user } = useAuth()
  useTaskRealtimeSync(user?.id ?? null)
  const isMobile = useIsMobile()
  // ...existing JSX
}
```

⚠ Если `useAuth` уже импортирован — не дублировать. Если `user` уже есть в scope — использовать.

- [ ] **Step 3: Update `AppShell.test.jsx`** — mock useTaskRealtimeSync

В `src/components/shell/AppShell.test.jsx` добавить mock рядом с другими `vi.mock(...)` вызовами (после imports, до describe):

```js
vi.mock('../../hooks/useTaskRealtimeSync.js', () => ({
  useTaskRealtimeSync: vi.fn(),
}))
```

⚠ Если AppShell.test.jsx уже mock'ает `useAuth` (вероятно да) — `user?.id` будет undefined → useTaskRealtimeSync(null) → no subscription. Mock optional, но добавим для безопасности (избегаем supabase channel call в test env).

- [ ] **Step 4: Update `MobileShell.test.jsx`** — same mock if needed

```bash
grep -n "AppShell" src/components/shell/MobileShell.test.jsx
```

If MobileShell tests render AppShell (or component imports useTaskRealtimeSync indirectly) — добавить тот же mock. Если нет — skip.

- [ ] **Step 5: Run tests + build**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
npm run build 2>&1 | tail -3
```

Expected: те же 19 pre-existing failures + 2 новых useTaskRealtimeSync passes (Task 3). Total: ~361 passes. Build clean.

⚠ Если AppShell tests или MobileShell tests появились новые failures — это значит mock не срабатывает (например, неправильный module path). Проверить.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/AppShell.jsx src/components/shell/AppShell.test.jsx \
        src/components/shell/MobileShell.test.jsx 2>/dev/null
git commit -m "feat(shell): AppShell mounts useTaskRealtimeSync (live counter + list updates)"
```

---

## Task 5: Manual smoke (preview)

**Files:** none.

- [ ] **Step 1: Deploy preview**

```bash
vercel
```

Expected: preview URL.

- [ ] **Step 2: Smoke сценарии (need 2 sessions — X в одном browser, Y во втором tab/incognito)**

- [ ] (a) **Setup:** X на `/tasks`, badge=0, list пустой/old. Y залогинен как другой user (admin/lead).
- [ ] (b) **Y создаёт task assigned to X:** в X-tab без refresh:
  - RailNav badge → 1 (≤1 sec latency)
  - В master-list появилась новая строка с unread dot
- [ ] (c) **X opens task:** counter → 0, dot пропадает.
- [ ] (d) **X на `/dashboard`:** Y создаёт ещё одну → X badge=1 в RailNav. Dashboard «Мои задачи» — 1 unread blue.
- [ ] (e) **Disconnect WiFi → reconnect:** Supabase realtime auto-reconnect. После reconnect события снова приходят.
- [ ] (f) **Свои действия не invalidate:** X создаёт task → no badge tick на X (server filter).
- [ ] (g) **Existing unread/dashboard scenarios** — без регрессов.

- [ ] **Step 3: Записать результаты**

Если регрессы — починить. Если ОК — Task 6.

---

## Task 6: Final + memory + PR + merge + deploy

**Files:**
- Modify: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_notifications_roadmap.md` — пометить item 1 как DONE
- Modify: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_task_unread_signal.md` — обновить «Out of scope» (realtime больше не deferred)

- [ ] **Step 1: Final test/build/lint**

```bash
npm run test:run
npm run build
npm run lint
```

Expected:
- Tests: те же 19 baseline failures + 2 новых useTaskRealtimeSync passes (~361 total).
- Build: clean.
- Lint: baseline (~77), без новых ошибок.

- [ ] **Step 2: Update memory `project_notifications_roadmap.md`**

Найти и заменить item 1 в order:
```
1. **Realtime in-app sync (Supabase channel).** ~30-50 LOC. ...
```
на:
```
1. ~~**Realtime in-app sync**~~ — DONE PR #<TBD>. Channel на task_activity, hook useTaskRealtimeSync mounted в AppShell, on event invalidate counter + task list. useTaskList subscriber pattern добавлен.
```

- [ ] **Step 3: Update memory `project_task_unread_signal.md`**

Найти секцию «Out of scope» и удалить line про realtime:
```
- Realtime push (Supabase channel) — counter обновляется только на mount + mutations через invalidate, не на live changes от других users.
```

Заменить «Status:» line на:
```
**Status:** DONE PR #69 + realtime sync PR #<TBD2>.
```

- [ ] **Step 4: Verify clean state**

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean, ~5 коммитов на ветке (migration + useTaskList + useTaskRealtimeSync + AppShell).

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/task-realtime-sync
```

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat(tasks): realtime sync — live counter + list updates via Supabase channel" --body "$(cat <<'EOF'
## Summary
Делает unread feature live — RailNav badge + master-list dot обновляются в realtime без refresh, через Supabase Realtime postgres_changes channel на task_activity.

## Migration 87
\`ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity;\` — без этого events не broadcast'ятся клиентам.

## Code
- \`useTaskList\` — расширен subscriber pattern (mirror useUnreadTasksCount): module-level subscribers Set + \`invalidateUserTaskList()\` exported fn + per-hook subscribe → re-fetch on bump.
- \`useTaskRealtimeSync(userId)\` — новый hook (~30 LOC): subscribes \`supabase.channel('task-activity-realtime-{userId}')\` с server-filter \`actor_id=neq.{userId}\`. На event invalidate counter + список. Cleanup на unmount/userId change.
- \`AppShell\` — mounts \`useTaskRealtimeSync(user?.id)\` (single subscription per session).

## Out of scope
- Realtime для других tables (tasks/clients/etc).
- Connection state UI indicator.
- Debounce burst events.
- Replay missed events.
- Push notifications (subplan #3 в notifications roadmap).

Spec: \`docs/superpowers/specs/2026-05-02-task-realtime-sync-design.md\`
Plan: \`docs/superpowers/plans/2026-05-02-task-realtime-sync.md\`

## Test plan
- [x] npm run test:run: 2 новых useTaskRealtimeSync passes; baseline 19 failures без изменений.
- [x] Build clean; lint baseline.
- [ ] Smoke (preview): X на /tasks, Y создаёт task → X RailNav badge → 1 (≤1s latency), dot в master-list. X opens task → counter=0. Свои действия не invalidate (server filter).
- [ ] Disconnect WiFi → reconnect: events снова приходят (Supabase auto-reconnect).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Update memory с реальным PR номером**

После `gh pr create` — заменить `PR #<TBD>` (notifications_roadmap) и `PR #<TBD2>` (task_unread_signal) на реальный номер.

- [ ] **Step 8: Switch gh user перед merge**

```bash
gh auth switch --user clubmonaco2017-ops
```

- [ ] **Step 9: Merge after approval**

```bash
gh pr merge <PR#> --squash --delete-branch
```

⚠ Если merge fails из-за worktree:
```bash
cd /Users/artemsaskin/Work/operator-dashboard && gh pr merge <PR#> --squash --delete-branch
```

- [ ] **Step 10: Cleanup worktree + sync main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git worktree remove .claude/worktrees/feat-task-realtime-sync
git branch -D feat/task-realtime-sync 2>/dev/null || true
git pull --ff-only
```

- [ ] **Step 11: Production deploy**

```bash
vercel --prod
```

---

## Self-review (после написания плана)

1. **Spec coverage:**
   - Goal 1 (migration 87) — Task 1.
   - Goal 2 (useTaskRealtimeSync hook) — Task 3.
   - Goal 3 (useTaskList subscriber pattern) — Task 2.
   - Goal 4 (mount в AppShell) — Task 4.
   - Goal 5 (server-side filter) — Task 3 hook + Task 1 verification.
   - Goal 6 (cleanup) — Task 3 (removeChannel в useEffect return).
   - Goal 7 (silent degradation) — implicit (если channel fail, no error throw, just no updates).

2. **Placeholder scan** — нет TBD/«implement later». PR # — TBD до `gh pr create`.

3. **Type / naming consistency:**
   - `useTaskRealtimeSync` — same name везде.
   - `invalidateUserTaskList` — same name в useTaskList export + useTaskRealtimeSync import.
   - `invalidateUnreadTasksCount` — existing fn, used корректно.
   - Channel name `task-activity-realtime-{userId}` — same в hook + test expectations.
   - Filter `actor_id=neq.${userId}` — same в hook + test.

4. **Out-of-scope чистота:** не трогаем `useUnreadTasksCount` (только import), не трогаем RPCs (Tasks 1 — только publication change), не добавляем realtime для других tables.

5. **Order dependencies:** Task 1 (migration) → Task 2 (useTaskList) + Task 3 (hook, depends on Task 2 export) → Task 4 (AppShell, mounts Task 3 hook). Linear.

6. **Tests are real:** subscribe + cleanup test verifies channel lifecycle. Event invalidation test verifies callback wiring. Both observable behavior, not mocks-only.

7. **Migration safety:** `ALTER PUBLICATION ADD TABLE` — non-destructive, no schema changes. Rollback: `ALTER PUBLICATION DROP TABLE` (in comment).
