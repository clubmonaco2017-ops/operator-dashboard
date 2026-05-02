import { Link } from 'react-router-dom'

/**
 * Single row in master-list. Mirror AgencyListItem visual:
 * round avatar 36px (logo с initial fallback) + name + contacts subtitle.
 * Active = vertical primary accent bar + bg-muted.
 */
export function PlatformListItem({ platform, isActive }) {
  const initial = platform.name?.[0]?.toUpperCase() ?? '?'
  const contactsLabel = formatContacts(platform.contacts)

  return (
    <Link
      to={`/admin/platforms/${platform.id}`}
      aria-current={isActive ? 'true' : undefined}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
    >
      {platform.logo_url ? (
        <img
          src={platform.logo_url}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full bg-muted object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {platform.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{contactsLabel}</p>
      </div>
    </Link>
  )
}

function formatContacts(contacts) {
  const n = Array.isArray(contacts) ? contacts.length : 0
  return pluralize(n, 'контакт', 'контакта', 'контактов')
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
