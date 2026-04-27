import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useCuratorship } from '../../hooks/useCuratorship.js'
import { initials } from '../../lib/clients.js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Модалка «Добавить операторов под куратора» (массово).
 * Использует `bulk_assign_curated_operators` с fail-all: если кто-то из
 * выбранных уже имеет куратора, RPC завалится с поимённым перечислением —
 * отображаем ошибку inline.
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {number} props.moderatorId
 * @param {function} props.onClose
 * @param {function} props.onAdded
 */
export function AddCuratedOperatorsModal({ callerId, moderatorId, onClose, onAdded }) {
  const { bulkAssign, mutating } = useCuratorship(callerId, moderatorId)

  const [allOperators, setAllOperators] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 200)
  const [selected, setSelected] = useState(() => new Set())
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('dashboard_users')
      .select('id, first_name, last_name, alias, email, ref_code, avatar_url')
      .eq('role', 'operator')
      .eq('is_active', true)
      .order('first_name')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setAllOperators([])
        } else {
          setAllOperators(data ?? [])
        }
      })
      .then(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return allOperators
    return allOperators.filter((o) => {
      const name = `${o.first_name ?? ''} ${o.last_name ?? ''}`.toLowerCase()
      return (
        name.includes(q) ||
        (o.alias ?? '').toLowerCase().includes(q) ||
        (o.email ?? '').toLowerCase().includes(q) ||
        (o.ref_code ?? '').toLowerCase().includes(q)
      )
    })
  }, [allOperators, debounced])

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (mutating || selected.size === 0) return
    setError(null)
    try {
      await bulkAssign(Array.from(selected))
      onAdded?.()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !mutating && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Добавить операторов</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border px-5 py-3">
          <label className="relative block">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg4)]"
              aria-hidden
            />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени, ref-коду или email…"
              aria-label="Поиск операторов"
              className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary"
            />
          </label>
        </div>

        {error && (
          <div
            className="border-b border-border bg-[var(--danger-soft)] px-5 py-2 text-xs text-[var(--danger-ink)]"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <ListSkeleton />
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm italic text-[var(--fg4)]">
              {debounced ? 'По запросу никого не найдено.' : 'Нет активных операторов.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((o) => {
                const name = opLabel(o)
                const isSelected = selected.has(o.id)
                return (
                  <li key={o.id}>
                    <label
                      className={[
                        'flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-muted/40 focus-within:bg-muted/40',
                        isSelected && 'bg-[var(--primary-soft)]/40',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(o.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                        aria-label={name}
                      />
                      <Avatar name={name} avatarUrl={o.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="truncate text-sm font-medium text-foreground" title={name}>
                            {name}
                          </p>
                          {o.ref_code && (
                            <span className="font-mono text-xs text-muted-foreground tabular">
                              {o.ref_code}
                            </span>
                          )}
                        </div>
                        {o.alias && (
                          <p className="truncate text-xs text-[var(--fg4)]">{o.alias}</p>
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
          <span className="text-xs text-muted-foreground">
            Выбрано: <span className="font-mono tabular">{selected.size}</span>
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => !mutating && onClose()}
              disabled={mutating}
            >
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={mutating || selected.size === 0}
            >
              {mutating ? 'Назначаем…' : `Назначить (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function useDebounce(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function opLabel(o) {
  const fullName = `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim()
  if (fullName) return fullName
  if (o.alias) return o.alias
  return o.email ?? `#${o.id}`
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
      {[60, 70, 50, 65, 60].map((w, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-2.5">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />
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
