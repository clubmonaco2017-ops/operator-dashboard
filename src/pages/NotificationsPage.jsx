import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { supabase } from '../supabaseClient'
import { useNotifications, invalidateUserNotifications } from '../hooks/useNotifications.js'
import { invalidateNotificationsUnseenCount } from '../hooks/useNotificationsUnseenCount.js'
import { useDeletionRequests } from '../hooks/useDeletionRequests.js'
import { useSectionTitle } from '../hooks/useSectionTitle.jsx'
import { NotificationRow } from '../components/notifications/NotificationRow.jsx'
import { targetForNotification } from '../lib/notificationMessages.js'
import { ApprovalReviewModal } from '../components/staff/ApprovalReviewModal.jsx'

export function NotificationsPage() {
  useSectionTitle('Оповещения')
  const { user } = useAuth()
  const { rows, loading, error } = useNotifications(user?.id)
  const navigate = useNavigate()
  const [reviewing, setReviewing] = useState(null)

  // For deletion-request modal: load list on demand to find full row by id (cheap; reuses existing hook).
  const { rows: deletionRows, reload: reloadDeletions } = useDeletionRequests(user?.id, 'pending')

  useEffect(() => {
    if (!user?.id) return
    supabase.rpc('mark_notifications_visited').then(() => {
      invalidateNotificationsUnseenCount(user.id)
      invalidateUserNotifications()
    })
  }, [user?.id])

  const handleClick = (n) => {
    const target = targetForNotification(n)
    if (target) { navigate(target); return }
    if (n.source === 'deletion_request') {
      const dr = deletionRows.find((r) => r.id === n.entity_id)
      if (dr) setReviewing(dr)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Оповещения</h1>

        {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {error && <p className="text-sm text-destructive" role="alert">Ошибка: {error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
            Пока нет оповещений
          </p>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {rows.map((n) => (
              <NotificationRow key={n.id} notification={n} onClick={handleClick} />
            ))}
          </ul>
        )}

        {reviewing && (
          <ApprovalReviewModal
            request={reviewing}
            onClose={() => setReviewing(null)}
            onDone={() => { reloadDeletions(); invalidateUserNotifications() }}
          />
        )}
      </div>
    </div>
  )
}
