import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaffTeamMembership } from '../../hooks/useStaffTeamMembership.js'
import { ChangeTeamModal } from './ChangeTeamModal.jsx'
import { formatLeadRole } from '../../lib/teams.js'

/**
 * Блок «Команда» в карточке оператора.
 * Виден всем; кнопка перевода — admin/superadmin или текущий лид.
 */
export function TeamMembershipBlock({ callerId, user, staff }) {
  const { data, loading, error, reload } = useStaffTeamMembership(staff.id)
  const [open, setOpen] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isCurrentLead = data?.lead_user_id === user?.id
  const canChange = isAdmin || isCurrentLead

  if (loading) {
    return (
      <section
        className="surface-card mt-4 flex items-center gap-3 px-5 py-4"
        aria-busy="true"
        aria-label="Загрузка команды"
      >
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-3 w-40 animate-pulse rounded bg-muted/70" />
      </section>
    )
  }

  return (
    <section className="surface-card mt-4 px-5 py-4">
      <div className="label-caps mb-2 text-muted-foreground">Команда</div>
      {error && (
        <p className="mb-2 text-xs text-[var(--danger-ink)]" role="alert">
          Ошибка: {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {data ? (
            <>
              <Link
                to={`/teams/${data.team_id}`}
                className="block truncate text-sm font-semibold text-foreground hover:text-primary focus-ds rounded"
                title={data.team_name}
              >
                {data.team_name}
              </Link>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={data.lead_name}>
                Лид: {data.lead_name}
                {data.lead_role && ` · ${formatLeadRole(data.lead_role)}`}
              </p>
            </>
          ) : (
            <p className="text-sm italic text-[var(--fg4)]">Команда не назначена</p>
          )}
        </div>
        {canChange && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-ghost shrink-0 text-xs px-3 py-1.5"
          >
            {data ? 'Перевести' : 'Назначить'}
          </button>
        )}
      </div>

      {open && (
        <ChangeTeamModal
          callerId={callerId}
          operatorId={staff.id}
          currentTeamId={data?.team_id ?? null}
          onClose={() => setOpen(false)}
          onChanged={() => {
            setOpen(false)
            reload()
          }}
        />
      )}
    </section>
  )
}
