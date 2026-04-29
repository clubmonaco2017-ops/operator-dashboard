import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { invalidateUserTeamMembership } from '../../hooks/useUserTeamMembership.js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .rpc('list_active_teams_for_assignment', {})
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
          p_team_id: selected,
          p_operator_id: operatorId,
        }))
      } else {
        ;({ error: err } = await supabase.rpc('move_team_member', {
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
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>
            {currentTeamId == null ? 'Назначить в команду' : 'Перевести в другую команду'}
          </DialogTitle>
        </DialogHeader>

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

