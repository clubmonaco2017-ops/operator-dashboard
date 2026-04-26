import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { Sidebar } from '../components/Sidebar.jsx'
import { useTaskList } from '../hooks/useTaskList.js'
import { hasPermission } from '../lib/permissions.js'
import { pluralizeTasks } from '../lib/tasks.js'

import { TaskBoxTabs } from '../components/tasks/TaskBoxTabs.jsx'
import { TaskFilterChips } from '../components/tasks/TaskFilterChips.jsx'
import { TaskList } from '../components/tasks/TaskList.jsx'
import { TaskEmptyZero } from '../components/tasks/EmptyZero.jsx'
import { TaskEmptyFilter } from '../components/tasks/EmptyFilter.jsx'
import { TaskDetailEmptyHint } from '../components/tasks/DetailEmptyHint.jsx'
import { CreateTaskSlideOut } from '../components/tasks/CreateTaskSlideOut.jsx'
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel.jsx'

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
    const day = (d) =>
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
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
  const { user, logout } = useAuth()
  const { taskId } = useParams()
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

  const detailIsOpen = !!taskId
  const showMasterOnNarrow = !detailIsOpen
  const showDetailOnNarrow = detailIsOpen

  const selectedId = useMemo(() => (taskId ? Number(taskId) : null), [taskId])
  const totalForTitle = displayRows.length

  function clearFilters() {
    setStatus(DEFAULT_STATUS)
    setDeadlineFilter(DEFAULT_DEADLINE)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex flex-1">
        {/* Master panel */}
        <section
          className={[
            'flex flex-col border-r border-border bg-card',
            isZeroEmpty || isFilterEmpty ? 'flex-1' : 'lg:w-[440px] lg:shrink-0',
            !isZeroEmpty && !isFilterEmpty && (showMasterOnNarrow ? 'flex-1 lg:flex-initial' : 'hidden lg:flex'),
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Список задач"
        >
          <header className="flex items-center gap-3 px-5 pt-5 pb-3">
            <h1 className="flex items-baseline gap-2 text-xl font-bold text-foreground">
              Задачи
              <span className="text-sm font-medium text-[var(--fg4)] tabular">
                {totalForTitle}
              </span>
            </h1>
            <div className="flex-1" />
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="btn-primary"
              >
                + Новая задача
              </button>
            )}
          </header>

          <div className="px-5 pb-3">
            <TaskBoxTabs box={box} hasViewAll={hasViewAll} />
          </div>

          <div className="px-5 pb-3">
            <SearchInput value={search} onChange={setSearch} />
          </div>

          {!isZeroEmpty && (
            <div className="px-5 pb-3">
              <TaskFilterChips
                status={status}
                deadlineFilter={deadlineFilter}
                onStatusChange={setStatus}
                onDeadlineChange={setDeadlineFilter}
              />
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {error ? (
              <div className="px-4 py-6 text-sm text-[var(--danger-ink)]" role="alert">
                Ошибка: {error}
              </div>
            ) : loading ? (
              <TaskListSkeleton />
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
              <TaskList
                rows={displayRows}
                selectedId={selectedId}
                basePath={basePath}
              />
            )}
          </div>

          {!loading && !error && displayRows.length > 0 && (
            <footer className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              <span className="tabular">{pluralizeTasks(displayRows.length)}</span>
            </footer>
          )}
        </section>

        {/* Detail panel */}
        {!(isZeroEmpty || isFilterEmpty) && (
          <section
            className={[
              'flex-1 overflow-hidden bg-card',
              showDetailOnNarrow ? 'flex' : 'hidden lg:flex',
            ].join(' ')}
            aria-label="Детали задачи"
          >
            {detailIsOpen ? (
              <TaskDetailPanel
                callerId={user?.id}
                user={user}
                taskId={selectedId}
                siblings={displayRows}
                onChanged={reload}
                onBack={() => navigate(basePath)}
                onDeleted={() => navigate(basePath)}
              />
            ) : (
              <TaskDetailEmptyHint />
            )}
          </section>
        )}
      </main>

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
    </div>
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

function SearchInput({ value, onChange }) {
  return (
    <label className="relative flex items-center">
      <SearchIcon />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по задаче, автору или исполнителю…"
        aria-label="Поиск задач"
        className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary focus-ds"
      />
    </label>
  )
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--fg4)]"
      viewBox="0 0 20 20"
      aria-hidden
    >
      <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
