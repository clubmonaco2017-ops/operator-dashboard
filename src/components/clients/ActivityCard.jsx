import { Plus, Archive, Image as ImageIcon, Pencil, FileText, RotateCcw } from 'lucide-react'
import { useClientActivity } from '../../hooks/useClientActivity.js'
import { pluralizeEvents } from '../../lib/clients.js'

/**
 * Карточка «Активность» в правой колонке Detail.
 */
export function ActivityCard({ callerId, clientId, totalLimit = 12 }) {
  const { rows, loading } = useClientActivity(callerId, clientId, totalLimit)

  return (
    <section className="surface-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="label-caps">Активность</h3>
        {rows.length > 0 && (
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline focus-ds rounded"
            onClick={() => alert('Полная история событий — Stage 8')}
          >
            Все {pluralizeEvents(rows.length)}
          </button>
        )}
      </header>

      {loading && rows.length === 0 ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <p className="text-xs text-[var(--fg4)]">Событий пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.slice(0, 4).map((evt) => (
            <li key={evt.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[var(--fg4)]">
                {eventIcon(evt.event_type)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-[var(--fg2)]">
                  <span className="font-medium text-foreground">
                    {evt.actor_name || 'Система'}
                  </span>{' '}
                  {humanizeEvent(evt.event_type, evt.payload)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--fg4)]">
                  <time dateTime={evt.created_at}>{formatRelative(evt.created_at)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function humanizeEvent(type, payload) {
  switch (type) {
    case 'created':
      return 'создал клиента'
    case 'updated_profile': {
      const fields = payload?.fields
      if (Array.isArray(fields) && fields.length > 0) {
        const map = { name: 'имя', alias: 'alias', avatar_url: 'аватар', platform_id: 'платформу', agency_id: 'агентство', tableau_id: 'Tableau ID' }
        const labels = fields.map((f) => map[f] || f).join(', ')
        return `обновил ${labels}`
      }
      return 'обновил профиль'
    }
    case 'updated_description':
      return 'обновил описание'
    case 'archived':
      return 'архивировал клиента'
    case 'restored':
      return 'восстановил клиента из архива'
    case 'media_uploaded': {
      const t = payload?.type === 'video' ? 'видео' : 'фото'
      return `загрузил ${t}${payload?.filename ? ` · ${payload.filename}` : ''}`
    }
    case 'media_deleted': {
      const t = payload?.type === 'video' ? 'видео' : 'фото'
      return `удалил ${t}${payload?.filename ? ` · ${payload.filename}` : ''}`
    }
    case 'media_reordered':
      return `изменил порядок ${payload?.type === 'video' ? 'видео' : 'фото'}`
    default:
      return type
  }
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

function eventIcon(type) {
  switch (type) {
    case 'created':
      return <Plus size={12} />
    case 'restored':
      return <RotateCcw size={12} />
    case 'archived':
      return <Archive size={12} />
    case 'media_uploaded':
    case 'media_deleted':
    case 'media_reordered':
      return <ImageIcon size={12} />
    case 'updated_profile':
    case 'updated_description':
      return <Pencil size={12} />
    default:
      return <FileText size={12} />
  }
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка активности">
      {[78, 56, 64].map((w, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}
