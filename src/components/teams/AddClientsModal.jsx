import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
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
  const searchRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    searchRef.current?.focus()
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-clients-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl max-h-[80vh]">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="add-clients-title" className="text-base font-semibold text-foreground">
            Назначить клиентов команде
          </h3>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Закрыть"
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-border px-5 py-3">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg4)]"
              aria-hidden
            />
            <input
              ref={searchRef}
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

        <footer className="flex items-center gap-3 border-t border-border bg-muted/40 px-5 py-3">
          <span className="text-xs text-muted-foreground tabular">
            Выбрано: {selected.size}
          </span>
          <div className="flex-1" />
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
            disabled={submitting || selected.size === 0}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {submitting
              ? 'Назначаем…'
              : selected.size > 0
                ? `Назначить ${pluralizeClients(selected.size)}`
                : 'Назначить'}
          </button>
        </footer>
      </div>
    </div>
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

