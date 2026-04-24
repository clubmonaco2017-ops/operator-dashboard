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
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            ].join(' ')}
          >
            {label} · {counts[key] ?? 0}
          </button>
        )
      })}
    </div>
  )
}
