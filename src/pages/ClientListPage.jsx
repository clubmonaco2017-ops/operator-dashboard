import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../useAuth.jsx'
import { useClientList } from '../hooks/useClientList.js'
import { usePlatforms } from '../hooks/usePlatforms.js'
import { useAgencies } from '../hooks/useAgencies.js'
import { Sidebar } from '../components/Sidebar.jsx'
import { ClientList } from '../components/clients/ClientList.jsx'
import { ClientFilterChips } from '../components/clients/ClientFilterChips.jsx'
import { EmptyZero } from '../components/clients/EmptyZero.jsx'
import { EmptyFilter } from '../components/clients/EmptyFilter.jsx'
import { DetailEmptyHint } from '../components/clients/DetailEmptyHint.jsx'
import { ClientDetailPanel } from '../components/clients/ClientDetailPanel.jsx'
import { CreateClientSlideOut } from '../components/clients/CreateClientSlideOut.jsx'
import { hasPermission } from '../lib/permissions.js'
import { pluralizeClients } from '../lib/clients.js'

const DEFAULT_FILTERS = { active: 'active', platformId: null, agencyId: null }

export function ClientListPage() {
  const { user, logout } = useAuth()
  const { clientId, tab } = useParams()
  const canCreate = hasPermission(user, 'manage_clients')

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { rows, counts, loading, error, reload } = useClientList(user?.id, {
    ...filters,
    search,
  })
  const { rows: platforms } = usePlatforms()
  const { rows: agencies } = useAgencies({ platformId: filters.platformId })

  const hasAnyFilter = useMemo(
    () =>
      filters.active !== 'active' ||
      filters.platformId !== null ||
      filters.agencyId !== null,
    [filters],
  )
  const hasSearch = search.trim().length > 0
  const isEmpty = !loading && !error && rows.length === 0
  const isZeroEmpty = isEmpty && !hasAnyFilter && !hasSearch
  const isFilterEmpty = isEmpty && (hasAnyFilter || hasSearch)

  const activeFilterChips = useMemo(() => {
    const list = []
    if (filters.active !== 'active') {
      list.push({ label: filters.active === 'archived' ? 'Архив' : 'Все', onClear: () => setFilters((f) => ({ ...f, active: 'active' })) })
    }
    if (filters.platformId) {
      const platformName = platforms.find((p) => p.id === filters.platformId)?.name || 'Платформа'
      list.push({ label: platformName, onClear: () => setFilters((f) => ({ ...f, platformId: null })) })
    }
    if (filters.agencyId) {
      const agencyName = agencies.find((a) => a.id === filters.agencyId)?.name || 'Агентство'
      list.push({ label: agencyName, onClear: () => setFilters((f) => ({ ...f, agencyId: null })) })
    }
    return list
  }, [filters, platforms, agencies])

  const totalForTitle = counts?.all ?? 0
  const detailIsOpen = !!clientId

  // 1024-px breakpoint: master-detail collapses to single panel (8.H).
  // When clientId is set on narrow screens — show detail; otherwise — master.
  const showMasterOnNarrow = !detailIsOpen
  const showDetailOnNarrow = detailIsOpen

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex flex-1">
        {/* Master panel */}
        <section
          className={[
            'flex flex-col border-r border-border bg-card',
            // На zero/filter empty + closed detail растягиваем master, иначе фиксируем 440px
            isZeroEmpty || isFilterEmpty ? 'flex-1' : 'lg:w-[440px] lg:shrink-0',
            // Narrow: показываем master только если detail закрыт (8.H mobile)
            !isZeroEmpty && !isFilterEmpty && (showMasterOnNarrow ? 'flex-1 lg:flex-initial' : 'hidden lg:flex'),
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Список клиентов"
        >
          <header className="flex items-center gap-3 px-5 pt-5 pb-3">
            <h1 className="flex items-baseline gap-2 text-xl font-bold text-foreground">
              Клиенты
              <span className="text-sm font-medium text-[var(--fg4)] tabular">
                {totalForTitle}
              </span>
            </h1>
            <div className="flex-1" />
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="btn-primary"
              >
                + Добавить{!detailIsOpen && !isEmpty ? '' : ' клиента'}
              </button>
            )}
          </header>

          {/* Search */}
          <div className="px-5 pb-3">
            <SearchInput value={search} onChange={setSearch} />
          </div>

          {/* Filter chips */}
          {!isZeroEmpty && (
            <div className="px-5 pb-3">
              <ClientFilterChips
                value={filters}
                onChange={setFilters}
                platforms={platforms}
                agencies={agencies}
                counts={counts}
              />
            </div>
          )}

          {/* Body: list / empty */}
          <div className="flex-1 overflow-auto">
            {isZeroEmpty ? (
              <EmptyZero canCreate={canCreate} onCreate={() => setCreateOpen(true)} />
            ) : isFilterEmpty ? (
              <EmptyFilter
                activeFilters={activeFilterChips}
                onResetAll={() => {
                  setFilters(DEFAULT_FILTERS)
                  setSearch('')
                }}
                searchQuery={hasSearch ? search.trim() : null}
                onClearSearch={() => setSearch('')}
              />
            ) : (
              <ClientList rows={rows} selectedId={clientId} loading={loading} error={error} />
            )}
          </div>

          {/* Footer counter */}
          {!loading && !error && rows.length > 0 && (
            <footer className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              <span className="tabular">{pluralizeClients(rows.length)}</span>
              {rows.length !== totalForTitle && (
                <span className="ml-1 text-[var(--fg4)] tabular">
                  из {totalForTitle}
                </span>
              )}
            </footer>
          )}
        </section>

        {/* Detail panel */}
        {!(isZeroEmpty || isFilterEmpty) && (
          <section
            className={[
              'flex-1 overflow-hidden bg-card',
              // 8.H: на узких экранах — показываем только если detail открыт
              showDetailOnNarrow ? 'flex' : 'hidden lg:flex',
            ].join(' ')}
            aria-label="Профиль клиента"
          >
            {detailIsOpen ? (
              <ClientDetailPanel
                callerId={user?.id}
                clientId={clientId}
                activeTab={tab || 'profile'}
                siblings={rows}
                onChanged={reload}
              />
            ) : (
              <DetailEmptyHint />
            )}
          </section>
        )}
      </main>

      {/* Create slide-out */}
      {createOpen && (
        <CreateClientSlideOut
          callerId={user?.id}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function SearchInput({ value, onChange }) {
  return (
    <label className="relative flex items-center">
      <Search aria-hidden className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--fg4)]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по name / alias…"
        aria-label="Поиск клиентов по имени или alias"
        className="w-full rounded-lg border border-border bg-card pl-9 pr-12 py-2 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary focus-ds"
      />
      <kbd className="pointer-events-none absolute right-3 rounded border border-border bg-muted px-1.5 py-px text-[10px] font-mono text-[var(--fg4)]">
        /
      </kbd>
    </label>
  )
}

