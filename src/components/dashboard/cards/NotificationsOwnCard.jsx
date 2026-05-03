import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../../hooks/useNotifications.js'
import { useNotificationsUnseenCount } from '../../../hooks/useNotificationsUnseenCount.js'
import { NotificationRow } from '../../notifications/NotificationRow.jsx'
import { targetForNotification } from '../../../lib/notificationMessages.js'

export function NotificationsOwnCard({ user }) {
  const { rows, loading } = useNotifications(user?.id)
  const unseen = useNotificationsUnseenCount(user?.id)
  const navigate = useNavigate()
  const top3 = rows.slice(0, 3)

  const handleRowClick = (n) => {
    const target = targetForNotification(n)
    if (target) navigate(target)
    else navigate('/notifications')
  }

  const borderClass = unseen > 0 ? 'border-primary/40' : 'border-border'

  return (
    <section className={`flex flex-col rounded-lg border bg-card ${borderClass}`}>
      <header className="flex items-center justify-between p-4 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Оповещения</h3>
        {unseen > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {unseen > 99 ? '99+' : unseen}
          </span>
        )}
      </header>
      {loading ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Загрузка…</p>
      ) : top3.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Нет новых оповещений</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {top3.map((n) => (
            <NotificationRow key={n.id} notification={n} onClick={handleRowClick} />
          ))}
        </ul>
      )}
      <button
        onClick={() => navigate('/notifications')}
        className="px-4 py-3 text-left text-xs text-primary hover:underline"
      >
        Все оповещения →
      </button>
    </section>
  )
}
