import { useMemo, useState } from 'react'
import { Outlet, useOutletContext, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../useAuth.jsx'
import { useClientList } from '../hooks/useClientList.js'
import { usePlatforms } from '../hooks/usePlatforms.js'
import { useAgencies } from '../hooks/useAgencies.js'
import { ClientList } from '../components/clients/ClientList.jsx'
import { ClientFilterChips } from '../components/clients/ClientFilterChips.jsx'
import { EmptyZero } from '../components/clients/EmptyZero.jsx'
import { EmptyFilter } from '../components/clients/EmptyFilter.jsx'
import { DetailEmptyHint } from '../components/clients/DetailEmptyHint.jsx'
import { ClientDetailPanel } from '../components/clients/ClientDetailPanel.jsx'
import { CreateClientSlideOut } from '../components/clients/CreateClientSlideOut.jsx'
import { hasPermission } from '../lib/permissions.js'
import { MasterDetailLayout, ListPane } from '../components/shell/index.js'

const DEFAULT_FILTERS = { active: 'active', platformId: null, agencyId: null }

export function ClientListPage() {
  const { user } = useAuth()
  const { clientId } = useParams()
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
      list.push({
        label: filters.active === 'archived' ? 'Архив' : 'Все',
        onClear: () => setFilters((f) => ({ ...f, active: 'active' })),
      })
    }
    if (filters.platformId) {
      const platformName =
        platforms.find((p) => p.id === filters.platformId)?.name || 'Платформа'
      list.push({
        label: platformName,
        onClear: () => setFilters((f) => ({ ...f, platformId: null })),
      })
    }
    if (filters.agencyId) {
      const agencyName =
        agencies.find((a) => a.id === filters.agencyId)?.name || 'Агентство'
      list.push({
        label: agencyName,
        onClear: () => setFilters((f) => ({ ...f, agencyId: null })),
      })
    }
    return list
  }, [filters, platforms, agencies])

  const totalForTitle = counts?.all ?? 0

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Клиенты
      <span className="text-xs font-medium text-[var(--fg4)] tabular">
        {totalForTitle}
      </span>
    </span>
  )

  const createButtonNode = canCreate ? (
    <button
      type="button"
      onClick={() => setCreateOpen(true)}
      className="btn-primary text-xs px-2.5 py-1.5"
    >
      + Новый
    </button>
  ) : null

  const searchNode = <SearchInput value={search} onChange={setSearch} />

  const filtersNode = !isZeroEmpty ? (
    <ClientFilterChips
      value={filters}
      onChange={setFilters}
      platforms={platforms}
      agencies={agencies}
      counts={counts}
    />
  ) : null

  const listBody = isZeroEmpty ? (
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
  )

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={titleNode}
            search={searchNode}
            filters={filtersNode}
            createButton={createButtonNode}
          >
            {listBody}
          </ListPane>
        }
      >
        <Outlet context={{ rows, reload, callerId: user?.id }} />
      </MasterDetailLayout>

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
    </>
  )
}

// Index child route — shows the empty hint when no client is selected.
export function ClientDetailEmpty() {
  return <DetailEmptyHint />
}

// Detail child route — pulls clientId/tab from URL and shared data from outlet context.
export function ClientDetailRoute() {
  const { clientId, tab } = useParams()
  const { rows, reload, callerId } = useOutletContext()
  return (
    <ClientDetailPanel
      callerId={callerId}
      clientId={clientId}
      activeTab={tab || 'profile'}
      siblings={rows}
      onChanged={reload}
    />
  )
}

function SearchInput({ value, onChange }) {
  return (
    <label className="relative flex items-center">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--fg4)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по name / alias…"
        aria-label="Поиск клиентов"
        className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary focus-ds"
      />
    </label>
  )
}
