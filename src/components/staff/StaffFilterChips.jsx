const ROLES = [
  { key: 'all',       label: 'Все' },
  { key: 'admin',     label: 'Админы' },
  { key: 'moderator', label: 'Модераторы' },
  { key: 'teamlead',  label: 'ТЛ' },
  { key: 'operator',  label: 'Операторы' },
]

export function StaffFilterChips({ counts, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map(({ key, label }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            data-active={active}
            onClick={() => onChange(key)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            ].join(' ')}
          >
            {label} · {counts[key] ?? 0}
          </button>
        )
      })}
    </div>
  )
}
