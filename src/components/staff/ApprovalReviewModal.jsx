import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { ModalShell } from './ChangePasswordModal.jsx'

export function ApprovalReviewModal({ request, onClose, onDone }) {
  const { user } = useAuth()
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const call = async (rpc) => {
    setSubmitting(true); setError(null)
    const { error: err } = await supabase.rpc(rpc, {
      p_caller_id: user.id, p_request_id: request.id, p_note: note || null,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    onDone?.()
    onClose()
  }

  return (
    <ModalShell title={`Запрос на удаление: ${request.target_full_name}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <dl className="space-y-1 rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-800">
          <div><dt className="inline text-slate-500">Кто запросил:</dt> <dd className="inline font-medium">{request.requested_by_full_name} ({request.requested_by_ref_code})</dd></div>
          <div><dt className="inline text-slate-500">Когда:</dt> <dd className="inline">{new Date(request.created_at).toLocaleString('ru-RU')}</dd></div>
          <div><dt className="inline text-slate-500">Кого:</dt> <dd className="inline font-medium">{request.target_full_name} — {request.target_email} ({request.target_ref_code})</dd></div>
        </dl>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">Причина:</div>
          <div className="rounded-md border-l-2 border-slate-300 bg-slate-50 p-3 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {request.reason}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Комментарий (опционально)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={() => call('reject_deletion')} disabled={submitting} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Отклонить
          </button>
          <button onClick={() => call('approve_deletion')} disabled={submitting} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            Подтвердить и деактивировать
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
