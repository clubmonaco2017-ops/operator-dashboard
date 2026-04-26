import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCuratorship } from '../../hooks/useCuratorship.js'
import { ChangeCuratorModal } from './ChangeCuratorModal.jsx'
import { AddCuratedOperatorsModal } from './AddCuratedOperatorsModal.jsx'
import { initials } from '../../lib/clients.js'

/**
 * Блок «Курирует операторов» в карточке модератора.
 * Виден admin/superadmin (всегда) или самому модератору.
 */
export function CuratedOperatorsBlock({ callerId, user, staff }) {
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isSelf = user?.id === staff?.id
  const canSee = isAdmin || isSelf

  const { operators, loading, error, reload } = useCuratorship(
    canSee ? callerId : null,
    canSee ? staff.id : null,
  )
  const [expanded, setExpanded] = useState(true)
  const [reassignFor, setReassignFor] = useState(null) // operatorId
  const [addOpen, setAddOpen] = useState(false)

  if (!canSee) return null

  return (
    <section className="surface-card mt-4 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps text-muted-foreground">Курирует операторов</div>
          <div className="mt-0.5 text-sm font-semibold text-foreground tabular">
            {loading ? '…' : operators.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="btn-primary text-xs px-3 py-1.5"
            >
              + Добавить
            </button>
          )}
          {operators.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Свернуть список' : 'Развернуть список'}
              className="btn-ghost text-xs px-2 py-1.5"
            >
              {expanded ? '−' : '+'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-2 text-xs text-[var(--danger-ink)]" role="alert">
          Ошибка: {error}
        </p>
      )}

      {loading && operators.length === 0 ? (
        <ListSkeleton />
      ) : operators.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-[var(--fg4)]">
          Под этим модератором нет операторов.
        </p>
      ) : (
        expanded && (
          <ul className="divide-y divide-border">
            {operators.map((op) => {
              const linked = op.ref_code
              const inner = (
                <div className="flex items-center gap-3 py-2">
                  <Avatar name={op.name} avatarUrl={op.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-medium text-foreground" title={op.name}>
                        {op.name ?? `#${op.operator_id}`}
                      </p>
                      {op.ref_code && (
                        <span className="font-mono text-xs text-muted-foreground tabular">
                          {op.ref_code}
                        </span>
                      )}
                    </div>
                    {op.team_name && (
                      <p className="truncate text-xs text-muted-foreground" title={op.team_name}>
                        {op.team_name}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setReassignFor(op.operator_id)
                      }}
                      className="btn-ghost shrink-0 text-xs px-2 py-1"
                      aria-label={`Передать оператора ${op.name ?? op.operator_id} другому куратору`}
                    >
                      Передать
                    </button>
                  )}
                </div>
              )
              return (
                <li key={op.operator_id}>
                  {linked ? (
                    <Link
                      to={`/staff/${op.ref_code}`}
                      className="block hover:bg-muted/40 rounded px-1 -mx-1"
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              )
            })}
          </ul>
        )
      )}

      {reassignFor != null && (
        <ChangeCuratorModal
          callerId={callerId}
          operatorId={reassignFor}
          currentCuratorId={staff.id}
          onClose={() => setReassignFor(null)}
          onChanged={() => {
            setReassignFor(null)
            reload()
          }}
        />
      )}
      {addOpen && (
        <AddCuratedOperatorsModal
          callerId={callerId}
          moderatorId={staff.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            reload()
          }}
        />
      )}
    </section>
  )
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
      {[55, 70, 60].map((w, i) => (
        <li key={i} className="flex items-center gap-3 py-2">
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
