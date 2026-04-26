import { useEffect, useRef } from 'react'

/**
 * Confirm-диалог отмены задачи.
 *
 * @param {object} props
 * @param {string} props.taskTitle
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function CancelTaskConfirmDialog({ taskTitle, busy, onCancel, onConfirm }) {
  const cancelBtnRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    cancelBtnRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      try {
        previouslyFocused.current?.focus?.()
      } catch {
        /* unmounted */
      }
    }
  }, [onCancel, busy])

  const truncated =
    taskTitle && taskTitle.length > 60 ? `${taskTitle.slice(0, 60)}…` : taskTitle

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-task-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3
          id="cancel-task-confirm-title"
          className="text-base font-semibold text-foreground"
        >
          Отменить задачу «{truncated}»?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Задача перейдёт в статус «Отменена». Это можно увидеть в истории, но
          восстановить нельзя.
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
            {busy ? 'Отменяем…' : 'Отменить задачу'}
          </button>
        </div>
      </div>
    </div>
  )
}
