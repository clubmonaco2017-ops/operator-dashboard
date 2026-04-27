import { Link } from 'react-router-dom'

const ROLE_BADGE_COLOR = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const ROLE_LABEL = {
  superadmin: 'СА',
  admin:      'Адм',
  moderator:  'Мод',
  teamlead:   'ТЛ',
  operator:   'ОП',
}

// Намеренное DS-исключение: 5-цветная палитра ролей сохранена через прямые
// Tailwind utility-классы. Устойчивая визуальная семантика > чистота DS.
// См. spec §1 «Out of scope — 5-color role-badge palette».

function initialsOf(firstName, lastName) {
  return (
    (firstName?.[0] ?? '').toUpperCase() + (lastName?.[0] ?? '').toUpperCase()
  )
}

export function StaffListItem({ row, isActive }) {
  const archived = !row.is_active
  const initials = initialsOf(row.first_name, row.last_name) || '?'
  return (
    <Link
      to={`/staff/${encodeURIComponent(row.ref_code)}`}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
      aria-current={isActive ? 'true' : undefined}
    >
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          archived
            ? 'bg-muted text-muted-foreground/60'
            : 'bg-muted text-muted-foreground',
        ].join(' ')}
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            title={`${row.first_name} ${row.last_name}`.trim()}
            className={[
              'truncate text-sm',
              isActive
                ? 'font-semibold text-foreground'
                : 'font-medium text-[var(--fg2)]',
              archived && 'opacity-60',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {row.first_name} {row.last_name}
          </span>
          <span
            className={[
              'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
              ROLE_BADGE_COLOR[row.role] ?? 'bg-muted text-muted-foreground',
            ].join(' ')}
          >
            {ROLE_LABEL[row.role] ?? row.role}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{row.email}</span>
          <span className="font-mono text-[var(--fg4)]">{row.ref_code}</span>
        </div>
      </div>

      <span
        className={[
          'h-2 w-2 shrink-0 rounded-full',
          row.is_active ? 'bg-emerald-500' : 'bg-muted-foreground',
        ].join(' ')}
        aria-label={row.is_active ? 'Активен' : 'Неактивен'}
      />
    </Link>
  )
}
