import { useEffect, useMemo, useState } from 'react'
import {
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { useTaskList } from '../hooks/useTaskList.js'
import { hasPermission } from '../lib/permissions.js'

import { TaskBoxTabs } from '../components/tasks/TaskBoxTabs.jsx'
import { TaskFilterChips } from '../components/tasks/TaskFilterChips.jsx'
import { TaskList } from '../components/tasks/TaskList.jsx'
import { TaskEmptyZero } from '../components/tasks/EmptyZero.jsx'
import { TaskEmptyFilter } from '../components/tasks/EmptyFilter.jsx'
import { TaskDetailEmptyHint } from '../components/tasks/DetailEmptyHint.jsx'
import { CreateTaskSlideOut } from '../components/tasks/CreateTaskSlideOut.jsx'
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel.jsx'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'

const DEFAULT_STATUS = 'all'
const DEFAULT_DEADLINE = 'all'

function deriveBoxFromPath(pathname) {
  if (pathname.startsWith('/tasks/outbox')) return 'outbox'
  if (pathname.startsWith('/tasks/all')) return 'all'
  return 'inbox'
}

function basePathForBox(box) {
  if (box === 'outbox') return '/tasks/outbox'
  if (box === 'all') return '/tasks/all'
  return '/tasks'
}

function applyDeadlineFilter(rows, filter, now = new Date()) {
  if (filter === 'all') return rows
  if (filter === 'overdue') {
    return rows.filter((r) => (r.effective_status || r.status) === 'overdue')
  }
  if (filter === 'today') {
    const day = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const todayKey = day(now)
    return rows.filter((r) => {
      if (!r.deadline) return false
      const d = new Date(r.deadline)
      if (Number.isNaN(d.getTime())) return false
      return day(d) === todayKey
    })
  }
  if (filter === 'week') {
    const cutoff = new Date(now.getTime() + 7 * 86400000)
    return rows.filter((r) => {
      if (!r.deadline) return false
      const d = new Date(r.deadline)
      if (Number.isNaN(d.getTime())) return false
      return d.getTime() >= now.getTime() && d.getTime() <= cutoff.getTime()
    })
  }
  return rows
}

export function TaskListPage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const box = deriveBoxFromPath(location.pathname)
  const basePath = basePathForBox(box)

  const [status, setStatus] = useState(DEFAULT_STATUS)
  const [deadlineFilter, setDeadlineFilter] = useState(DEFAULT_DEADLINE)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const canCreate = hasPermission(user, 'create_tasks')
  const hasViewAll = hasPermission(user, 'view_all_tasks')

  const { rows, loading, error, reload } = useTaskList(user?.id, {
    box,
    status,
    search,
  })

  const displayRows = useMemo(
    () => applyDeadlineFilter(rows, deadlineFilter),
    [rows, deadlineFilter],
  )

  const hasSearch = search.trim().length > 0
  const hasFilter = status !== DEFAULT_STATUS || deadlineFilter !== DEFAULT_DEADLINE
  const isEmpty = !loading && !error && displayRows.length === 0
  const isZeroEmpty = isEmpty && !hasSearch && !hasFilter
  const isFilterEmpty = isEmpty && (hasSearch || hasFilter)

  // selectedId is read inside TaskDetailRoute via useParams; here we use the
  // outermost taskId to keep <TaskList> highlight in sync.
  const taskIdParam = useParams().taskId
  const selectedId = taskIdParam ? Number(taskIdParam) : null
  const totalForTitle = displayRows.length

  function clearFilters() {
    setStatus(DEFAULT_STATUS)
    setDeadlineFilter(DEFAULT_DEADLINE)
  }

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Задачи
      <span className="text-xs font-medium text-[var(--fg4)] tabular">
        {totalForTitle}
      </span>
    </span>
  )

  const createButtonNode = canCreate ? (
    <button
      type="button"
      onClick={() => setCreateOpen(true)}
      className="btn-primary text-xs px-2.5 py-1.5"
    >
      + Новая
    </button>
  ) : null

  const searchNode = (
    <SearchInput
      placeholder="Поиск по задаче, автору или исполнителю…"
      value={search}
      onChange={setSearch}
      ariaLabel="Поиск задач"
    />
  )

  const filtersNode = (
    <div className="flex flex-col gap-3">
      <TaskBoxTabs box={box} hasViewAll={hasViewAll} />
      {!isZeroEmpty && (
        <TaskFilterChips
          status={status}
          deadlineFilter={deadlineFilter}
          onStatusChange={setStatus}
          onDeadlineChange={setDeadlineFilter}
        />
      )}
    </div>
  )

  const listBody = error ? (
    <div className="px-4 py-6 text-sm text-[var(--danger-ink)]" role="alert">
      Ошибка: {error}
    </div>
  ) : loading ? (
    <TaskListSkeletonWithSlowHint />
  ) : isZeroEmpty ? (
    <TaskEmptyZero
      box={box}
      canCreate={canCreate}
      onCreate={() => setCreateOpen(true)}
    />
  ) : isFilterEmpty ? (
    <TaskEmptyFilter
      hasSearch={hasSearch}
      hasFilter={hasFilter}
      onClearSearch={() => setSearch('')}
      onClearFilters={clearFilters}
    />
  ) : (
    <TaskList rows={displayRows} selectedId={selectedId} basePath={basePath} />
  )

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={titleNode}
            search={searchNode}
            filters={filtersNode}
            createButton={createButtonNode}
          >
            {listBody}
          </ListPane>
        }
      >
        <Outlet
          context={{
            rows: displayRows,
            reload,
            callerId: user?.id,
            user,
            box,
            basePath,
          }}
        />
      </MasterDetailLayout>

      {createOpen && (
        <CreateTaskSlideOut
          callerId={user?.id}
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => {
            setCreateOpen(false)
            reload()
            if (newId) navigate(`${basePath}/${newId}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — shows the empty hint when no task is selected.
export function TaskDetailEmpty() {
  return <TaskDetailEmptyHint />
}

// Detail child route — pulls taskId from URL and shared data from outlet context.
export function TaskDetailRoute() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const { rows, reload, callerId, user, basePath } = useOutletContext()
  return (
    <TaskDetailPanel
      callerId={callerId}
      user={user}
      taskId={Number(taskId)}
      siblings={rows}
      onChanged={reload}
      onBack={() => navigate(basePath)}
      onDeleted={() => navigate(basePath)}
    />
  )
}

// ---------------------------------------------------------------------------
// Skeleton + search
// ---------------------------------------------------------------------------

function TaskListSkeleton() {
  const widths = [70, 60, 80, 55, 65, 50]
  return (
    <ul
      className="flex flex-col py-1"
      aria-busy="true"
      aria-label="Загрузка списка задач"
    >
      {widths.map((w, i) => (
        <li
          key={i}
          className="flex items-start gap-3 border-l-2 border-l-transparent px-4 py-2.5"
        >
          <div className="mt-0.5 h-4 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 animate-pulse rounded bg-muted"
              style={{ width: `${w}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded bg-muted/70"
              style={{ width: `${Math.max(28, w - 18)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function TaskListSkeletonWithSlowHint() {
  // 8.C: после 2 сек показываем «Загружается …» — даём пользователю понять,
  // что система не зависла.
  const slow = useSlowFlag(2000)
  return (
    <>
      {slow && (
        <p
          className="px-5 pt-3 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Загружается список задач…
        </p>
      )}
      <TaskListSkeleton />
    </>
  )
}

function useSlowFlag(thresholdMs) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), thresholdMs)
    return () => clearTimeout(t)
  }, [thresholdMs])
  return slow
}

