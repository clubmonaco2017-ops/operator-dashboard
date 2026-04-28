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
      return 'border border-border bg-muted text-muted-foreground'
    case 'pending':
    default:
      return 'border border-border bg-muted text-[var(--fg2)]'
  }
}

export function StatusPill({ status }) {
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
