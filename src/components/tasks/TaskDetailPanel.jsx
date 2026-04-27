import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient.js'
import { useTask } from '../../hooks/useTask.js'
import { useTaskActions } from '../../hooks/useTaskActions.js'
import {
  canCancelTask,
  canDeleteTask,
  canSubmitReport,
  canTakeInProgress,
  formatDeadlineRelative,
} from '../../lib/tasks.js'
import { TaskDescriptionCard } from './TaskDescriptionCard.jsx'
import { TaskFieldsCard } from './TaskFieldsCard.jsx'
import { TaskReportCard } from './TaskReportCard.jsx'
import { TaskActivityCard } from './TaskActivityCard.jsx'
import { CancelTaskConfirmDialog } from './CancelTaskConfirmDialog.jsx'
import { DeleteTaskConfirmDialog } from './DeleteTaskConfirmDialog.jsx'
import { Button } from '@/components/ui/button.jsx'

/**
 * Detail-панель открытой задачи (Subplan 5 Stage 7).
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {object} props.user
 * @param {number} props.taskId
 * @param {Array}  props.siblings — массив задач из master (для pagination)
 * @param {function} props.onChanged — reload master
 * @param {function} props.onBack
 * @param {function} props.onDeleted — после удаления
 */
export function TaskDetailPanel({
  callerId,
  user,
  taskId,
  siblings = [],
  onChanged,
  onBack,
  onDeleted,
}) {
  const navigate = useNavigate()
  const { row, loading, error, reload } = useTask(callerId, taskId)
  const actions = useTaskActions(callerId)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  // Reset dialogs on task change
  useEffect(() => {
    setCancelOpen(false)
    setDeleteOpen(false)
  }, [taskId])

  const { prev, next, position } = useMemo(() => {
    if (!siblings.length || !taskId) return { prev: null, next: null, position: 0 }
    const id = Number(taskId)
    const idx = siblings.findIndex((t) => t.id === id)
    return {
      prev: idx > 0 ? siblings[idx - 1] : null,
      next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
      position: idx >= 0 ? idx + 1 : 0,
    }
  }, [siblings, taskId])

  function bothChanged() {
    reload()
    onChanged?.()
  }

  async function handleTakeInProgress() {
    if (!row || actionBusy) return
    setActionBusy(true)
    try {
      await actions.takeInProgress(row.id)
      bothChanged()
    } catch (e) {
      alert(`Не удалось взять в работу: ${e.message}`)
    } finally {
      setActionBusy(false)
    }
  }

  function scrollToReport() {
    const el = document.getElementById('task-report')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleCancelConfirmed() {
    if (!row) return
    setActionBusy(true)
    try {
      await actions.cancelTask(row.id)
      setCancelOpen(false)
      bothChanged()
    } catch (e) {
      alert(`Не удалось отменить: ${e.message}`)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!row) return
    setActionBusy(true)
    try {
      const result = await actions.deleteTask(row.id)
      const paths = Array.isArray(result?.media_paths) ? result.media_paths : []
      if (paths.length > 0) {
        try {
          await supabase.storage.from('task-reports').remove(paths)
        } catch (e) {
          // Storage cleanup best-effort — DB row уже удалён.
          console.warn('Storage cleanup failed', e)
        }
      }
      setDeleteOpen(false)
      onChanged?.()
      onDeleted?.()
    } catch (e) {
      alert(`Не удалось удалить: ${e.message}`)
      setActionBusy(false)
    }
  }

  if (loading && !row) return <TaskDetailSkeletonWithSlowHint />
  if (error) {
    return (
      <div className="px-6 py-10" role="alert" aria-live="assertive">
        <p className="text-sm text-[var(--danger-ink)]">Ошибка: {error}</p>
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate('/tasks'))}
          className="mt-3 text-sm text-primary hover:underline rounded"
        >
          ← К списку
        </button>
      </div>
    )
  }
  if (!row) return null

  const status = row.effective_status || row.status
  const cancelled = status === 'cancelled'
  const deadlineLabel = formatDeadlineRelative(row.deadline)
  const showTake = canTakeInProgress(user, row)
  const showSubmitJump = canSubmitReport(user, row)
  const showCancel = canCancelTask(user, row)
  const showDelete = canDeleteTask(user) && ['done', 'cancelled'].includes(row.status)

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
        <nav
          className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
          aria-label="Хлебные крошки"
        >
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate('/tasks'))}
            className="rounded hover:text-foreground"
            aria-label="Вернуться к списку задач"
          >
            <span className="lg:hidden">← Список</span>
            <span className="hidden lg:inline">Задачи</span>
          </button>
          <span className="hidden lg:inline" aria-hidden>›</span>
          <span
            className="hidden truncate font-medium text-foreground lg:inline"
            title={row.title}
          >
            {row.title}
          </span>
        </nav>
        {siblings.length > 0 && position > 0 && (
          <Pagination
            position={position}
            total={siblings.length}
            prev={prev}
            next={next}
            onGo={(t) => navigate(`/tasks/${t.id}`)}
          />
        )}
      </div>

      {/* Header */}
      <header className="px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1
            className={[
              'truncate text-xl font-bold text-foreground',
              cancelled && 'line-through opacity-70',
            ]
              .filter(Boolean)
              .join(' ')}
            title={row.title}
          >
            {row.title}
          </h1>
          <StatusPill status={status} />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          От{' '}
          <span className="font-medium text-foreground">
            {row.created_by_name ?? '—'}
          </span>{' '}
          · Исполнитель{' '}
          <span className="font-medium text-foreground">
            {row.assigned_to_name ?? '—'}
          </span>
          {deadlineLabel && (
            <>
              {' '}· Дедлайн{' '}
              <span className="font-medium text-foreground">{deadlineLabel}</span>
            </>
          )}
        </p>

        {(showTake || showSubmitJump || showCancel || showDelete) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {showTake && (
              <Button
                type="button"
                onClick={handleTakeInProgress}
                disabled={actionBusy || actions.mutating}
              >
                {actionBusy ? 'Берём…' : 'Взял в работу'}
              </Button>
            )}
            {showSubmitJump && (
              <Button
                type="button"
                onClick={scrollToReport}
              >
                К отчёту
              </Button>
            )}
            {showCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCancelOpen(true)}
                disabled={actionBusy || actions.mutating}
                className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
              >
                Отменить задачу
              </Button>
            )}
            {showDelete && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                disabled={actionBusy || actions.mutating}
                className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
              >
                Удалить задачу
              </Button>
            )}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto bg-background px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <TaskDescriptionCard
            callerId={callerId}
            user={user}
            task={row}
            onChanged={bothChanged}
          />
          <TaskFieldsCard
            callerId={callerId}
            user={user}
            task={row}
            onChanged={bothChanged}
          />
          <TaskReportCard
            callerId={callerId}
            user={user}
            task={row}
            onChanged={bothChanged}
          />
          <TaskActivityCard activity={row.activity || []} />
        </div>
      </div>

      {cancelOpen && (
        <CancelTaskConfirmDialog
          taskTitle={row.title}
          busy={actionBusy}
          onCancel={() => setCancelOpen(false)}
          onConfirm={handleCancelConfirmed}
        />
      )}

      {deleteOpen && (
        <DeleteTaskConfirmDialog
          taskTitle={row.title}
          mediaCount={Array.isArray(row.report?.media) ? row.report.media.length : 0}
          busy={actionBusy}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

const STATUS_LABELS = {
  pending: 'В ожидании',
  in_progress: 'В работе',
  done: 'Завершена',
  overdue: 'Просрочена',
  cancelled: 'Отменена',
}

function statusPillClasses(status) {
  switch (status) {
    case 'in_progress':
      return 'bg-[var(--primary-soft)] text-[var(--primary-ink)]'
    case 'done':
      return 'bg-[var(--success-soft)] text-[var(--success-ink)]'
    case 'overdue':
      return 'bg-[var(--danger-soft)] text-[var(--danger-ink)]'
    case 'cancelled':
      return 'bg-muted text-muted-foreground'
    case 'pending':
    default:
      return 'bg-muted text-[var(--fg2)]'
  }
}

function StatusPill({ status }) {
  const label = STATUS_LABELS[status] ?? status
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        statusPillClasses(status),
      ].join(' ')}
      title={label}
    >
      {label}
    </span>
  )
}

function Pagination({ position, total, prev, next, onGo }) {
  return (
    <div
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      role="group"
      aria-label="Навигация по задачам"
    >
      <button
        type="button"
        onClick={() => prev && onGo(prev)}
        disabled={!prev}
        title={prev ? prev.title : 'Это первая задача'}
        aria-label={prev ? `Предыдущая: ${prev.title}` : 'Предыдущая — недоступно'}
        className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-40"
      >
        ‹
      </button>
      <span
        className="px-1 font-mono tabular"
        aria-label={`Позиция ${position} из ${total}`}
      >
        {position}/{total}
      </span>
      <button
        type="button"
        onClick={() => next && onGo(next)}
        disabled={!next}
        title={next ? next.title : 'Это последняя задача'}
        aria-label={next ? `Следующая: ${next.title}` : 'Следующая — недоступно'}
        className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-40"
      >
        ›
      </button>
    </div>
  )
}

function TaskDetailSkeleton() {
  return (
    <div
      className="flex h-full w-full flex-col"
      aria-busy="true"
      aria-label="Загрузка задачи"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      </div>
      {/* Header */}
      <header className="px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="h-7 w-3/5 animate-pulse rounded bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted/70" />
        {/* Action row */}
        <div className="mt-4 flex gap-2">
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </header>
      {/* Body cards */}
      <div className="flex-1 overflow-hidden bg-background px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="surface-card h-32 animate-pulse" />
          <div className="surface-card h-40 animate-pulse" />
          <div className="surface-card h-48 animate-pulse" />
          <div className="surface-card h-32 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function TaskDetailSkeletonWithSlowHint() {
  // 8.C: после 2 сек показываем «Загружается …» — даём пользователю понять,
  // что система не зависла.
  const slow = useSlowFlag(2000)
  return (
    <>
      {slow && (
        <p
          className="px-6 pt-3 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Загружается задача…
        </p>
      )}
      <TaskDetailSkeleton />
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
