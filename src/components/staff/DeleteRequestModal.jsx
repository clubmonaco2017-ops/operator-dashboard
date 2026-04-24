import { useState } from 'react'
import { ModalShell } from './ChangePasswordModal.jsx'

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
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Причина (минимум 20 символов)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            aria-label="Причина"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <span className="mt-1 text-xs text-slate-400">{reason.trim().length} / 20</span>
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Отмена
          </button>
          <button
            type="button"
            onClick={() => canSubmit && onSubmit(reason.trim())}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Отправить
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
