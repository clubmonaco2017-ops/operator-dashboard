import { useEffect, useRef } from 'react'

/**
 * Confirm-диалог при попытке закрыть форму с несохранённым вводом.
 * Поверх slide-out'а; click outside игнорируется (R2.8.4).
 *
 * @param {object} props
 * @param {function} props.onContinue — вернуться к редактированию
 * @param {function} props.onDiscard — закрыть без сохранения
 */
export function CreateClientCloseConfirm({ onContinue, onDiscard }) {
  const continueBtnRef = useRef(null)

  useEffect(() => {
    // Default focus = safe action (R2.8.3)
    continueBtnRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onContinue()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onContinue])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl border border-border">
        <h3 id="close-confirm-title" className="text-base font-semibold text-foreground">
          Закрыть без сохранения?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Введённые данные будут потеряны.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] focus-ds"
          >
            Закрыть без сохранения
          </button>
          <button
            ref={continueBtnRef}
            type="button"
            onClick={onContinue}
            className="btn-primary"
          >
            Продолжить ввод
          </button>
        </div>
      </div>
    </div>
  )
}
