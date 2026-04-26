/**
 * Filter chips для master-списка задач: статус + срок.
 *
 * Status фильтр уходит в RPC (server-side). Deadline filter — client-side
 * (фильтрация displayRows в TaskListPage).
 *
 * @param {object} props
 * @param {'all'|'pending'|'in_progress'|'done'|'overdue'|'cancelled'} props.status
 * @param {'all'|'today'|'week'|'overdue'} props.deadlineFilter
 * @param {(s:string)=>void} props.onStatusChange
 * @param {(d:string)=>void} props.onDeadlineChange
 */
export function TaskFilterChips({
  status,
  deadlineFilter,
  onStatusChange,
  onDeadlineChange,
}) {
  const statusOptions = [
    { key: 'all', label: 'Все' },
    { key: 'pending', label: 'В ожидании' },
    { key: 'in_progress', label: 'В работе' },
    { key: 'done', label: 'Завершена' },
    { key: 'overdue', label: 'Просрочена' },
    { key: 'cancelled', label: 'Отменена' },
  ]
  const deadlineOptions = [
    { key: 'all', label: 'Все' },
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'Эта неделя' },
    { key: 'overdue', label: 'Просроченные' },
  ]

  return (
    <div className="space-y-2">
      <ChipRow ariaLabel="Фильтр по статусу">
        {statusOptions.map((opt) => (
          <Chip
            key={opt.key}
            active={status === opt.key}
            onClick={() => onStatusChange(opt.key)}
          >
            {opt.label}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow ariaLabel="Фильтр по сроку">
        <span className="mr-1 label-caps text-[var(--fg4)]">Срок:</span>
        {deadlineOptions.map((opt) => (
          <Chip
            key={opt.key}
            active={deadlineFilter === opt.key}
            onClick={() => onDeadlineChange(opt.key)}
          >
            {opt.label}
          </Chip>
        ))}
      </ChipRow>
    </div>
  )
}

function ChipRow({ children, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1.5"
    >
      {children}
    </div>
  )
}

function Chip({ children, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors outline-none',
        active
          ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-ink)]'
          : 'border-border text-[var(--fg2)] hover:border-border-strong',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
