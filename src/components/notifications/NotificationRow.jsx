import { CheckSquare, Network, Trash2 } from 'lucide-react'
import { formatNotificationMessage } from '../../lib/notificationMessages.js'

const ICONS = {
  task_activity: CheckSquare,
  team_activity: Network,
  deletion_request: Trash2,
}

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

export function NotificationRow({ notification, onClick }) {
  const Icon = ICONS[notification.source] ?? CheckSquare
  return (
    <li
      onClick={() => onClick?.(notification)}
      className="flex items-start gap-3 p-3 hover:bg-accent cursor-pointer"
    >
      {notification.is_unseen ? (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="непрочитанное" />
      ) : (
        <span className="w-2 shrink-0" />
      )}
      <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground line-clamp-2">
          {formatNotificationMessage(notification)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelative(notification.created_at)}
        </p>
      </div>
    </li>
  )
}
