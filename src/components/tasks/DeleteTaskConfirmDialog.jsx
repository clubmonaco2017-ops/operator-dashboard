import { useEffect, useRef } from 'react'
import { pluralRu } from '../../lib/clients.js'

/**
 * Confirm-диалог удаления задачи (admin/superadmin).
 *
 * @param {object} props
 * @param {string} props.taskTitle
 * @param {number} props.mediaCount — кол-во файлов отчёта (для текста подтверждения)
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function DeleteTaskConfirmDialog({
  taskTitle,
  mediaCount = 0,
  busy,
  onCancel,
  onConfirm,
}) {
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

  const fileWord = pluralRu(mediaCount, {
    one: 'файл',
    few: 'файла',
    many: 'файлов',
  })

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3
          id="delete-task-confirm-title"
          className="text-base font-semibold text-foreground"
        >
          Удалить задачу «{taskTitle}» безвозвратно?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {mediaCount > 0
            ? `${mediaCount} ${fileWord} отчёта будут удалены. Действие необратимо.`
            : 'Действие необратимо.'}
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
            {busy ? 'Удаляем…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}
