const ROLE_BADGE_COLOR = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const ROLE_LABEL_SHORT = {
  superadmin: 'СА',
  admin:      'Адм',
  moderator:  'Мод',
  teamlead:   'ТЛ',
  operator:   'ОП',
}

// Намеренное DS-исключение: 5-цветная палитра ролей сохранена через прямые
// Tailwind utility-классы. Устойчивая визуальная семантика > чистота DS.

export function RoleBadge({ role, className = '' }) {
  if (!role) return null
  const colorClass = ROLE_BADGE_COLOR[role] ?? 'bg-muted text-muted-foreground'
  const label = ROLE_LABEL_SHORT[role] ?? role
  return (
    <span
      className={[
        'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
        colorClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  )
}
