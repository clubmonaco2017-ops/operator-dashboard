const OPTIONS = [
  { value: 'active',  label: 'Активные' },
  { value: 'archive', label: 'Архив' },
  { value: 'all',     label: 'Все' },
]

export function AgencyFilterChips({ value, onChange }) {
  return (
    <div role="radiogroup" className="flex flex-wrap items-center gap-1.5">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
