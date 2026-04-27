import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useOperatorCurator } from '../../hooks/useOperatorCurator.js'
import { ChangeCuratorModal } from './ChangeCuratorModal.jsx'
import { Button } from '@/components/ui/button'

/**
 * Блок «Куратор» в карточке оператора.
 * Назначить — admin/superadmin; сменить — admin/superadmin или текущий куратор.
 */
export function CuratorBlock({ callerId, user, staff }) {
  const { data, loading, error, reload } = useOperatorCurator(callerId, staff.id)
  const [open, setOpen] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isCurrentCurator = data?.moderator_id === user?.id
  const canChange = isAdmin || isCurrentCurator
  const canAssign = isAdmin

  if (loading) {
    return (
      <section
        className="surface-card mt-4 flex items-center gap-3 px-5 py-4"
        aria-busy="true"
        aria-label="Загрузка куратора"
      >
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-3 w-40 animate-pulse rounded bg-muted/70" />
      </section>
    )
  }

  const name = data
    ? data.display_name || data.alias || `#${data.moderator_id}`
    : null

  return (
    <section className="surface-card mt-4 px-5 py-4">
      <div className="label-caps mb-2 text-muted-foreground">Куратор</div>
      {error && (
        <p className="mb-2 text-xs text-[var(--danger-ink)]" role="alert">
          Ошибка: {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {data ? (
            data.ref_code ? (
              <Link
                to={`/staff/${data.ref_code}`}
                className="block truncate text-sm font-semibold text-foreground hover:text-primary rounded"
                title={name}
              >
                {name}
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold text-foreground" title={name}>
                {name}
              </p>
            )
          ) : (
            <p className="text-sm italic text-[var(--fg4)]">Куратор не назначен</p>
          )}
        </div>
        {(data ? canChange : canAssign) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            className="shrink-0 text-xs"
          >
            {data ? 'Сменить' : 'Назначить'}
          </Button>
        )}
      </div>

      {open && (
        <ChangeCuratorModal
          callerId={callerId}
          operatorId={staff.id}
          currentCuratorId={data?.moderator_id ?? null}
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
