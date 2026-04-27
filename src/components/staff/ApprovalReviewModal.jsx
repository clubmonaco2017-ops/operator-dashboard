import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { ModalShell } from './ChangePasswordModal.jsx'
import { Button } from '@/components/ui/button'

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
        <dl className="space-y-1 rounded-md bg-muted p-3 text-xs">
          <div><dt className="inline text-muted-foreground">Кто запросил:</dt> <dd className="inline font-medium">{request.requested_by_full_name} ({request.requested_by_ref_code})</dd></div>
          <div><dt className="inline text-muted-foreground">Когда:</dt> <dd className="inline">{new Date(request.created_at).toLocaleString('ru-RU')}</dd></div>
          <div><dt className="inline text-muted-foreground">Кого:</dt> <dd className="inline font-medium">{request.target_full_name} — {request.target_email} ({request.target_ref_code})</dd></div>
        </dl>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Причина:</div>
          <div className="rounded-md border-l-2 border-border bg-muted p-3 text-foreground">
            {request.reason}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий (опционально)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
          />
        </label>
        {error && <p role="alert" className="text-sm text-[var(--danger-ink)]">{error}</p>}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => call('reject_deletion')} disabled={submitting} className="flex-1">
            Отклонить
          </Button>
          <Button variant="destructive" onClick={() => call('approve_deletion')} disabled={submitting} className="flex-1">
            Подтвердить и деактивировать
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
