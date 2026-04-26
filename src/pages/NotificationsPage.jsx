import { useState } from 'react'
import { useAuth } from '../useAuth.jsx'
import { isSuperadmin } from '../lib/permissions.js'
import { useDeletionRequests } from '../hooks/useDeletionRequests.js'
import { ApprovalReviewModal } from '../components/staff/ApprovalReviewModal.jsx'

export function NotificationsPage() {
  const { user } = useAuth()
  const { rows, loading, error, reload } = useDeletionRequests(user?.id, 'pending')
  const [reviewing, setReviewing] = useState(null)

  if (!isSuperadmin(user)) {
    return (
      <div className="p-6 text-sm text-slate-500">Недоступно</div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-2xl font-bold text-slate-800 dark:text-slate-100">
            Оповещения
          </h1>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Запросы на удаление ({rows.length})
          </h2>

          {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
          {error && <p className="text-sm text-red-500">Ошибка: {error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Нет запросов на рассмотрение
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {r.target_full_name}
                    <span className="ml-2 font-mono text-xs text-slate-400">{r.target_ref_code}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    от {r.requested_by_full_name} · {new Date(r.created_at).toLocaleString('ru-RU')}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.reason}
                  </div>
                </div>
                <button
                  onClick={() => setReviewing(r)}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Рассмотреть
                </button>
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
