import { useState } from 'react'
import { useTeamMembers } from '../../hooks/useTeamMembers.js'
import { canEditTeam, formatLeadRole } from '../../lib/teams.js'
import { initials } from '../../lib/clients.js'
import { AddMemberModal } from './AddMemberModal.jsx'
import { ChangeLeadModal } from './ChangeLeadModal.jsx'

/**
 * Таб «Состав» — лид (кликабельный) + список операторов с add/remove.
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {object} props.user
 * @param {object} props.row — get_team_detail row
 * @param {function} props.reload
 */
export function TeamMembersTab({ callerId, user, row, reload }) {
  const editable = canEditTeam(user, row)
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { members, addMember, removeMember, mutating } = useTeamMembers(callerId, row, reload)

  const [addOpen, setAddOpen] = useState(false)
  const [leadOpen, setLeadOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null) // member object

  async function handleConfirmRemove() {
    if (!confirmRemove) return
    try {
      await removeMember(confirmRemove.operator_id)
      setConfirmRemove(null)
    } catch (e) {
      alert(`Не удалось убрать оператора: ${e.message}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Lead card */}
      <section className="surface-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="label-caps">Лид</h3>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setLeadOpen(true)}
              className="text-xs font-medium text-primary hover:underline focus-ds rounded"
            >
              Сменить лида
            </button>
          )}
        </header>
        {row.lead_user_id ? (
          <div className="flex items-center gap-3">
            <InitialsAvatar name={row.lead_name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {row.lead_name ?? '—'}
              </p>
              {row.lead_role && (
                <p className="text-xs text-muted-foreground">
                  {formatLeadRole(row.lead_role)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm italic text-[var(--fg4)]">Лид не назначен.</p>
        )}
      </section>

      {/* Operators */}
      <section className="surface-card p-4">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="label-caps">Операторы ({members.length})</h3>
          {editable && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="btn-primary text-xs px-3 py-1.5"
            >
              + Добавить оператора
            </button>
          )}
        </header>

        {members.length === 0 ? (
          <p className="text-sm italic text-[var(--fg4)]">
            Команда без операторов · добавьте сотрудников.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <li
                key={m.operator_id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <InitialsAvatar name={m.name} avatarUrl={m.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-sm font-medium text-foreground" title={m.name}>
                      {m.name ?? '—'}
                    </p>
                    {m.ref_code && (
                      <span className="font-mono text-xs text-muted-foreground tabular">
                        {m.ref_code}
                      </span>
                    )}
                  </div>
                  {m.alias && (
                    <p className="truncate text-xs text-[var(--fg4)]">{m.alias}</p>
                  )}
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(m)}
                    disabled={mutating}
                    aria-label={`Убрать ${m.name ?? 'оператора'} из команды`}
                    className="rounded-md p-1.5 text-[var(--fg4)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] disabled:opacity-50 focus-ds"
                  >
                    <CloseIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {addOpen && (
        <AddMemberModal
          callerId={callerId}
          teamId={row.id}
          onClose={() => setAddOpen(false)}
          onAdd={async (operatorId) => {
            await addMember(operatorId)
          }}
        />
      )}

      {leadOpen && (
        <ChangeLeadModal
          callerId={callerId}
          teamId={row.id}
          currentLeadId={row.lead_user_id}
          onClose={() => setLeadOpen(false)}
          onChanged={() => {
            setLeadOpen(false)
            reload?.()
          }}
        />
      )}

      {confirmRemove && (
        <RemoveMemberConfirm
          name={confirmRemove.name}
          busy={mutating}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={handleConfirmRemove}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline confirm dialog for removing one operator
// ---------------------------------------------------------------------------

function RemoveMemberConfirm({ name, busy, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-member-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 id="remove-member-title" className="text-base font-semibold text-foreground">
          Убрать {name ?? 'оператора'} из команды?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Оператор останется активным, но потеряет доступ к клиентам команды.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-danger-ghost"
          >
            {busy ? 'Убираем…' : 'Убрать'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InitialsAvatar({ name, avatarUrl, size = 'sm' }) {
  const dim = size === 'md' ? 'h-10 w-10 text-sm' : 'h-9 w-9 text-xs'
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`${dim} shrink-0 rounded-full object-cover`} />
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] font-semibold text-[var(--primary-ink)]`}
      aria-hidden
    >
      {initials(name ?? '?')}
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
