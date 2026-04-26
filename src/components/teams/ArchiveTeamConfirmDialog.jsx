import { useEffect, useRef } from 'react'
import { pluralizeOperators } from '../../lib/teams.js'
import { pluralizeClients } from '../../lib/clients.js'

/**
 * Confirm-диалог для архивирования команды. Restore — без confirm.
 *
 * @param {object} props
 * @param {string} props.teamName
 * @param {number} props.members
 * @param {number} props.clients
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function ArchiveTeamConfirmDialog({ teamName, members = 0, clients = 0, busy, onCancel, onConfirm }) {
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

  const releaseLine =
    members > 0 || clients > 0
      ? `${pluralizeOperators(members)} и ${pluralizeClients(clients)} будут освобождены.`
      : 'Команда сейчас пустая — освобождать никого не нужно.'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-team-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 id="archive-team-confirm-title" className="text-base font-semibold text-foreground">
          Архивировать команду?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{teamName}</span> · {releaseLine}{' '}
          Команду можно восстановить позже.
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
