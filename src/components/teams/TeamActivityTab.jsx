import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Crown,
  Link as LinkIcon,
  Pencil,
  Plus,
  Unlink,
  UserMinus,
  UserPlus,
} from 'lucide-react'
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
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[var(--fg4)]">
              {eventIcon(evt.event_type)}
            </span>
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

function eventIcon(type) {
  switch (type) {
    case 'team_created':
      return <Plus size={12} aria-hidden />
    case 'team_renamed':
      return <Pencil size={12} aria-hidden />
    case 'lead_changed':
      return <Crown size={12} aria-hidden />
    case 'member_added':
      return <UserPlus size={12} aria-hidden />
    case 'member_removed':
      return <UserMinus size={12} aria-hidden />
    case 'member_moved':
      return <ArrowLeftRight size={12} aria-hidden />
    case 'clients_assigned':
      return <LinkIcon size={12} aria-hidden />
    case 'client_unassigned':
      return <Unlink size={12} aria-hidden />
    case 'client_moved':
      return <ArrowLeftRight size={12} aria-hidden />
    case 'team_archived':
      return <Archive size={12} aria-hidden />
    case 'team_restored':
      return <ArchiveRestore size={12} aria-hidden />
    default:
      return <Activity size={12} aria-hidden />
  }
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
