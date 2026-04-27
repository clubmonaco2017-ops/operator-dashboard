import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUnassignedClients } from '../../hooks/useUnassignedClients.js'
import { initials, pluralizeClients } from '../../lib/clients.js'

/**
 * Модальное окно «Назначить клиентов команде» (multiselect).
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {function} props.onClose
 * @param {function} props.onAdd — async (clientIds: number[]) => void
 */
export function AddClientsModal({ callerId, onClose, onAdd }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const { rows, loading } = useUnassignedClients(callerId, debounced)

  const [selected, setSelected] = useState(() => new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (submitting || selected.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await onAdd(Array.from(selected))
      onClose()
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
          <DialogTitle>Назначить клиентов команде</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border px-5 py-3">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg4)]"
              aria-hidden
            />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск клиента по имени или alias…"
              aria-label="Поиск клиентов"
              className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary"
            />
          </label>
        </div>

        {error && (
          <div className="border-b border-border bg-[var(--danger-soft)] px-5 py-2 text-xs text-[var(--danger-ink)]" role="alert">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm italic text-[var(--fg4)]">
              {debounced
                ? 'По запросу никого не найдено.'
                : 'Нет нераспределённых клиентов.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((c) => {
                const checked = selected.has(c.id)
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-muted/40 focus-within:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-[var(--primary)]"
                        aria-label={`Выбрать ${c.name ?? ''}`}
                      />
                      <ClientAvatar avatarUrl={c.avatar_url} name={c.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground" title={c.name}>
                          {c.name ?? '—'}
                        </p>
                        {c.alias && (
                          <p className="truncate font-mono text-xs text-[var(--fg4)]">
                            {c.alias}
                          </p>
                        )}
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <span className="text-xs text-muted-foreground tabular">
            Выбрано: {selected.size}
          </span>
          <div className="flex items-center gap-2">
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
              disabled={submitting || selected.size === 0}
            >
              {submitting
                ? 'Назначаем…'
                : selected.size > 0
                  ? `Назначить ${pluralizeClients(selected.size)}`
                  : 'Назначить'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function useDebounce(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function ClientAvatar({ avatarUrl, name }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary-ink)]"
      aria-hidden
    >
      {initials(name ?? '?')}
    </div>
  )
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-busy="true">
      {[55, 70, 60, 50, 65].map((w, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-2.5">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}
