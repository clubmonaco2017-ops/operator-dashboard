import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUnassignedOperators } from '../../hooks/useUnassignedOperators.js'
import { initials } from '../../lib/clients.js'

/**
 * Модальное окно «Добавить оператора в команду».
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {number} props.teamId
 * @param {function} props.onClose
 * @param {function} props.onAdd — async (operatorId) => void
 */
export function AddMemberModal({ callerId, onClose, onAdd }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const { rows, loading } = useUnassignedOperators(callerId, debounced)

  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const searchRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    searchRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus?.()
    }
  }, [onClose])

  async function handleAdd(op) {
    if (busyId) return
    setBusyId(op.id)
    setError(null)
    try {
      await onAdd(op.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl max-h-[80vh]">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="add-member-title" className="text-base font-semibold text-foreground">
            Добавить оператора
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground"
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
              placeholder="Поиск оператора по имени или ref-коду…"
              aria-label="Поиск операторов"
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
                : 'Нет нераспределённых операторов.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((op) => (
                <li key={op.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={op.name} avatarUrl={op.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {op.name ?? `#${op.id}`}
                      </p>
                      {op.ref_code && (
                        <span className="font-mono text-xs text-muted-foreground tabular">
                          {op.ref_code}
                        </span>
                      )}
                    </div>
                    {op.alias && (
                      <p className="truncate text-xs text-[var(--fg4)]">{op.alias}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAdd(op)}
                    disabled={busyId !== null}
                  >
                    {busyId === op.id ? 'Добавляем…' : 'Добавить'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-border bg-muted/40 px-5 py-3 text-right">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Готово
          </Button>
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
      {[60, 70, 50, 65].map((w, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-2.5">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}

