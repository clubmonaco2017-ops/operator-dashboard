import { useTeamActivity } from '../../hooks/useTeamActivity.js'

/**
 * Таб «Активность» — пагинированный feed событий команды.
 */
export function TeamActivityTab({ callerId, teamId }) {
  const { rows, loading, loadingMore, error, loadMore } = useTeamActivity(callerId, teamId)

  if (loading && rows.length === 0) return <ListSkeleton />
  if (error) {
    return (
      <p className="text-sm text-[var(--danger-ink)]" role="alert">
        Ошибка: {error}
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="surface-card p-6 text-center text-sm italic text-[var(--fg4)]">
        Событий пока нет.
      </p>
    )
  }

  // Heuristic: page-size is 12; if last response was a full page, more may exist.
  const canLoadMore = rows.length > 0 && rows.length % 12 === 0

  return (
    <section className="surface-card p-4">
      <ul className="flex flex-col gap-3">
        {rows.map((evt) => (
          <li key={evt.id} className="flex items-start gap-2.5">
            <EventIcon type={evt.event_type} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-[var(--fg2)]">
                <span className="font-medium text-foreground">
                  {evt.actor_name || 'Система'}
                </span>{' '}
                {humanizeTeamEvent(evt.event_type, evt.payload)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--fg4)]">
                <time dateTime={evt.created_at}>{formatRelative(evt.created_at)}</time>
              </p>
            </div>
          </li>
        ))}
      </ul>
      {canLoadMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="btn-ghost text-xs px-3 py-1.5"
          >
            {loadingMore ? 'Загружаем…' : 'Показать ещё'}
          </button>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Humanize event types — Subplan 4 vocabulary
// ---------------------------------------------------------------------------

function humanizeTeamEvent(type, payload) {
  switch (type) {
    case 'team_created':
      return 'создал(а) команду'
    case 'team_renamed': {
      const from = payload?.from ?? payload?.old ?? payload?.before ?? null
      const to = payload?.to ?? payload?.new ?? payload?.after ?? null
      if (from && to) return `переименовал(а): «${from}» → «${to}»`
      if (to) return `переименовал(а) команду в «${to}»`
      return 'переименовал(а) команду'
    }
    case 'lead_changed':
      return 'сменил(а) лида'
    case 'member_added': {
      const op = payload?.operator_id
      return op != null ? `добавил(а) оператора #${op}` : 'добавил(а) оператора'
    }
    case 'member_removed': {
      const op = payload?.operator_id
      return op != null ? `убрал(а) оператора #${op}` : 'убрал(а) оператора'
    }
    case 'member_moved': {
      const from = payload?.from_team
      const to = payload?.to_team
      if (from != null && to != null) return `перевёл(а) оператора (#${from} → #${to})`
      return 'перевёл(а) оператора'
    }
    case 'clients_assigned': {
      const ids = Array.isArray(payload?.client_ids) ? payload.client_ids : []
      const n = ids.length
      if (n > 0) return `назначил(а) ${n} ${pluralRu(n, { one: 'клиента', few: 'клиентов', many: 'клиентов' })}`
      return 'назначил(а) клиентов'
    }
    case 'client_unassigned':
      return 'снял(а) клиента'
    case 'client_moved': {
      const from = payload?.from_team
      const to = payload?.to_team
      if (from != null && to != null) return `перевёл(а) клиента (#${from} → #${to})`
      return 'перевёл(а) клиента'
    }
    case 'team_archived': {
      const op = payload?.released_operators ?? 0
      const cl = payload?.released_clients ?? 0
      return `архивировал(а) команду — освобождено ${op} оп. и ${cl} кл.`
    }
    case 'team_restored':
      return 'восстановил(а) команду из архива'
    default:
      return type
  }
}

function pluralRu(n, forms) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms.one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few
  return forms.many
}

function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const min = Math.floor(diffMs / 60000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  if (hr < 24) return `${hr} ч назад`
  if (day < 7) return `${day} д назад`
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function EventIcon({ type }) {
  let kind = 'default'
  if (type === 'team_created' || type === 'team_restored') kind = 'create'
  else if (type === 'member_added' || type === 'member_removed' || type === 'member_moved' || type === 'lead_changed') {
    kind = 'member'
  } else if (
    type === 'clients_assigned' ||
    type === 'client_unassigned' ||
    type === 'client_moved'
  ) {
    kind = 'client'
  } else if (type === 'team_archived') kind = 'archive'

  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[var(--fg4)]">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        {kind === 'create' && (
          <path
            d="M3 6.5l2 2 4-5"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {kind === 'member' && (
          <>
            <circle cx="6" cy="4.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M2.5 10.5c.4-2 1.7-3 3.5-3s3.1 1 3.5 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </>
        )}
        {kind === 'client' && (
          <>
            <rect x="2" y="3" width="8" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" />
            <path d="M4 5.5h4M4 7.5h4M4 9h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </>
        )}
        {kind === 'archive' && (
          <>
            <path d="M2 4h8v6H2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4 6h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </>
        )}
        {kind === 'default' && (
          <circle cx="6" cy="6" r="1.4" fill="currentColor" />
        )}
      </svg>
    </span>
  )
}

function ListSkeleton() {
  return (
    <section className="surface-card p-4" aria-busy="true" aria-label="Загрузка активности">
      <ul className="flex flex-col gap-3">
        {[78, 56, 64, 70, 50].map((w, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/70" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
