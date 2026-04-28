import { Link } from 'react-router-dom'
import { RoleBadge } from './RoleBadge.jsx'

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
      {row.avatar_url ? (
        <img
          src={row.avatar_url}
          alt=""
          className={[
            'h-9 w-9 shrink-0 rounded-full object-cover',
            archived && 'opacity-60',
          ].filter(Boolean).join(' ')}
        />
      ) : (
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
      )}

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
          <RoleBadge role={row.role} />
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.email}
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
