import { useState } from 'react'
import { useAuth } from '../useAuth.jsx'
import { isSuperadmin } from '../lib/permissions.js'
import { useDeletionRequests } from '../hooks/useDeletionRequests.js'
import { ApprovalReviewModal } from '../components/staff/ApprovalReviewModal.jsx'
import { Button } from '@/components/ui/button'
import { useSectionTitle } from '../hooks/useSectionTitle.jsx'

export function NotificationsPage() {
  useSectionTitle('Оповещения')
  const { user } = useAuth()
  const { rows, loading, error, reload } = useDeletionRequests(user?.id, 'pending')
  const [reviewing, setReviewing] = useState(null)

  if (!isSuperadmin(user)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Недоступно</div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-2xl font-bold text-foreground">
            Оповещения
          </h1>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Запросы на удаление ({rows.length})
          </h2>

          {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {error && (
            <p className="text-sm text-[var(--danger-ink)]" role="alert">
              Ошибка: {error}
            </p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
              Нет запросов на рассмотрение
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {r.target_full_name}
                    <span className="ml-2 font-mono text-xs text-[var(--fg4)]">
                      {r.target_ref_code}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    от {r.requested_by_full_name} ·{' '}
                    {new Date(r.created_at).toLocaleString('ru-RU')}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {r.reason}
                  </div>
                </div>
                <Button size="sm" onClick={() => setReviewing(r)}>
                  Рассмотреть
                </Button>
              </li>
            ))}
          </ul>

          {reviewing && (
            <ApprovalReviewModal
              request={reviewing}
              onClose={() => setReviewing(null)}
              onDone={reload}
            />
          )}
        </div>
    </div>
  )
}
