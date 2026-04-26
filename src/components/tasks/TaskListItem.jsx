import { Link } from 'react-router-dom'
import { formatDeadlineRelative } from '../../lib/tasks.js'

/**
 * Один элемент master-списка задач. Активный = vertical accent bar слева + bold title.
 *
 * @param {object} props
 * @param {object} props.task — row из list_tasks (с computed effective_status)
 * @param {boolean} props.isActive
 * @param {string} props.basePath — '/tasks' | '/tasks/outbox' | '/tasks/all'
 */
export function TaskListItem({ task, isActive, basePath }) {
  const status = task.effective_status || task.status
  const cancelled = status === 'cancelled'
  const deadlineLabel = formatDeadlineRelative(task.deadline)

  const metaLine = [
    `От ${task.created_by_name ?? '—'}`,
    `→ ${task.assigned_to_name ?? '—'}`,
    deadlineLabel ? `· ${deadlineLabel}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Link
      to={`${basePath}/${task.id}`}
      className={[
        'group relative flex items-start gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
      aria-current={isActive ? 'true' : undefined}
    >
      <StatusPill status={status} />
      <div className="min-w-0 flex-1">
        <div
          title={task.title}
          className={[
            'truncate text-sm',
            isActive
              ? 'font-semibold text-foreground'
              : 'font-medium text-[var(--fg2)]',
            cancelled && 'line-through opacity-70',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {task.title}
        </div>
        <div
          className="mt-0.5 truncate text-xs text-muted-foreground"
          title={metaLine}
        >
          {metaLine}
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Status pill — 5 цветов, все на DS-токенах
// ---------------------------------------------------------------------------

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
        'mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        statusPillClasses(status),
      ].join(' ')}
      title={label}
    >
      {label}
    </span>
  )
}
