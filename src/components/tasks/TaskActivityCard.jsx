import {
  Ban,
  Calendar,
  CheckCircle2,
  FileText,
  Pencil,
  PlayCircle,
  Plus,
  UserCog,
} from 'lucide-react'

/**
 * Карточка «История» в TaskDetailPanel.
 * Читает activity (last-12) напрямую из task.activity payload (loaded by useTask).
 */
export function TaskActivityCard({ activity = [] }) {
  return (
    <section className="surface-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="label-caps">История</h3>
      </header>
      {activity.length === 0 ? (
        <p className="text-xs italic text-[var(--fg4)]">Событий пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {activity.map((evt) => (
            <li key={evt.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[var(--fg4)]">
                {eventIcon(evt.event_type)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-[var(--fg2)]">
                  <span className="font-medium text-foreground">
                    {evt.actor_name || 'Система'}
                  </span>{' '}
                  {humanizeTaskEvent(evt.event_type, evt.payload)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--fg4)]">
                  <time dateTime={evt.created_at}>
                    {formatRelative(evt.created_at)}
                  </time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function humanizeTaskEvent(eventType, payload) {
  switch (eventType) {
    case 'task_created':
      return 'создал(а) задачу'
    case 'task_updated': {
      const fields = Array.isArray(payload?.fields) ? payload.fields : []
      const labelMap = {
        title: 'название',
        description: 'описание',
        deadline: 'дедлайн',
        assigned_to: 'исполнителя',
      }
      const labels = fields.map((f) => labelMap[f] || f).join(', ')
      return labels ? `обновил(а): ${labels}` : 'обновил(а) задачу'
    }
    case 'task_reassigned':
      return 'переназначил(а) задачу'
    case 'taken_in_progress':
      return 'взял(а) в работу'
    case 'report_submitted': {
      const mc = payload?.media_count || 0
      if (mc === 0) return 'отправил(а) отчёт'
      const word = mc === 1 ? 'файл' : mc < 5 ? 'файла' : 'файлов'
      return `отправил(а) отчёт (${mc} ${word})`
    }
    case 'report_updated':
      return 'обновил(а) отчёт'
    case 'task_cancelled':
      return 'отменил(а) задачу'
    case 'deadline_changed':
      return 'изменил(а) дедлайн'
    default:
      return eventType
  }
}

function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const diffMs = now - d.getTime()
  const min = Math.floor(diffMs / 60000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  if (hr < 24) return `${hr} ч назад`
  if (day < 7) return `${day} д назад`
  const months = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function eventIcon(eventType) {
  switch (eventType) {
    case 'task_created':
      return <Plus size={12} />
    case 'task_updated':
      return <Pencil size={12} />
    case 'taken_in_progress':
      return <PlayCircle size={12} />
    case 'report_submitted':
      return <CheckCircle2 size={12} />
    case 'report_updated':
      return <FileText size={12} />
    case 'task_cancelled':
      return <Ban size={12} />
    case 'deadline_changed':
      return <Calendar size={12} />
    case 'task_reassigned':
      return <UserCog size={12} />
    default:
      return <Plus size={12} />
  }
}
