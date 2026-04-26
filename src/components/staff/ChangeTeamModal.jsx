import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { invalidateUserTeamMembership } from '../../hooks/useUserTeamMembership.js'

/**
 * Модалка «Перевести оператора в другую команду» (или назначить, если он не в команде).
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {number} props.operatorId
 * @param {number|null} props.currentTeamId
 * @param {function} props.onClose
 * @param {function} props.onChanged
 */
export function ChangeTeamModal({ callerId, operatorId, currentTeamId, onClose, onChanged }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const closeBtnRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    closeBtnRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!submitting) onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus?.()
    }
  }, [onClose, submitting])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .rpc('list_active_teams_for_assignment', { p_caller_id: callerId })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setTeams([])
        } else {
          setTeams((data ?? []).filter((t) => t.id !== currentTeamId))
        }
      })
      .then(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [callerId, currentTeamId])

  async function handleSubmit() {
    if (submitting || selected == null) return
    setSubmitting(true)
    setError(null)
    try {
      let err
      if (currentTeamId == null) {
        ;({ error: err } = await supabase.rpc('add_team_member', {
          p_caller_id: callerId,
          p_team_id: selected,
          p_operator_id: operatorId,
        }))
      } else {
        ;({ error: err } = await supabase.rpc('move_team_member', {
          p_caller_id: callerId,
          p_from_team: currentTeamId,
          p_to_team: selected,
          p_operator_id: operatorId,
        }))
      }
      if (err) throw new Error(err.message)
      invalidateUserTeamMembership(operatorId)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-team-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl max-h-[90vh]">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="change-team-title" className="text-base font-semibold text-foreground">
            {currentTeamId == null ? 'Назначить в команду' : 'Перевести в другую команду'}
          </h3>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Закрыть"
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        {error && (
          <div className="border-b border-border bg-[var(--danger-soft)] px-5 py-2 text-xs text-[var(--danger-ink)]" role="alert">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <ListSkeleton />
          ) : teams.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm italic text-[var(--fg4)]">
              Нет других активных команд.
            </p>
          ) : (
            <ul className="divide-y divide-border" role="radiogroup" aria-label="Команды">
              {teams.map((t) => {
                const isSelected = selected === t.id
                return (
                  <li key={t.id}>
                    <label
                      className={[
                        'flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-muted/40 focus-within:bg-muted/40',
                        isSelected && 'bg-[var(--primary-soft)]/40',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="radio"
                        name="new-team"
                        checked={isSelected}
                        onChange={() => setSelected(t.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                        aria-label={t.name}
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={t.name}>
                        {t.name}
                      </p>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="btn-ghost text-xs px-3 py-1.5"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selected == null}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-busy="true">
      {[60, 80, 50, 70].map((w, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-3">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
        </li>
      ))}
    </ul>
  )
}

