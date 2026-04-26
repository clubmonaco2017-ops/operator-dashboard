import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { invalidateUserTeamMembership } from '../../hooks/useUserTeamMembership.js'
import { initials } from '../../lib/clients.js'

/**
 * Модалка «Сменить куратора».
 * Required-replacement (D-9): без опции «без куратора».
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {number} props.operatorId
 * @param {number|null} props.currentCuratorId
 * @param {function} props.onClose
 * @param {function} props.onChanged
 */
export function ChangeCuratorModal({ callerId, operatorId, currentCuratorId, onClose, onChanged }) {
  const [moderators, setModerators] = useState([])
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
      .from('dashboard_users')
      .select('id, first_name, last_name, alias, email, avatar_url')
      .eq('role', 'moderator')
      .eq('is_active', true)
      .order('first_name')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setModerators([])
        } else {
          setModerators((data ?? []).filter((u) => u.id !== currentCuratorId))
        }
      })
      .then(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentCuratorId])

  async function handleSubmit() {
    if (submitting || selected == null) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('set_operator_curator', {
        p_caller_id: callerId,
        p_operator_id: operatorId,
        p_new_moderator_id: selected,
      })
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
      aria-labelledby="change-curator-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl max-h-[90vh]">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="change-curator-title" className="text-base font-semibold text-foreground">
            {currentCuratorId == null ? 'Назначить куратора' : 'Сменить куратора'}
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
          ) : moderators.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm italic text-[var(--fg4)]">
              Нет доступных модераторов.
            </p>
          ) : (
            <ul className="divide-y divide-border" role="radiogroup" aria-label="Модераторы">
              {moderators.map((u) => {
                const name = modLabel(u)
                const isSelected = selected === u.id
                return (
                  <li key={u.id}>
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
                        name="new-curator"
                        checked={isSelected}
                        onChange={() => setSelected(u.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                        aria-label={name}
                      />
                      <Avatar name={name} avatarUrl={u.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground" title={name}>
                          {name}
                        </p>
                        {u.alias && (
                          <p className="truncate text-xs text-muted-foreground">{u.alias}</p>
                        )}
                      </div>
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

function modLabel(u) {
  const fullName = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  if (fullName) return fullName
  if (u.alias) return u.alias
  return u.email ?? `#${u.id}`
}

function Avatar({ name, avatarUrl }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary-ink)]"
      aria-hidden
    >
      {initials(name ?? '?')}
    </div>
  )
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-busy="true">
      {[55, 70, 60, 50].map((w, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-2.5">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}

