import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '../../supabaseClient'
import { useTeamActions } from '../../hooks/useTeamActions.js'
import { formatLeadRole } from '../../lib/teams.js'
import { initials } from '../../lib/clients.js'

/**
 * Модальное окно «Сменить лида команды».
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {number} props.teamId
 * @param {number|null} props.currentLeadId
 * @param {function} props.onClose
 * @param {function} props.onChanged
 */
export function ChangeLeadModal({ callerId, teamId, currentLeadId, onClose, onChanged }) {
  const { updateTeam } = useTeamActions(callerId)

  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Load candidate leads (mirrors CreateTeamSlideOut behaviour).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('dashboard_users')
      .select('id, first_name, last_name, alias, email, role, avatar_url')
      .in('role', ['superadmin', 'admin', 'teamlead', 'moderator'])
      .eq('is_active', true)
      .order('first_name')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setCandidates([])
        } else {
          setCandidates(
            (data ?? []).filter((u) => u.id !== currentLeadId),
          )
        }
      })
      .then(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentLeadId])

  async function handleSubmit() {
    if (submitting || selected == null) return
    setSubmitting(true)
    setError(null)
    try {
      await updateTeam(teamId, { leadUserId: selected })
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Сменить лида команды</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="border-b border-border bg-[var(--danger-soft)] px-5 py-2 text-xs text-[var(--danger-ink)]" role="alert">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <ListSkeleton />
          ) : candidates.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm italic text-[var(--fg4)]">
              Нет других кандидатов.
            </p>
          ) : (
            <ul className="divide-y divide-border" role="radiogroup" aria-label="Кандидаты в лиды">
              {candidates.map((u) => {
                const name = leadLabel(u)
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
                        name="new-lead"
                        checked={isSelected}
                        onChange={() => setSelected(u.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                        aria-label={name}
                      />
                      <Avatar name={name} avatarUrl={u.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatLeadRole(u.role) || u.role}
                        </p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-muted/40 px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
          >
            Отмена
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || selected == null}
          >
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function leadLabel(u) {
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
