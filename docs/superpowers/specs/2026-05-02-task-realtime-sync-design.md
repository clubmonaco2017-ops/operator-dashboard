# Task Realtime Sync Design

**Date:** 2026-05-02
**Status:** Spec — awaiting user review

## Summary

Делает unread feature (предыдущий PR #69) **по-настоящему живым** — counter и master-list обновляются в realtime без refresh. Использует **Supabase Realtime postgres_changes channel** на таблице `task_activity`. Single subscription per user session, mounted в `AppShell`.

## Goals

1. Migration 87 — добавить `task_activity` table в `supabase_realtime` publication.
2. Новый hook `useTaskRealtimeSync(userId)` — subscribes channel, на event invalidate'ит counter + список.
3. Расширить `useTaskList` subscriber pattern (mirror `useUnreadTasksCount` / `useUserOverdueCount`) — `invalidateUserTaskList()` exported fn + module-level subscribers Set.
4. Mount `useTaskRealtimeSync(user?.id)` в `AppShell` — single subscription per session, lifecycle bound to AppShell.
5. Server-side filter `actor_id=neq.${userId}` — own events не приходят клиенту (efficiency + симметрия с client-side filter в RPC).
6. Cleanup на unmount — `supabase.removeChannel(channel)`.
7. Никаких визуальных регрессий — silent degradation если realtime недоступен.

## Non-goals

- Realtime для других tables (`tasks`, `task_reports`, `clients`, etc.) — `task_activity` покрывает все task events.
- Connection state UI indicator («live» dot) — silent OK для MVP.
- Debouncing burst events.
- Replay missed events после disconnect — counter invalidate на reconnect = source of truth.
- Push notifications (это subplan #3 в notifications roadmap).
- Realtime для detail panel (`useTask`) — open detail user сам уже видит свежие данные через `mark_task_seen` flow.

## Architecture

### Migration 87

```sql
BEGIN;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity;
COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'task_activity';
--   -- Expected: 1 row.
```

⚠ Если ALTER PUBLICATION fail в Studio (insufficient privileges) — fallback: использовать UI Studio → Database → Realtime → toggle на `task_activity`.

### `useTaskList` subscriber pattern

Сейчас `useTaskList` имеет `reloadKey` state + `reload()` callback (только для самого hook'а). Добавляем module-level pattern:

```js
const subscribers = new Set()

function notifyAll() {
  subscribers.forEach((cb) => {
    try { cb() } catch { /* ignore */ }
  })
}

export function invalidateUserTaskList() {
  notifyAll()
}
```

И в hook'е:
```js
const [version, setVersion] = useState(0)
useEffect(() => {
  const cb = () => setVersion(v => v + 1)
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}, [])
```

`version` добавляется в effect deps существующего fetch'а → re-fetch на invalidate.

### `useTaskRealtimeSync` hook

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

### Mount в AppShell

```jsx
import { useTaskRealtimeSync } from '../../hooks/useTaskRealtimeSync.js'
// ...
export function AppShell() {
  const { user } = useAuth()
  useTaskRealtimeSync(user?.id ?? null)
  // ...existing JSX
}
```

Одна subscription на весь app session, активна пока user logged in.

## File Plan

**Created:**
- `db/migrations/20260502_87_realtime_task_activity.sql` — ALTER PUBLICATION
- `src/hooks/useTaskRealtimeSync.js` (~30 LOC)
- `src/hooks/useTaskRealtimeSync.test.js` (~70 LOC, 2 it-blocks)

**Modified:**
- `src/hooks/useTaskList.js` — add module-level subscribers + `invalidateUserTaskList()` export + subscribe in hook
- `src/components/shell/AppShell.jsx` — call `useTaskRealtimeSync(user?.id)`
- `src/components/shell/AppShell.test.jsx` — mock `useTaskRealtimeSync` (и/или `supabase.channel`)
- `src/components/shell/MobileShell.test.jsx` — same mock if needed (MobileShell renders inside AppShell branch)

**Deleted:** ничего.

## Test Plan

### Unit (`useTaskRealtimeSync.test.js`, 2 it-blocks)

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
    supabase.channel.mockReturnValue(fakeChannel)
    on.mockReturnValue(fakeChannel)

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
    const on = vi.fn((_, __, cb) => {
      capturedCallback = cb
      return { subscribe: vi.fn().mockReturnThis(), on: vi.fn() }
    })
    supabase.channel.mockReturnValue({ on, subscribe: vi.fn().mockReturnThis() })

    renderHook(() => useTaskRealtimeSync(42))

    capturedCallback({ new: { actor_id: 99, task_id: 1 } })

    expect(invalidateUnreadTasksCount).toHaveBeenCalledWith(42)
    expect(invalidateUserTaskList).toHaveBeenCalled()
  })
})
```

### Existing tests
- `useTaskList.test.jsx` (если есть) — verify subscriber pattern не сломал existing behavior.
- `AppShell.test.jsx` — добавить mock `useTaskRealtimeSync` если рендер падает.

### Manual smoke (preview)

Need 2 browser sessions (X в incognito или второй tab):

1. **Setup:** X на `/tasks`, badge=0, list пустой/old.
2. **Y создаёт task assigned to X** — X-tab без refresh:
   - RailNav badge → 1 (≤1 sec latency)
   - В master-list появилась новая строка с unread dot
3. **X opens task** → counter → 0, dot пропадает.
4. **X на `/dashboard`:** Y создаёт ещё одну → X badge=1 в RailNav. Dashboard «Мои задачи» — 1 unread blue.
5. **Disconnect WiFi → reconnect:** Supabase realtime auto-reconnect. После reconnect события снова приходят.
6. **Свои действия не invalidate:** X создаёт task → no badge tick на X (server filter actor_id != X).
7. **Все остальные unread/dashboard scenarios** — без регрессов.

### Build / lint / test
- `npm run test:run` — те же 19 baseline failures + 2 новых useTaskRealtimeSync passes.
- `npm run build` — clean.
- `npm run lint` — без новых ошибок.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Supabase Realtime quotas (Free tier: 200 concurrent connections, 2M messages/month) | Project user count ~50. Quota не достигается. |
| Filter `actor_id=neq.${userId}` syntax issue | Single-column comparison поддержано. Verify в smoke — если fail, fallback client-side filter в callback. |
| ALTER PUBLICATION требует superuser | Через Supabase Studio SQL Editor работает (postgres role). Fallback: UI Studio toggle. |
| Channel reconnect race на rapid auth switch | Effect deps `[userId]` пересоздаёт channel на change → previous cleanup fires первым. OK. |
| Burst events → multiple parallel RPCs | Acceptable для MVP. Если станет проблемой — debounce 200ms в hook. |
| Realtime отключён в Supabase dashboard | По умолчанию включён в новых проектах. Verify в Studio. |
| Мock `supabase.channel` в tests — chainable .on().subscribe() pattern | Test уже учитывает chain. Smoke в test проверит. |
| If `task_activity` имеет `REPLICA IDENTITY DEFAULT` (только PK) — payload в realtime event может не содержать `actor_id` | Проверить в smoke. Если payload неполный — `ALTER TABLE task_activity REPLICA IDENTITY FULL` (отдельная миграция или включить в 87). |

## Verification checklist (per spec self-review)

- [x] Goals и non-goals явные.
- [x] Migration syntax корректный (`ALTER PUBLICATION ADD TABLE`).
- [x] `useTaskRealtimeSync` — single useEffect, deps `[userId]` корректно.
- [x] Server-side filter `actor_id=neq.${userId}` — Supabase Realtime supports column filters.
- [x] `useTaskList` subscriber pattern mirrors `useUnreadTasksCount` exactly.
- [x] AppShell mount — single subscription per session, no leak.
- [x] Tests cover subscribe + cleanup + event invalidation flow.
- [x] Risk про REPLICA IDENTITY зафиксирован — может потребовать дополнительный ALTER если payload incomplete.
- [x] Out-of-scope: realtime для других tables, UI indicator, debounce, replay — explicit.
