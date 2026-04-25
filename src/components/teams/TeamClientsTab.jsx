import { useMemo, useState } from 'react'
import { useTeamClients } from '../../hooks/useTeamClients.js'
import { canEditTeam } from '../../lib/teams.js'
import { initials } from '../../lib/clients.js'
import { AddClientsModal } from './AddClientsModal.jsx'

/**
 * Таб «Клиенты» — поиск + grid тайлов клиентов команды.
 */
export function TeamClientsTab({ callerId, user, row, reload }) {
  const editable = canEditTeam(user, row)
  const { clients, assignClients, unassignClient, mutating } = useTeamClients(
    callerId,
    row,
    reload,
  )
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null) // client object

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => {
      const n = String(c.name ?? '').toLowerCase()
      const a = String(c.alias ?? '').toLowerCase()
      return n.includes(q) || a.includes(q)
    })
  }, [clients, search])

  async function handleConfirmRemove() {
    if (!confirmRemove) return
    try {
      await unassignClient(confirmRemove.client_id)
      setConfirmRemove(null)
    } catch (e) {
      alert(`Не удалось снять клиента: ${e.message}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или alias…"
            aria-label="Поиск клиентов команды"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary focus-ds"
          />
        </div>
        <div className="flex-1" />
        {editable && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="btn-primary text-xs px-3 py-1.5"
          >
            + Добавить клиентов
          </button>
        )}
      </div>

      {/* Body */}
      {clients.length === 0 ? (
        <p className="surface-card p-6 text-center text-sm italic text-[var(--fg4)]">
          Нет клиентов · назначьте моделей команде.
        </p>
      ) : filtered.length === 0 ? (
        <p className="surface-card p-6 text-center text-sm text-muted-foreground">
          По запросу «{search}» ничего не найдено.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <li
              key={c.client_id}
              className="surface-card flex items-center gap-3 p-3"
            >
              <ClientAvatar avatarUrl={c.avatar_url} name={c.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={c.name}>
                  {c.name ?? '—'}
                </p>
                {c.alias && (
                  <p className="truncate font-mono text-xs text-[var(--fg4)]">{c.alias}</p>
                )}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(c)}
                  disabled={mutating}
                  aria-label={`Снять клиента ${c.name ?? ''} с команды`}
                  className="rounded-md p-1.5 text-[var(--fg4)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] disabled:opacity-50 focus-ds"
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <AddClientsModal
          callerId={callerId}
          teamId={row.id}
          onClose={() => setAddOpen(false)}
          onAdd={async (ids) => {
            await assignClients(ids)
          }}
        />
      )}

      {confirmRemove && (
        <RemoveClientConfirm
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

function RemoveClientConfirm({ name, busy, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-client-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 id="remove-client-title" className="text-base font-semibold text-foreground">
          Снять {name ?? 'клиента'} с команды?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Клиент станет нераспределённым и его можно будет назначить другой команде.
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
            {busy ? 'Снимаем…' : 'Снять'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClientAvatar({ avatarUrl, name }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  }
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-sm font-semibold text-[var(--primary-ink)]"
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

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg4)]"
      viewBox="0 0 20 20"
      aria-hidden
    >
      <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
