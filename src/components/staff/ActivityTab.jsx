import { useOutletContext } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { useStaffActivity } from '../../hooks/useStaffActivity.js'
import { formatStaffActivityMessage } from '../../lib/staffActivityMessages.js'

function formatRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} дн назад`
  return new Date(iso).toLocaleDateString('ru-RU')
}

export function ActivityTab() {
  const { row } = useOutletContext()
  const { rows, loading, error } = useStaffActivity(row?.id)

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-destructive" role="alert">
        Ошибка: {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Пока нет событий</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 p-3">
          <Activity size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{formatStaffActivityMessage(r)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatRelative(r.created_at)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
