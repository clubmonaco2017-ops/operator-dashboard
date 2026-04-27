import { useState } from 'react'
import { ModalShell } from './ChangePasswordModal.jsx'
import { Button } from '@/components/ui/button'

export function DeleteRequestModal({ targetUserId, targetName, onClose, onSubmit, submitting }) {
  const [reason, setReason] = useState('')
  const canSubmit = reason.trim().length >= 20 && !submitting
  return (
    <ModalShell title={`Запросить удаление: ${targetName}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Запрос уйдёт на подтверждение Супер-Админу. До подтверждения сотрудник остаётся активным.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Причина (минимум 20 символов)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            aria-label="Причина"
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
          />
          <span className="mt-1 text-xs text-muted-foreground">{reason.trim().length} / 20</span>
        </label>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting} className="flex-1">
            Отмена
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => canSubmit && onSubmit(reason.trim())}
            disabled={!canSubmit}
            className="flex-1 text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
          >
            Отправить
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
