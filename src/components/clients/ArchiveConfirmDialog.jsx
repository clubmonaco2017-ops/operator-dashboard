import { useEffect, useRef } from 'react'

/**
 * Confirm-диалог для архивирования клиента.
 * Restore (из архива) — без confirm, мгновенно (см. R1).
 *
 * @param {object} props
 * @param {string} props.clientName
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 * @param {boolean} props.busy
 */
export function ArchiveConfirmDialog({ clientName, onCancel, onConfirm, busy }) {
  const cancelBtnRef = useRef(null)

  useEffect(() => {
    cancelBtnRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl border border-border">
        <h3 id="archive-confirm-title" className="text-base font-semibold text-foreground">
          Архивировать клиента?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {clientName} перестанет показываться в списке активных. Это можно отменить — снова сделать клиента активным в любой момент.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-danger-ghost"
          >
            {busy ? 'Архивируем…' : 'Архивировать'}
          </button>
        </div>
      </div>
    </div>
  )
}
