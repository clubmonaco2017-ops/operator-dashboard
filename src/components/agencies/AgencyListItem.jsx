import { Link } from 'react-router-dom'

/**
 * Single row in master-list. Mirror TeamListItem visual:
 * round avatar 36px (initials) + name + platform subtitle + counters line.
 * Active = vertical primary accent bar + bg-muted.
 * Archived = muted opacity throughout.
 */
export function AgencyListItem({ agency, isActive }) {
  const archived = !agency.is_active
  const initial = agency.name?.[0]?.toUpperCase() ?? '?'
  const counters = formatCounters(agency)

  return (
    <Link
      to={`/admin/agencies/${agency.id}`}
      aria-current={isActive ? 'true' : undefined}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
    >
      {agency.logo_url ? (
        <img
          src={agency.logo_url}
          alt=""
          className={[
            'h-9 w-9 shrink-0 rounded-full bg-muted object-cover',
            archived && 'opacity-60',
          ].filter(Boolean).join(' ')}
        />
      ) : (
        <div
          className={[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary',
            archived && 'opacity-60',
          ].filter(Boolean).join(' ')}
        >
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={[
            'truncate text-sm font-medium',
            archived ? 'text-muted-foreground' : 'text-foreground',
          ].join(' ')}
        >
          {agency.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {agency.platform_name ?? '—'}
        </p>
        <p className="truncate text-xs text-muted-foreground/80">{counters}</p>
      </div>
    </Link>
  )
}

function formatCounters(a) {
  const parts = [
    pluralize(a.user_count ?? 0, 'сотрудник', 'сотрудника', 'сотрудников'),
    pluralize(a.client_count ?? 0, 'клиент', 'клиента', 'клиентов'),
    pluralize(a.team_count ?? 0, 'команда', 'команды', 'команд'),
  ]
  return parts.join(' · ')
}

function pluralize(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  let form
  if (m100 >= 11 && m100 <= 14) form = many
  else if (m10 === 1) form = one
  else if (m10 >= 2 && m10 <= 4) form = few
  else form = many
  return `${n} ${form}`
}
