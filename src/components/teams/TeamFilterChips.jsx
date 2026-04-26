/**
 * Filter chips для master-списка команд. Простая 3-state селекция активности.
 *
 * @param {object} props
 * @param {'active'|'archived'|'all'} props.value
 * @param {function} props.onChange — (next) => void
 */
export function TeamFilterChips({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Фильтр по активности">
      <Chip active={value === 'all'} onClick={() => onChange('all')}>
        Все
      </Chip>
      <Chip active={value === 'active'} onClick={() => onChange('active')}>
        Активные
      </Chip>
      <Chip active={value === 'archived'} onClick={() => onChange('archived')}>
        Архив
      </Chip>
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
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors outline-none',
        active
          ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-ink)]'
          : 'border-border text-[var(--fg2)] hover:border-border-strong',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
