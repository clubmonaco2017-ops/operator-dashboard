import { Link } from 'react-router-dom'
import { initials, pluralizeFiles } from '../../lib/clients.js'

/**
 * Один элемент master-списка. Активный = vertical accent bar слева + bold name (D-3).
 * @param {object} props
 * @param {object} props.client — row из list_clients
 * @param {boolean} props.isActive — этот item открыт в detail
 */
export function ClientListItem({ client, isActive }) {
  const archived = !client.is_active
  const placement = client.platform_name || ''
  const placementWithAgency = client.agency_name ? `${placement} · ${client.agency_name}` : placement || '—'
  return (
    <Link
      to={`/clients/${client.id}`}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2 focus-ds',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
      aria-current={isActive ? 'true' : undefined}
    >
      <Avatar name={client.name} url={client.avatar_url} muted={archived} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            title={client.name}
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
            {client.name}
          </span>
          {archived && (
            <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Архив
            </span>
          )}
          {client.alias && (
            <span
              title={client.alias}
              className="ml-auto truncate font-mono text-xs text-[var(--fg4)]"
            >
              {client.alias}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden />
          <span className="truncate" title={placementWithAgency}>
            {placementWithAgency}
          </span>
        </div>
      </div>

      {client.files_count > 0 && (
        <span
          className="shrink-0 text-xs text-[var(--fg4)] tabular"
          title={pluralizeFiles(client.files_count)}
          aria-label={pluralizeFiles(client.files_count)}
        >
          {client.files_count}
        </span>
      )}
    </Link>
  )
}

function Avatar({ name, url, muted }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={['h-9 w-9 shrink-0 rounded-full object-cover', muted && 'opacity-60'].filter(Boolean).join(' ')}
      />
    )
  }
  return (
    <div
      className={[
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground',
        muted && 'opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}
